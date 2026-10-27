"""Token-bucket rate-limited async scrapers. No scraping at import time.

Parsing uses selectolax ONLY if importable; otherwise it falls back to
stdlib html.parser/regex. selectolax is deliberately NOT in requirements.txt
and a missing selectolax must never fail a build.

Fetch functions never raise on network failure: they return a
ScrapeResult (a list subclass) that compares equal to [] and carries the
error note on its `.error` attribute.
"""
from __future__ import annotations

import asyncio
import re
import time
from html.parser import HTMLParser
from typing import Iterable

SOURCES = {
    "nc_state": "https://plants.ces.ncsu.edu/plants/",
    "missouri": "https://www.missouribotanicalgarden.org/PlantFinder/PlantFinderSearchResults.aspx",
    "llifle": "http://llifle.com/Encyclopedia/SUCCULENTS/",
    "aspca": "https://www.aspca.org/pet-care/animal-poison-control/toxic-and-non-toxic-plants",
}

try:  # selectolax is optional; never a hard dependency.
    from selectolax.parser import HTMLParser as _SelectolaxParser  # type: ignore
except Exception:  # pragma: no cover - environment without selectolax
    _SelectolaxParser = None


class ScrapeResult(list):
    """A list of records that also carries an error note (or None)."""

    def __init__(self, records=None, error: str | None = None):
        super().__init__(records or [])
        self.error = error


class TokenBucket:
    """Async token bucket: `rate` tokens/sec, `burst` max stored tokens."""

    def __init__(self, rate: float, burst: float):
        if rate <= 0:
            raise ValueError("rate must be positive")
        self.rate = float(rate)
        self.burst = float(burst)
        self._tokens = float(burst)
        self._last = time.monotonic()
        self._lock = asyncio.Lock()

    async def acquire(self, n: float = 1.0) -> None:
        """Wait until n tokens are available, then consume them."""
        async with self._lock:
            while True:
                now = time.monotonic()
                elapsed = now - self._last
                self._last = now
                self._tokens = min(self.burst, self._tokens + elapsed * self.rate)
                if self._tokens >= n:
                    self._tokens -= n
                    return
                deficit = n - self._tokens
                await asyncio.sleep(deficit / self.rate)

    @property
    def tokens(self) -> float:
        return self._tokens


# One shared bucket per source (polite default: ~1 req / 2 s, burst 2).
BUCKETS: dict[str, TokenBucket] = {
    name: TokenBucket(rate=0.5, burst=2.0) for name in SOURCES
}


class _LinkParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links: list[dict] = []
        self._href: str | None = None
        self._buf: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._buf = []

    def handle_data(self, data):
        if self._href is not None:
            self._buf.append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._href is not None:
            text = re.sub(r"\s+", " ", "".join(self._buf)).strip()
            if text:
                self.links.append({"text": text, "href": self._href})
            self._href = None
            self._buf = []


def _parse_links(html: str) -> list[dict]:
    """Extract link text/href pairs, via selectolax if present else stdlib."""
    if _SelectolaxParser is not None:
        try:
            tree = _SelectolaxParser(html)
            out = []
            for node in tree.css("a"):
                text = re.sub(r"\s+", " ", node.text() or "").strip()
                href = node.attributes.get("href", "")
                if text:
                    out.append({"text": text, "href": href})
            return out
        except Exception:
            pass  # fall through to stdlib parser
    parser = _LinkParser()
    parser.feed(html)
    return parser.links


def _records_from_links(source: str, html: str, name_hint: str = "") -> list[dict]:
    seen: set[str] = set()
    records: list[dict] = []
    for link in _parse_links(html):
        text = link["text"]
        # Keep plausible plant names: at least two words, mostly letters.
        if len(text.split()) < 2:
            continue
        if not re.search(r"[A-Za-z]", text):
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        records.append({"source": source, "name": text, "url": link["href"],
                        "raw_text": text})
    return records


def parse_nc_state_html(html: str) -> list[dict]:
    return _records_from_links("nc_state", html)


def parse_missouri_html(html: str) -> list[dict]:
    return _records_from_links("missouri", html)


def parse_llifle_html(html: str) -> list[dict]:
    return _records_from_links("llifle", html)


def parse_aspca_html(html: str) -> list[dict]:
    """ASPCA list: also capture toxicity from nearby text when present."""
    records = _records_from_links("aspca", html)
    lowered = html.lower()
    for rec in records:
        name = rec["name"].lower()
        # Crude proximity heuristic: page-level marker only when the page
        # itself is the toxic list; individual toxicity needs a detail page.
        rec["toxicity_hint"] = "toxic" if "toxic to" in lowered else None
        _ = name
    return records


async def _fetch(source: str, url: str, parser, client=None) -> ScrapeResult:
    bucket = BUCKETS[source]
    try:
        await bucket.acquire()
        if client is not None:
            resp = await client.get(url, timeout=15.0)
            html = resp.text
        else:
            import httpx  # already in requirements.txt
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True,
                                         headers={"User-Agent": "PeteyPlant/1.0 (research)"}) as c:
                resp = await c.get(url)
                html = resp.text
        return ScrapeResult(parser(html))
    except Exception as exc:  # never raise on network failure
        return ScrapeResult([], error=f"{source}: {type(exc).__name__}: {exc}")


async def fetch_nc_state(client=None, url: str | None = None) -> ScrapeResult:
    return await _fetch("nc_state", url or SOURCES["nc_state"], parse_nc_state_html, client)


async def fetch_missouri(client=None, url: str | None = None) -> ScrapeResult:
    return await _fetch("missouri", url or SOURCES["missouri"], parse_missouri_html, client)


async def fetch_llifle(client=None, url: str | None = None) -> ScrapeResult:
    return await _fetch("llifle", url or SOURCES["llifle"], parse_llifle_html, client)


async def fetch_aspca(client=None, url: str | None = None) -> ScrapeResult:
    return await _fetch("aspca", url or SOURCES["aspca"], parse_aspca_html, client)


async def fetch_all(client=None) -> dict[str, ScrapeResult]:
    """Fetch all four sources concurrently (each bucket-limited)."""
    results = await asyncio.gather(
        fetch_nc_state(client), fetch_missouri(client),
        fetch_llifle(client), fetch_aspca(client))
    return dict(zip(SOURCES.keys(), results))


__all__ = ["TokenBucket", "ScrapeResult", "SOURCES", "BUCKETS",
           "fetch_nc_state", "fetch_missouri", "fetch_llifle", "fetch_aspca",
           "fetch_all", "parse_nc_state_html", "parse_missouri_html",
           "parse_llifle_html", "parse_aspca_html"]
