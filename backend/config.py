"""Provider configuration for Petey Plant.

Only Meta Muse open-weights provider names are used. There are no
OpenAI / Claude / Gemini / Copilot keys or calls anywhere in this backend.
Real Muse endpoints are not callable from this environment, so the
default MUSE_API_BASE="" selects the deterministic local fallback.

Header validation (compliance GAP-5): MUSE_MODEL_ID and
MUSE_CREATIVE_MODEL are validated against the spec's allowed value sets
at import; an out-of-set value falls back to the default with a printed
warning, so a misconfigured environment can never emit a non-compliant
verification header.

Dead-config note (audit cleanup): MUSE_API_BASE is currently unused —
no Muse HTTP call exists yet — and FALLBACK is always True because the
local deterministic fallback is the only provider path implemented.
Both are kept (env-configurable for a future live path) but main.py
reads config.FALLBACK instead of hardcoding True, so the fallback state
is declared in exactly one place.
"""
import os
import sys

_ALLOWED_MODELS = {"muse-glimmer-30b", "muse-spark-open"}
_ALLOWED_CREATIVE = {"muse-image", "muse-wonder"}


def _validated_env(name: str, default: str, allowed: set[str]) -> str:
    value = os.environ.get(name, default)
    if value not in allowed:
        print(
            f"[petey-config] WARNING: {name}={value!r} is not in {sorted(allowed)}; "
            f"falling back to default {default!r}.",
            file=sys.stderr,
        )
        return default
    return value


MUSE_MODEL_ID: str = _validated_env("MUSE_MODEL_ID", "muse-glimmer-30b", _ALLOWED_MODELS)
MUSE_CREATIVE_MODEL: str = _validated_env(
    "MUSE_CREATIVE_MODEL", "muse-image", _ALLOWED_CREATIVE
)
# Currently unused; local fallback is always used — no Muse HTTP call exists yet.
MUSE_API_BASE: str = os.environ.get("MUSE_API_BASE", "")
MODEL_PROVIDER: str = "Meta-Muse-Open-Weights"
FALLBACK: bool = True
