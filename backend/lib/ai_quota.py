"""Server-side quota for AI-backed endpoints.

Why: `/api/appraise` and `/api/inventory/{id}/blurb` call Gemini via the Emergent LLM key —
each request is a billable, large (up to ~12 MB base64 images) third-party call. The endpoints
require a valid session, but registration is behind a shared shop password that is widely known
inside the shop network, so any staff member can register and burn through the budget. We rate-
limit them with a per-user daily quota plus a short burst window.

Design:
- Daily quota: `AI_DAILY_LIMIT` calls per volunteer per UTC day. Enforced via a Mongo document
  per (username, bucket) with a TTL index so expired days drop out automatically.
- Short burst: last-N-seconds window via an in-memory token bucket (per worker). Fine for a
  single-replica deployment; a multi-replica rollout would want to migrate this to Mongo too.
- 429 "AI quota reached" is a deliberate, non-leaking message — doesn't disclose which cap hit.
"""

from __future__ import annotations

import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

from fastapi import HTTPException

from lib.db import db

# Daily per-user cap. Overridable via env for local load tests. Default sized for a busy till —
# 60 appraisals or blurbs per volunteer per day is more than any real volunteer workflow needs.
AI_DAILY_LIMIT = int(os.environ.get("AI_DAILY_LIMIT", "60"))

# Burst limiter: at most N requests per rolling window per user. Caps a frantic retry loop or an
# automated bot script before it hits the daily cap.
AI_BURST_WINDOW_SECONDS = 10
AI_BURST_LIMIT = 5

# In-memory sliding window per username. Lost on restart — acceptable because the daily cap is
# the durable guarantee and the burst limit is a smoothing layer.
_recent: dict[str, deque[float]] = defaultdict(deque)


def _today_bucket() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def enforce_ai_quota(username: str | None) -> None:
    """Raise HTTPException(429) if the caller has run out of daily or burst budget.

    The caller is expected to be a logged-in volunteer (routes depend on `require_session`),
    so a missing username is a programmer error — we count it under 'anonymous' to keep the
    endpoint still protected rather than silently bypassed."""
    user = username or "anonymous"

    # ─── Burst (in-memory sliding window) ─────────────────────────────────────
    # Reserve the slot synchronously BEFORE any await. If we only append after the Mongo call,
    # concurrent requests race past the `len(dq) >= AI_BURST_LIMIT` check (all read the same
    # pre-append state) and the burst cap becomes a no-op. Append-before-await closes the TOCTOU
    # window at the cost of a bounced timestamp if the daily check later rejects.
    now = time.monotonic()
    dq = _recent[user]
    cutoff = now - AI_BURST_WINDOW_SECONDS
    while dq and dq[0] < cutoff:
        dq.popleft()
    if len(dq) >= AI_BURST_LIMIT:
        # Deliberately generic — a well-behaved till never hits this.
        raise HTTPException(status_code=429, detail="Too many AI requests — please wait a moment")
    dq.append(now)

    # ─── Daily (Mongo, TTL expiring) ──────────────────────────────────────────
    bucket = _today_bucket()
    try:
        doc = await db.ai_quota.find_one_and_update(
            {"username": user, "bucket": bucket},
            {
                "$inc": {"count": 1},
                # Set expires_at to the end-of-day UTC + a day of grace; the TTL index purges after.
                "$setOnInsert": {
                    "expires_at": datetime.now(timezone.utc).replace(hour=23, minute=59, second=59, microsecond=0),
                },
            },
            upsert=True,
            return_document=True,  # ReturnDocument.AFTER
        )
    except Exception:
        # If Mongo is unavailable, roll back the burst slot so a transient DB blip doesn't
        # eat the user's rate-limit allowance for the next 10 seconds.
        if dq and dq[-1] == now:
            dq.pop()
        raise
    count = int(doc.get("count", 0)) if doc else 1
    if count > AI_DAILY_LIMIT:
        # Undo the increment and the burst slot so we don't bake the over-limit count into
        # tomorrow's analytics or hold a slot the user never got to use.
        await db.ai_quota.update_one(
            {"username": user, "bucket": bucket},
            {"$inc": {"count": -1}},
        )
        if dq and dq[-1] == now:
            dq.pop()
        raise HTTPException(status_code=429, detail="Daily AI quota reached — try again tomorrow")
