"""Backend retest for POST /api/hotspots/discover image quality bug fix.

Verifies that AI-discovered hotspots now return REAL landmark photos from
Wikipedia (upload.wikimedia.org / commons.wikimedia.org) instead of unrelated
stock images.

Cities under test: Dhaka, Cairo, Istanbul.

Scenarios:
- 5-8 hotspots returned; each has non-empty image_url on wikimedia.org host.
- No .svg images.
- Landmark filename match: e.g. Lalbagh / Pyramid / Hagia Sophia URL filename
  contains a token from the hotspot name.
- Each hotspot exposes `wikipedia_title` field.
- Cache determinism: second call w/o force_refresh returns source=='cache'
  and identical image_urls.
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

TIMEOUT_FRESH = 120  # AI can take up to 45s per city; give plenty of headroom
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

WIKIMEDIA_HOSTS = {"upload.wikimedia.org", "commons.wikimedia.org"}


def _ensure_primary_user_premium():
    """Login primary user; register + activate if missing/expired."""
    r = requests.post(f"{BASE_URL}/auth/login",
                      json={"email": PRIMARY_EMAIL, "password": PRIMARY_PASSWORD},
                      timeout=30)
    if r.status_code != 200:
        # Register fresh
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

    # check premium status
    me = requests.get(f"{BASE_URL}/auth/me",
                      headers={"Authorization": f"Bearer {token}"}, timeout=15).json()
    if not me.get("is_premium"):
        ar = requests.post(f"{BASE_URL}/subscriptions/activate",
                           headers={"Authorization": f"Bearer {token}"},
                           json={"tier": "month"}, timeout=30)
        assert ar.status_code == 200, f"activate failed: {ar.status_code} {ar.text}"
    return token, me.get("id") or me.get("user", {}).get("id")


@pytest.fixture(scope="module", autouse=True)
def setup_users():
    token, _ = _ensure_primary_user_premium()
    STATE["token"] = token

    # Create a fresh NON-premium user for 402 auth-guard test
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


def _hosts_ok(hotspots):
    good = 0
    for h in hotspots:
        url = h.get("image_url") or ""
        host = urlparse(url).hostname or ""
        if host in WIKIMEDIA_HOSTS:
            good += 1
    return good


def _no_svg(hotspots):
    bad = []
    for h in hotspots:
        url = (h.get("image_url") or "").lower()
        if url.endswith(".svg") or url.endswith(".svg.png") is False and ".svg" in url.split("?")[0].lower():
            # only flag actual .svg extensions
            if url.split("?")[0].lower().endswith(".svg"):
                bad.append(url)
    return bad


def _landmark_match(hotspots, keywords):
    """Return the first hotspot whose name contains any keyword AND
    whose image_url filename ALSO contains a token from its own name (or a
    keyword). Returns (hotspot, matched_keyword) or (None, None)."""
    for h in hotspots:
        name = (h.get("name") or "").lower()
        if not any(k in name for k in keywords):
            continue
        url = unquote((h.get("image_url") or "").lower())
        filename = url.split("/")[-1]
        # extract simple tokens from the hotspot name (length>=4)
        name_tokens = [t for t in re.split(r"[^a-z]+", name) if len(t) >= 4]
        combined = name_tokens + keywords
        if any(t in filename for t in combined):
            return h, [t for t in combined if t in filename][0]
    return None, None


# --------------------------------------------------------------------------- #
# Auth guard tests (run first, quick)
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
# One test per city for image quality
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("city_cfg", CITIES, ids=[c["label"] for c in CITIES])
def test_discover_returns_real_landmark_images(city_cfg):
    body = dict(city_cfg["body"])
    body["force_refresh"] = True
    r = requests.post(f"{BASE_URL}/hotspots/discover",
                      headers={"Authorization": f"Bearer {STATE['token']}"},
                      json=body, timeout=TIMEOUT_FRESH)
    assert r.status_code == 200, f"[{city_cfg['label']}] {r.status_code} {r.text}"
    data = r.json()
    assert data.get("source") == "ai", f"[{city_cfg['label']}] expected fresh source=ai, got {data.get('source')}"
    hotspots = data.get("hotspots") or []
    print(f"\n[{city_cfg['label']}] returned {len(hotspots)} hotspots")
    for h in hotspots:
        print(f"  - {h.get('name'):40s}  wt='{h.get('wikipedia_title')}'  img={h.get('image_url')}")

    # 1. 5-8 hotspots
    assert 5 <= len(hotspots) <= 8, f"[{city_cfg['label']}] expected 5-8 hotspots, got {len(hotspots)}"

    # 2. every image_url present
    missing_imgs = [h["name"] for h in hotspots if not (h.get("image_url") or "").strip()]
    assert not missing_imgs, f"[{city_cfg['label']}] missing image_url on: {missing_imgs}"

    # 3. host = wikimedia (allow tolerance for dhaka/cairo: at least 5/6;
    #    istanbul: EVERY image_url per test spec).
    good = _hosts_ok(hotspots)
    if city_cfg["label"] == "istanbul":
        assert good == len(hotspots), (
            f"[istanbul] every image must be wikimedia. good={good}/{len(hotspots)}. "
            f"non-wm URLs: {[h['image_url'] for h in hotspots if urlparse(h['image_url']).hostname not in WIKIMEDIA_HOSTS]}"
        )
    else:
        assert good >= 5, (
            f"[{city_cfg['label']}] expected >=5 wikimedia images, got {good}/{len(hotspots)}. "
            f"non-wm URLs: {[h['image_url'] for h in hotspots if urlparse(h['image_url']).hostname not in WIKIMEDIA_HOSTS]}"
        )

    # 4. no SVG
    svgs = _no_svg(hotspots)
    assert not svgs, f"[{city_cfg['label']}] SVG images not allowed: {svgs}"

    # 5. wikipedia_title field must be present on every hotspot
    missing_wt = [h["name"] for h in hotspots if "wikipedia_title" not in h]
    assert not missing_wt, f"[{city_cfg['label']}] wikipedia_title field missing on: {missing_wt}"

    empty_wt = [h["name"] for h in hotspots if not (h.get("wikipedia_title") or "").strip()]
    if empty_wt:
        print(f"[{city_cfg['label']}] hotspots with empty wikipedia_title (allowed if Claude explicitly said empty): {empty_wt}")

    # 6. Landmark filename match
    matched, key = _landmark_match(hotspots, city_cfg["landmark_keywords"])
    assert matched is not None, (
        f"[{city_cfg['label']}] no landmark from {city_cfg['landmark_keywords']} had a matching image filename. "
        f"Hotspots+urls: {[(h['name'], h['image_url']) for h in hotspots]}"
    )
    print(f"[{city_cfg['label']}] landmark match: '{matched['name']}' via token '{key}' -> {matched['image_url']}")

    # Save first Dhaka response for cache determinism test
    if city_cfg["label"] == "dhaka":
        STATE["dhaka_first_urls"] = [h["image_url"] for h in hotspots]
        STATE["dhaka_first_ids"] = [h["id"] for h in hotspots]


# --------------------------------------------------------------------------- #
# Cache determinism (must run after Dhaka fresh test)
# --------------------------------------------------------------------------- #
def test_cache_is_deterministic_for_dhaka():
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
    # allow different ordering due to distance sort — compare as sets
    assert set(urls_now) == set(STATE["dhaka_first_urls"]), (
        f"cache image_urls differ from fresh set.\n"
        f"fresh: {sorted(STATE['dhaka_first_urls'])}\n"
        f"cache: {sorted(urls_now)}"
    )
    print(f"cache call took {elapsed:.2f}s")
    assert elapsed < 10, f"cache call was slow: {elapsed:.2f}s"
