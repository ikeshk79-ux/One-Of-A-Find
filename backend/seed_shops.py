"""Seed the shops collection with the 13 verified Octavia Foundation stores scraped from
https://www.octaviafoundation.org.uk/charity_shops/find_a_shop_near_you plus the legacy
"West Hampstead" entry the user asked to keep.

Idempotent — reruns don't duplicate rows; existing rows keep their current state unless they
were seeded with a stale address/postcode (we re-overwrite only the verified columns).

TfL zones are drawn from the nearest tube/overground station's published fare zone. Boundary
cases are flagged with needs_zone_review=True so the master is prompted to double-check.
"""
import asyncio
import os
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

from lib.db import db  # noqa: E402
from models.shop import PricingRules, Shop  # noqa: E402

# Verified from the Octavia Foundation shop finder on 2026-10-14.
# zone values come from TfL's published fare zones for the nearest tube/overground station.
# needs_zone_review=True where the station straddles a zone boundary (ticketing counts both).
VERIFIED_SHOPS: list[dict] = [
    {
        "name": "Askew Road",
        "address": "76 Askew Road, London",
        "postcode": "W12 9BJ",
        "phone": "020 8740 4878",
        "nearest_station": "Shepherd's Bush Market",
        "zone": 2,
    },
    {
        "name": "Brompton Road",
        "address": "211 Brompton Road, London",
        "postcode": "SW3 2EJ",
        "phone": "020 7581 7987",
        "nearest_station": "Knightsbridge",
        "zone": 1,
    },
    {
        "name": "Chiswick High Road",
        "address": "294 Chiswick High Road, London",
        "postcode": "W4 1PA",
        "phone": "020 8747 8744",
        "nearest_station": "Turnham Green",
        "zone": 2,
        "needs_zone_review": True,  # Turnham Green is a Z2/Z3 boundary station
    },
    {
        "name": "Ealing",
        "address": "40 High Street Ealing, London",
        "postcode": "W5 5DB",
        "phone": "020 8567 8003",
        "nearest_station": "Ealing Broadway",
        "zone": 3,
    },
    {
        "name": "Finchley Road",
        "address": "179 Finchley Road, London",
        "postcode": "NW3 6LB",
        "phone": "020 7624 9053",
        "nearest_station": "Finchley Road",
        "zone": 2,
    },
    {
        "name": "Fulham Road",
        "address": "287 Fulham Road, London",
        "postcode": "SW10 9PZ",
        "phone": "020 7352 9923",
        "nearest_station": "Earl's Court",
        "zone": 2,
        "needs_zone_review": True,  # Earl's Court is a Z1/Z2 boundary station
    },
    {
        "name": "Hampstead",
        "address": "33 South End Road, London",
        "postcode": "NW3 2PY",
        "phone": "020 7435 3453",
        "nearest_station": "Hampstead Heath",
        "zone": 2,
    },
    {
        "name": "Kentish Town",
        "address": "213-215 Kentish Town Road, London",
        "postcode": "NW5 2JU",
        "phone": "020 7482 3519",
        "nearest_station": "Kentish Town",
        "zone": 2,
    },
    {
        "name": "King's Road",
        "address": "303 Kings Road, London",
        "postcode": "SW3 5EP",
        "phone": "020 7352 8606",
        "nearest_station": "Sloane Square",
        "zone": 1,
    },
    {
        "name": "Olympia",
        "address": "266 High Street Kensington, London",
        "postcode": "W8 6ND",
        "phone": "020 7602 6043",
        "nearest_station": "High Street Kensington",
        "zone": 1,
    },
    {
        "name": "South Kensington",
        "address": "3 Bute Street, London",
        "postcode": "SW7 3EY",
        "phone": "020 7581 9458",
        "nearest_station": "South Kensington",
        "zone": 1,
    },
    {
        "name": "Tooting",
        "address": "36 High Street Tooting, London",
        "postcode": "SW17 0RG",
        "phone": "020 8767 3431",
        "nearest_station": "Tooting Broadway",
        "zone": 3,
    },
    {
        "name": "Victoria",
        "address": "58 Wilton Road, Victoria, London",
        "postcode": "SW1V 1DE",
        "phone": "020 7821 5329",
        "nearest_station": "Victoria",
        "zone": 1,
    },
    # Legacy entry kept by user request. Not on Octavia's current public list but existing
    # inventory references it; mapping tied to Hampstead Heath station (Z2) per the user.
    {
        "name": "West Hampstead",
        "address": "",
        "postcode": "",
        "phone": "",
        "nearest_station": "Hampstead Heath",
        "zone": 2,
    },
]


# Only re-overwrite these columns on an existing row — admin edits to zone/disabled/review
# flags are left alone so re-seeding is safe after the master has triaged the list.
VERIFIED_FIELDS = ("address", "postcode", "phone", "nearest_station")


async def seed() -> None:
    now = datetime.now(timezone.utc)
    created = updated = kept = 0
    for data in VERIFIED_SHOPS:
        existing = await db.shops.find_one({"name": data["name"]})
        if existing:
            update = {k: data.get(k, "") for k in VERIFIED_FIELDS}
            update["updated_at"] = now
            # Only set zone/needs_zone_review on the FIRST seed (when the row has no zone yet),
            # so re-runs don't overwrite a master's manual zone correction.
            if existing.get("zone") is None and not existing.get("outside_zones"):
                update["zone"] = data.get("zone")
                update["needs_zone_review"] = data.get("needs_zone_review", False)
            res = await db.shops.update_one({"id": existing["id"]}, {"$set": update})
            if res.modified_count:
                updated += 1
            else:
                kept += 1
            continue
        shop = Shop(
            name=data["name"],
            address=data.get("address", ""),
            postcode=data.get("postcode", ""),
            phone=data.get("phone", ""),
            zone=data.get("zone"),
            nearest_station=data.get("nearest_station", ""),
            needs_zone_review=data.get("needs_zone_review", False),
        )
        await db.shops.insert_one(shop.model_dump())
        created += 1

    # Seed pricing-rules v1 if the collection is empty so the preview endpoint has something
    # to return before any master opens the admin screen.
    if not await db.pricing_rules.find_one():
        await db.pricing_rules.insert_one(PricingRules().model_dump())

    print(f"shops seed → created {created} / updated {updated} / kept {kept}")


if __name__ == "__main__":
    asyncio.run(seed())
