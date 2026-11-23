"""Bounded in-memory photo identification endpoints for Petey Lens."""
import asyncio
from io import BytesIO
import logging
from threading import BoundedSemaphore
from typing import Annotated, Literal
from uuid import UUID, uuid4

import numpy as np
from fastapi import APIRouter, HTTPException, Request, Response
from PIL import Image, ImageOps
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from services.lens_model import released_model
from services.lens_taxonomy import LAUNCH_SPECIES, TAXONOMY_VERSION, MatchStatus, TaxonomicRank, map_label

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/lens", tags=["lens"])
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_PIXELS = 24_000_000
MAX_IMAGE_EDGE = 8192
MIN_IMAGE_EDGE = 160
MAX_IMAGE_ASPECT_RATIO = 3.5
UPLOAD_TIMEOUT_SECONDS = 15
INFERENCE_TIMEOUT_SECONDS = 12
_JOB_SLOTS = BoundedSemaphore(2)
IMAGE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
UNAVAILABLE_MESSAGE = "Photo matching isn’t available here yet. You can still choose a plant by name."


class LensAvailability(BaseModel):
    status: Literal["available", "unavailable"]
    model_version: str | None
    taxonomy_version: str = TAXONOMY_VERSION
    message: str


class LensCandidate(BaseModel):
    species_key: str | None
    original_label: str
    scientific_name: str | None
    common_name: str | None
    taxonomic_rank: TaxonomicRank
    match_status: MatchStatus
    taxonomy_source: str | None
    confidence: Annotated[float, Field(ge=0, le=1)] | None = None


class LensResult(BaseModel):
    request_id: UUID
    model_version: str | None = None
    taxonomy_version: str = TAXONOMY_VERSION
    status: Literal["possible_matches", "need_another_photo", "unavailable"]
    candidates: list[LensCandidate] = Field(default_factory=list)
    another_photo_recommended: bool = False
    limitations: list[str]
    fallback_used: Literal[False] = False


def _check_content_length(request: Request) -> None:
    content_length = request.headers.get("content-length")
    if content_length is None:
        return
    try:
        length = int(content_length)
    except ValueError as error:
        raise HTTPException(400, "Invalid photo content length.") from error
    if length < 0:
        raise HTTPException(400, "Invalid photo content length.")
    if length > MAX_IMAGE_BYTES:
        raise HTTPException(413, "Choose a photo smaller than 8 MB.")


async def _photo_body(request: Request) -> bytes:
    photo = bytearray()
    async for chunk in request.stream():
        if len(photo) + len(chunk) > MAX_IMAGE_BYTES:
            raise HTTPException(413, "Choose a photo smaller than 8 MB.")
        photo.extend(chunk)
    if not photo:
        raise HTTPException(400, "Choose a photo to continue.")
    return bytes(photo)


def decode_photo(body: bytes, expected_format: str) -> Image.Image:
    try:
        stream = BytesIO(body)
        with Image.open(stream) as source:
            if source.format != expected_format or getattr(source, "is_animated", False):
                raise HTTPException(415, "Choose a still JPEG, PNG or WebP photo matching its file type.")
            if source.mode == "CMYK":
                raise HTTPException(415, "Choose an RGB photo instead of a print-color image.")
            width, height = source.size
            if width * height > MAX_IMAGE_PIXELS or max(width, height) > MAX_IMAGE_EDGE:
                raise HTTPException(413, "Choose a photo under 24 megapixels and 8,192 pixels per side.")
            if min(width, height) < MIN_IMAGE_EDGE:
                raise HTTPException(400, "Choose a photo at least 160 pixels wide and tall.")
            if max(width, height) / min(width, height) > MAX_IMAGE_ASPECT_RATIO:
                raise HTTPException(400, "Try a photo with more of the plant in view.")
            source.verify()
        with Image.open(stream) as source:
            photo = ImageOps.exif_transpose(source).convert("RGB")
        photo.info.clear()
        return photo
    except Image.DecompressionBombError as error:
        raise HTTPException(413, "Choose a smaller photo.") from error
    except (ValueError, SyntaxError, EOFError, OSError) as error:
        raise HTTPException(400, "That photo couldn’t be read. Try another JPEG, PNG or WebP photo.") from error


def _abstain(request_id: UUID, model_version: str, hint: str) -> LensResult:
    return LensResult(
        request_id=request_id, model_version=model_version, status="need_another_photo",
        another_photo_recommended=True, limitations=[hint],
    )


def _identify_photo(request_id: UUID, body: bytes, expected_format: str) -> LensResult:
    photo = decode_photo(body, expected_format)
    try:
        release = released_model()
        if release is None:
            return LensResult(request_id=request_id, status="unavailable", limitations=[UNAVAILABLE_MESSAGE])
        model, spec = release
        try:
            scores = model.probabilities(photo)
        except Exception as error:
            logger.warning("Petey Lens inference failed (%s)", type(error).__name__)
            raise HTTPException(503, "Photo matching had a temporary problem. Try again or choose by name.") from error
    finally:
        photo.close()
    ranking = np.argsort(-scores, kind="stable")
    top, runner_up = ranking[:2]
    if map_label(spec.labels[top]).species_key not in LAUNCH_SPECIES:
        return _abstain(request_id, spec.model_version, "This plant may be outside Lens’s current coverage. Try a full-plant photo or choose by name.")
    if scores[top] < spec.acceptance_threshold or scores[top] - scores[runner_up] < spec.margin:
        return _abstain(request_id, spec.model_version, "Try a sharper photo showing the whole plant and how the leaves attach to the stem.")
    candidates = []
    for index in ranking[:3]:
        label = spec.labels[index]
        taxon = map_label(label)
        if taxon.species_key not in LAUNCH_SPECIES:
            continue
        candidates.append(LensCandidate(
            original_label=label, species_key=taxon.species_key, scientific_name=taxon.scientific_name,
            common_name=taxon.common_name, taxonomic_rank=taxon.taxonomic_rank, match_status=taxon.match_status,
            taxonomy_source=taxon.source, confidence=float(scores[index]) if index == top else None,
        ))
    return LensResult(
        request_id=request_id, model_version=spec.model_version, status="possible_matches", candidates=candidates,
        limitations=["Compare leaves and stems before confirming. A photo may miss features that distinguish similar plants."],
    )


@router.get("/status", response_model=LensAvailability)
def lens_status(response: Response) -> LensAvailability:
    response.headers["Cache-Control"] = "no-store"
    release = released_model()
    if release is None:
        return LensAvailability(status="unavailable", model_version=None, message=UNAVAILABLE_MESSAGE)
    return LensAvailability(status="available", model_version=release[1].model_version, message="Photo matching is available for eight supported houseplants.")


def _release_job(task: asyncio.Task) -> None:
    _JOB_SLOTS.release()
    if not task.cancelled():
        task.exception()


@router.post(
    "/identify", response_model=LensResult,
    openapi_extra={"requestBody": {"required": True, "content": {mime: {"schema": {"type": "string", "format": "binary"}} for mime in IMAGE_TYPES}}},
)
async def identify(request: Request, response: Response) -> LensResult:
    response.headers["Cache-Control"] = "no-store"
    mime = request.headers.get("content-type", "").partition(";")[0].strip().lower()
    expected_format = IMAGE_TYPES.get(mime)
    if expected_format is None:
        raise HTTPException(415, "Send a JPEG, PNG or WebP photo.")
    _check_content_length(request)
    if not _JOB_SLOTS.acquire(blocking=False):
        raise HTTPException(503, "Photo matching is busy. Try again in a moment.", headers={"Retry-After": "3"})
    try:
        body = await asyncio.wait_for(_photo_body(request), UPLOAD_TIMEOUT_SECONDS)
    except TimeoutError as error:
        _JOB_SLOTS.release()
        raise HTTPException(408, "The photo took too long to upload. Try again with a smaller photo.") from error
    except BaseException:
        _JOB_SLOTS.release()
        raise
    task = asyncio.create_task(run_in_threadpool(_identify_photo, uuid4(), body, expected_format))
    task.add_done_callback(_release_job)
    try:
        return await asyncio.wait_for(asyncio.shield(task), INFERENCE_TIMEOUT_SECONDS)
    except TimeoutError as error:
        raise HTTPException(503, "Photo matching took too long. Try again or choose by name.") from error
