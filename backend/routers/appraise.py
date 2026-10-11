import json
import logging
import os
import re
import uuid

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import require_session
from models.appraisal import AppraiseRequest, Appraisal

router = APIRouter(tags=["appraise"])
logger = logging.getLogger(__name__)

CATEGORIES = [
    "Books",
    "Children",
    "Homewear",
    "Jewellery",
    "Media (DVD/CD)",
    "Men's accessories",
    "Men's general",
    "Women's accessories",
    "Women's dresses",
    "Women's jackets/coats",
    "Women's knitwear",
    "Women's shoes",
    "Women's skirts",
    "Women's tops",
    "Women's trousers",
]
FALLBACK_CATEGORY = "Homewear"

# Valid item condition grades, best→worst — mirror of frontend CONDITION_OPTIONS in src/lib/types.ts.
CONDITIONS = [
    "New with tags",
    "New without tags",
    "Excellent",
    "Very good",
    "Good",
    "Fair",
    "Poor/for repair",
]

SYSTEM = (
    "You are a senior second-hand goods appraiser for a UK charity shop chain called "
    "'One Of A Find'. You look at a photo of a donated item and (when provided) a photo of "
    "its brand label, identify the item precisely, and estimate pricing in GBP. "
    "Always answer with a single JSON object and nothing else."
)

PROMPT = """Appraise this donated item.

Return STRICT JSON with exactly these keys:
{
  "title": "short item name, max 60 chars",
  "brand": "brand name, or 'Unbranded'",
  "category": "MUST be exactly one of the allowed categories listed below (verbatim)",
  "description": "2-3 sentence resale description mentioning materials, colour, notable details",
  "condition": "one of: New with tags, New without tags, Excellent, Very good, Good, Fair, Poor/for repair",
  "is_electrical": boolean (true ONLY if this is a mains-powered or battery-charged electrical appliance that would require a PAT safety test before resale — e.g. kettles, lamps, toasters, hairdryers, radios; false for clothing, books, decor, etc.),
  "peak_retail_price": number (highest original RRP in GBP this item sold for new),
  "market_average_price": number (typical current second-hand market price in GBP),
  "confidence": "one of: High, Medium, Low",
  "rationale": "1-2 sentences explaining the pricing, noting these are estimates",
  "resale_blurb": "a warm, ready-to-paste eBay/Vinted listing description in first-person charity-shop voice (3-5 sentences) covering the brand, condition, materials/colour and why it's a great buy, ending with 3-5 relevant hashtags"
}
Use plain numbers (no currency symbols). Never return null.
"""

PROMPT += "\nAllowed categories (pick the single best fit, copy exactly): " + ", ".join(CATEGORIES) + "."

FENCE = re.compile(r"```(?:json)?|```")


def _b64(raw: str) -> str:
    return raw.split(",", 1)[1] if raw.startswith("data:") else raw


@router.post("/appraise", response_model=Appraisal)
async def appraise(body: AppraiseRequest, _: bool = Depends(require_session)):
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI key not configured")

    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    chat = LlmChat(
        api_key=api_key,
        session_id=f"appraise-{uuid.uuid4()}",
        system_message=SYSTEM,
    ).with_model("gemini", "gemini-3-flash-preview")

    # Google Search grounding lifts appraisal confidence by letting Gemini pull real
    # comparable listings (Vinted/eBay/Depop/retailer archives) while it thinks. If the
    # emergentintegrations build in this pod can't attach the tool for any reason, we fall
    # back to the ungrounded chat below without blocking the user.
    try:
        chat = chat.with_tools([{"googleSearch": {}}])
    except Exception:  # noqa: BLE001
        logger.warning("googleSearch grounding unavailable; falling back to ungrounded appraisal", exc_info=True)

    images = [ImageContent(image_base64=_b64(body.item_image))]
    if body.label_image:
        images.append(ImageContent(image_base64=_b64(body.label_image)))
    for extra in body.extra_images:
        images.append(ImageContent(image_base64=_b64(extra)))

    text = PROMPT
    if body.label_image:
        text += "\nThe first image is the item; the second image is its brand label."
    if body.extra_images:
        text += (
            f"\nThere are {len(body.extra_images)} additional close-up detail photo(s) showing "
            "damage, wear, or hallmarks — factor these into the condition and pricing."
        )
    if body.notes:
        text += f"\nVolunteer notes: {body.notes}"

    def _parse_appraisal(raw_text: str) -> dict:
        """Extract the appraisal JSON object from the model response, tolerating any
        pre/post prose, code fences, or grounding citations the model may interleave."""
        cleaned = FENCE.sub("", str(raw_text)).strip()
        # First try: a straight brace-span extraction (handles the common grounded case where
        # Gemini writes "Based on Vinted comparables: {...}" or wraps the JSON in prose).
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end != -1:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
        # Second try: scan for a balanced {...} block (defends against stray trailing braces
        # inside grounding citation blobs that broke the simple find/rfind window).
        depth = 0
        obj_start = -1
        for i, ch in enumerate(cleaned):
            if ch == "{":
                if depth == 0:
                    obj_start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and obj_start != -1:
                    try:
                        return json.loads(cleaned[obj_start : i + 1])
                    except json.JSONDecodeError:
                        obj_start = -1
                        continue
        raise ValueError("could not extract a JSON object from the model response")

    def _run_ungrounded() -> "asyncio.Future":  # type: ignore[name-defined]
        fallback = LlmChat(
            api_key=api_key,
            session_id=f"appraise-{uuid.uuid4()}",
            system_message=SYSTEM,
        ).with_model("gemini", "gemini-3-flash-preview")
        return fallback.send_message(UserMessage(text=text, file_contents=images))

    try:
        raw = await chat.send_message(UserMessage(text=text, file_contents=images))
    except Exception as exc:  # noqa: BLE001
        # Grounded call failed — common cause is the Gemini provider rejecting googleSearch
        # on a particular key tier. Retry once without the tool so the volunteer still gets
        # an appraisal (lower confidence, but better than a 502).
        logger.warning("grounded appraisal failed, retrying ungrounded", exc_info=exc)
        try:
            raw = await _run_ungrounded()
        except Exception as exc2:  # noqa: BLE001
            logger.exception("appraisal failed")
            raise HTTPException(status_code=502, detail="AI appraisal failed. Please try again.") from exc2

    try:
        data = _parse_appraisal(raw)
    except ValueError:
        # Grounding sometimes makes Gemini answer in citation prose with no usable JSON object.
        # Retry once ungrounded (stricter JSON adherence) before giving up on the volunteer.
        logger.warning("grounded appraisal was unparseable, retrying ungrounded")
        try:
            data = _parse_appraisal(await _run_ungrounded())
        except Exception as exc:  # noqa: BLE001
            logger.exception("appraisal response unparseable")
            raise HTTPException(status_code=502, detail="AI returned an unreadable response") from exc

    def num(key: str) -> float:
        try:
            return round(float(data.get(key) or 0), 2)
        except (TypeError, ValueError):
            return 0.0

    peak = num("peak_retail_price")
    avg = num("market_average_price") or round(peak * 0.4, 2)
    # Charity price = the typical second-hand market price, capped at 50% of the original RRP so an
    # optimistic market estimate can't overshoot, then rounded to the nearest 50p for tidy tags.
    base = min(avg, peak * 0.5) if peak > 0 else avg
    recommended = round(base * 2) / 2

    category = str(data.get("category") or "").strip()
    if category not in CATEGORIES:
        category = FALLBACK_CATEGORY

    return Appraisal(
        title=str(data.get("title") or "Donated item")[:80],
        brand=str(data.get("brand") or "Unbranded"),
        category=category,
        description=str(data.get("description") or ""),
        condition=str(data.get("condition") or "Good"),
        is_electrical=bool(data.get("is_electrical")),
        peak_retail_price=peak,
        market_average_price=avg,
        recommended_price=recommended,
        confidence=str(data.get("confidence") or "Medium"),
        rationale=str(data.get("rationale") or "Estimated from visual identification."),
        resale_blurb=str(data.get("resale_blurb") or "")[:1500],
    )


# Tone → style guidance for the "redraft listing" action on the Tag page.
BLURB_SYSTEM = (
    "You are a copywriter for a UK charity shop chain called 'One Of A Find'. You write short, "
    "compelling second-hand resale listings for eBay and Vinted. Reply with the listing text only "
    "— plain prose, no JSON, no markdown, no headings, no quotes."
)

TONE_GUIDE = {
    "warm": "warm and friendly charity-shop voice",
    "concise": "short and punchy — two sentences maximum, straight to the point",
    "luxury": "elevated, boutique tone emphasising quality, craftsmanship and exclusivity",
    "playful": "fun, upbeat and playful with a little personality",
}


async def draft_blurb(
    *,
    title: str,
    brand: str,
    category: str,
    condition: str,
    description: str,
    tone: str = "warm",
) -> str:
    """Re-draft a ready-to-paste eBay/Vinted listing (text-only) in the requested tone."""
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI key not configured")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = LlmChat(
        api_key=api_key,
        session_id=f"blurb-{uuid.uuid4()}",
        system_message=BLURB_SYSTEM,
    ).with_model("gemini", "gemini-3-flash-preview")

    style = TONE_GUIDE.get(tone, TONE_GUIDE["warm"])
    prompt = (
        "Write a ready-to-paste eBay/Vinted listing description for this pre-owned item.\n"
        f"Tone: {style}.\n"
        "Cover the brand, condition, materials/colour and why it's a great buy, and end with 3-5 "
        "relevant hashtags. Keep it to 3-5 sentences unless the tone calls for shorter. "
        "Return ONLY the description text — no preamble, labels or quotes.\n\n"
        f"Item: {title}\nBrand: {brand}\nCategory: {category}\nCondition: {condition}\n"
        f"Details: {description}"
    )
    try:
        raw = await chat.send_message(UserMessage(text=prompt))
    except Exception as exc:  # noqa: BLE001
        logger.exception("blurb draft failed")
        raise HTTPException(status_code=502, detail="AI draft failed. Please try again.") from exc

    return FENCE.sub("", str(raw)).strip()[:1500]
