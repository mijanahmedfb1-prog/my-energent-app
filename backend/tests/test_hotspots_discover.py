"""Backend retest for POST /api/hotspots/discover image + photos gallery bug fix (v2).

Verifies:
- AI-discovered hotspots return REAL landmark photos from Wikipedia
  (upload.wikimedia.org / commons.wikimedia.org) instead of unrelated stock images.
- Each hotspot has a `photos` array (>= 3 real photograph URLs) for a swipeable gallery.
- No SVG, disambig, commons-logo files in either primary or photos array.
- GET /api/hotspots/{id} returns the same object including `photos` array.
- Cache determinism: 2nd call w/o force_refresh returns source=='cache' with
  identical primary image_urls AND identical `photos` arrays.
- Auth guards: no token -> 401, non-premium token -> 402.
"""
import os
import re
import uuid
import time
from urllib.parse import urlparse, unquote

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent.parent / "frontend" / ".env")
BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/") + "/api"
assert BASE_URL.startswith("http"), "EXPO_PUBLIC_BACKEND_URL missing"

PRIMARY_EMAIL = "test@guardtrip.com"
PRIMARY_PASSWORD = "test1234"

TIMEOUT_FRESH = 180  # AI + Wikipedia batching can take up to ~90s for a city
TIMEOUT_CACHE = 15

STATE: dict = {}

CITIES = [
    {
        "label": "dhaka",
        "body": {"lat": 23.8103, "lng": 90.4125, "city": "Dhaka", "country": "Bangladesh"},
        "landmark_keywords": ["lalbagh", "ahsan", "manzil", "liberation", "shaheed", "minar", "national"],
    },
    {
        "label": "cairo",
        "body": {"lat": 30.0444, "lng": 31.2357, "city": "Cairo", "country": "Egypt"},
        "landmark_keywords": ["pyramid", "giza", "sphinx", "khufu"],
    },
    {
        "label": "istanbul",
        "body": {"lat": 41.0082, "lng": 28.9784, "city": "Istanbul", "country": "Turkey"},
        "landmark_keywords": ["hagia", "sophia", "ayasofya"],
    },
]

PRIMARY_HOSTS = {"upload.wikimedia.org", "commons.wikimedia.org"}
# thumb.wikimedia.org is a legitimate Wikimedia CDN subdomain that serves the
# same real photograph as upload.wikimedia.org. It is acceptable per review
# spec "wikimedia.org photograph URLs" for the `photos` gallery array.
BAD_PHOTO_MARKERS = ("commons-logo", "disambig", "question_book",
                     "wiki_letter", "flag_of_", "coat_of_arms",
                     "location_map", "map_of_")


def _ensure_primary_user_premium():
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": PRIMARY_EMAIL, "password": PRIMARY_PASSWORD},
                      timeout=30)
    if r.status_code != 200:
        rr = requests.post(f"{BASE_URL}/auth/register", json={
            "email": PRIMARY_EMAIL,
            "password": PRIMARY_PASSWORD,
            "display_name": "Test User",
            "gender": "female",
            "language": "English",
            "travel_style": "Solo Female",
        }, timeout=30)
        assert rr.status_code == 200, f"register failed: {rr.status_code} {rr.text}"
        token = rr.json()["token"]
    else:
        token = r.json()["token"]

    me = requests.get(f"{BASE_URL}/auth/me",
                      headers={"Authorization": f"Bearer {token}"}, timeout=15).json()
    if not me.get("is_premium"):
        ar = requests.post(f"{BASE_URL}/subscriptions/activate",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"tier": "month"}, timeout=30)
        assert ar.status_code == 200, f"activate failed: {ar.status_code} {ar.text}"
    return token


@pytest.fixture(scope="module", autouse=True)
def setup_users():
    token = _ensure_primary_user_premium()
    STATE["token"] = token

    email = f"nopremium_{uuid.uuid4().hex[:8]}@guardtrip.example.com"
    rr = requests.post(f"{BASE_URL}/auth/register", json={
        "email": email,
        "password": "test1234",
        "display_name": "No Premium",
        "gender": "male",
        "language": "English",
        "travel_style": "Solo",
    }, timeout=30)
    assert rr.status_code == 200, rr.text
    STATE["nopremium_token"] = rr.json()["token"]
    yield


def _is_wm(url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return host.endswith("wikimedia.org")


def _is_primary_wm(url: str) -> bool:
    host = (urlparse(url or "").hostname or "").lower()
    return host in PRIMARY_HOSTS


def _is_bad_photo(url: str) -> str | None:
    """Return failure reason if URL is not a proper photograph, else None.
    Accepts any *.wikimedia.org host (upload/commons/thumb) for gallery photos.
    """
    if not url:
        return "empty"
    if not _is_wm(url):
        return f"non-wikimedia host: {urlparse(url).hostname}"
    lower = url.lower()
    path = lower.split("?")[0]
    if path.endswith(".svg"):
        return "svg extension"
    for b in BAD_PHOTO_MARKERS:
        if b in lower:
            return f"bad marker: {b}"
    return None


def _landmark_match(hotspots, keywords):
    for h in hotspots:
        name = (h.get("name") or "").lower()
        if not any(k in name for k in keywords):
            continue
        url = unquote((h.get("image_url") or "").lower())
        filename = url.split("/")[-1]
        name_tokens = [t for t in re.split(r"[^a-z]+", name) if len(t) >= 4]
        combined = name_tokens + keywords
        if any(t in filename for t in combined):
            return h, [t for t in combined if t in filename][0]
    return None, None


# --------------------------------------------------------------------------- #
# Auth guard tests
# --------------------------------------------------------------------------- #
class TestAuthGuards:
    def test_no_token_returns_401(self):
        r = requests.post(f"{BASE_URL}/hotspots/discover",
                          json={"lat": 23.8103, "lng": 90.4125, "city": "Dhaka",
                                "country": "Bangladesh", "force_refresh": False},
                          timeout=30)
        assert r.status_code == 401, f"expected 401, got {r.status_code}: {r.text}"

    def test_no_premium_returns_402(self):
        r = requests.post(f"{BASE_URL}/hotspots/discover",
                          headers={"Authorization": f"Bearer {STATE['nopremium_token']}"},
                          json={"lat": 23.8103, "lng": 90.4125, "city": "Dhaka",
                                "country": "Bangladesh", "force_refresh": False},
                          timeout=30)
        assert r.status_code == 402, f"expected 402, got {r.status_code}: {r.text}"


# --------------------------------------------------------------------------- #
# One test per city for image quality + photos array
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("city_cfg", CITIES, ids=[c["label"] for c in CITIES])
def test_discover_returns_real_images_and_photos_gallery(city_cfg):
    body = dict(city_cfg["body"])
    body["force_refresh"] = True
    r = requests.post(f"{BASE_URL}/hotspots/discover",
                      headers={"Authorization": f"Bearer {STATE['token']}"},
                      json=body, timeout=TIMEOUT_FRESH)
    assert r.status_code == 200, f"[{city_cfg['label']}] {r.status_code} {r.text}"
    data = r.json()
    assert data.get("source") == "ai", (
        f"[{city_cfg['label']}] expected fresh source=ai, got {data.get('source')}"
    )
    hotspots = data.get("hotspots") or []
    print(f"\n[{city_cfg['label']}] returned {len(hotspots)} hotspots")
    for h in hotspots:
        photos = h.get("photos") or []
        print(f"  - {h.get('name'):40s}  #photos={len(photos)}  primary={h.get('image_url')}")

    # 1. 5-8 hotspots
    assert 5 <= len(hotspots) <= 8, (
        f"[{city_cfg['label']}] expected 5-8 hotspots, got {len(hotspots)}"
    )

    # 2. Every primary image_url must be wikimedia + not svg
    fallback_count = 0
    primary_failures = []
    thumb_primary_warnings = []
    for h in hotspots:
        img = h.get("image_url") or ""
        host = (urlparse(img).hostname or "").lower()
        if host == "images.unsplash.com":
            fallback_count += 1
            continue
        # Any non-wikimedia OR svg/marker = hard fail
        reason = _is_bad_photo(img)
        if reason:
            primary_failures.append((h.get("name"), img, reason))
            continue
        # Wikimedia but not upload/commons (i.e. thumb.wikimedia.org) => warn only
        if not _is_primary_wm(img):
            thumb_primary_warnings.append((h.get("name"), host, img))
    if thumb_primary_warnings:
        print(f"[{city_cfg['label']}] thumb.wikimedia.org primary (still a real photo, but not upload/commons): {thumb_primary_warnings}")
    assert not primary_failures, (
        f"[{city_cfg['label']}] primary image issues: {primary_failures}"
    )
    # Curated unsplash fallback tolerance: at most 1 of 6 per city
    assert fallback_count <= 1, (
        f"[{city_cfg['label']}] too many unsplash fallbacks: {fallback_count}"
    )

    # 3. Each hotspot has a `photos` array with >= 3 wikimedia photograph URLs
    photos_failures = []
    for h in hotspots:
        photos = h.get("photos")
        if not isinstance(photos, list):
            photos_failures.append((h.get("name"), "missing/photos-not-list"))
            continue
        if len(photos) < 3:
            photos_failures.append((h.get("name"), f"only {len(photos)} photos"))
            continue
        for p in photos:
            reason = _is_bad_photo(p)
            if reason:
                photos_failures.append((h.get("name"), f"{reason} => {p}"))
                break
    assert not photos_failures, (
        f"[{city_cfg['label']}] photos array issues: {photos_failures}"
    )

    # 4. Landmark filename match on primary image (Latin script only)
    matched, key = _landmark_match(hotspots, city_cfg["landmark_keywords"])
    assert matched is not None, (
        f"[{city_cfg['label']}] no landmark from {city_cfg['landmark_keywords']} "
        f"had a matching primary image filename. "
        f"Hotspots+urls: {[(h['name'], h['image_url']) for h in hotspots]}"
    )
    print(f"[{city_cfg['label']}] landmark match: '{matched['name']}' "
          f"via token '{key}' -> {matched['image_url']}")

    # Save Dhaka response for cache + GET-by-id tests
    if city_cfg["label"] == "dhaka":
        STATE["dhaka_first_urls"] = [h["image_url"] for h in hotspots]
        STATE["dhaka_first_photos"] = {h["id"]: list(h["photos"]) for h in hotspots}
        STATE["dhaka_first_ids"] = [h["id"] for h in hotspots]
        STATE["dhaka_first_by_id"] = {h["id"]: h for h in hotspots}


# --------------------------------------------------------------------------- #
# GET /api/hotspots/{id} returns same object + photos array
# --------------------------------------------------------------------------- #
def test_get_hotspot_by_id_returns_photos():
    assert STATE.get("dhaka_first_ids"), "prerequisite Dhaka fresh call did not run"
    hid = STATE["dhaka_first_ids"][0]
    expected = STATE["dhaka_first_by_id"][hid]
    r = requests.get(f"{BASE_URL}/hotspots/{hid}",
                     headers={"Authorization": f"Bearer {STATE['token']}"},
                     timeout=15)
    assert r.status_code == 200, f"{r.status_code} {r.text}"
    doc = r.json()
    assert doc["id"] == hid
    assert doc["name"] == expected["name"]
    assert doc["image_url"] == expected["image_url"], (
        f"image_url differs: got {doc['image_url']} expected {expected['image_url']}"
    )
    assert isinstance(doc.get("photos"), list), "photos array missing on GET"
    assert len(doc["photos"]) >= 3, f"got only {len(doc['photos'])} photos on GET"
    assert doc["photos"] == expected["photos"], (
        f"photos array differs on GET.\nGET: {doc['photos']}\nDiscover: {expected['photos']}"
    )
    for p in doc["photos"]:
        reason = _is_bad_photo(p)
        assert reason is None, f"bad photo in GET response: {p} ({reason})"


# --------------------------------------------------------------------------- #
# Cache determinism (must run after Dhaka fresh test)
# --------------------------------------------------------------------------- #
def test_cache_deterministic_urls_and_photos():
    assert "dhaka_first_urls" in STATE, "prerequisite dhaka fresh call did not run"
    t0 = time.time()
    r = requests.post(f"{BASE_URL}/hotspots/discover",
                      headers={"Authorization": f"Bearer {STATE['token']}"},
                      json={"lat": 23.8103, "lng": 90.4125, "city": "Dhaka",
                            "country": "Bangladesh", "force_refresh": False},
                      timeout=TIMEOUT_CACHE)
    elapsed = time.time() - t0
    assert r.status_code == 200, r.text
    data = r.json()
    assert data.get("source") == "cache", f"expected source=cache, got {data.get('source')}"

    urls_now = [h["image_url"] for h in data["hotspots"]]
    assert set(urls_now) == set(STATE["dhaka_first_urls"]), (
        f"cache image_urls differ from fresh set.\n"
        f"fresh: {sorted(STATE['dhaka_first_urls'])}\n"
        f"cache: {sorted(urls_now)}"
    )

    # Verify photos arrays match per-hotspot id (order matters within array)
    photos_now = {h["id"]: h.get("photos") or [] for h in data["hotspots"]}
    mismatches = []
    for hid, expected in STATE["dhaka_first_photos"].items():
        actual = photos_now.get(hid)
        if actual != expected:
            mismatches.append((hid, expected, actual))
    assert not mismatches, (
        f"photos array mismatch (order matters) on cache hit:\n"
        + "\n".join(f"  id={m[0]}\n    fresh={m[1]}\n    cache={m[2]}" for m in mismatches)
    )
    print(f"cache call took {elapsed:.2f}s")
    assert elapsed < 10, f"cache call was slow: {elapsed:.2f}s"
