from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json
import logging
import jwt
import bcrypt
import uuid
import math
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Literal
from datetime import datetime, timezone, timedelta

from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
JWT_SECRET = os.environ['JWT_SECRET']
EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

app = FastAPI(title="GuardTrip API")
api_router = APIRouter(prefix="/api")


# ============================================================================
# MODELS
# ============================================================================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    display_name: str
    gender: Literal["male", "female", "other"] = "other"
    language: str = "English"
    travel_style: str = "Explorer"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: str
    email: str
    display_name: str
    gender: str
    language: str
    travel_style: str
    is_premium: bool
    subscription_tier: Optional[str] = None
    subscription_expires_at: Optional[str] = None
    current_city: Optional[str] = None
    daily_budget_usd: float = 80.0

class SubscribeReq(BaseModel):
    tier: Literal["week", "month", "year"]
    city: Optional[str] = None

class Hotspot(BaseModel):
    id: str
    city: str
    country: str
    name: str
    description: str
    image_url: str
    lat: float
    lng: float
    entry_fee_local: str
    entry_fee_usd: float
    entry_fee_foreigner_usd: float
    transit_cost_usd: float
    transit_time_min: int
    activities: List[dict]
    rating: float
    tags: List[str]

class CheckInReq(BaseModel):
    city: str
    country: str
    lat: float
    lng: float

class Partner(BaseModel):
    id: str
    display_name: str
    gender: str
    language: str
    travel_style: str
    city: str
    avatar_seed: str
    bio: str
    verified: bool
    last_active: str

class AIChatReq(BaseModel):
    message: str
    city: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class AlertCreate(BaseModel):
    kind: Literal["pickpocket", "taxi_scam", "unsafe_area", "tourist_scam", "other"]
    title: str
    description: str
    lat: float
    lng: float
    city: str

class MessageCreate(BaseModel):
    text: str

class ExpensePredictReq(BaseModel):
    hotspot_id: str
    from_lat: Optional[float] = None
    from_lng: Optional[float] = None


class BudgetSet(BaseModel):
    daily_budget_usd: float


class ExpenseCreate(BaseModel):
    amount_usd: float
    category: Literal["food", "transit", "entry", "activity", "shopping", "lodging", "other"]
    note: Optional[str] = None
    city: Optional[str] = None


class DiscoverReq(BaseModel):
    lat: float
    lng: float
    city: Optional[str] = None
    country: Optional[str] = None
    force_refresh: bool = False



# ============================================================================
# HELPERS
# ============================================================================

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=30)}
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())

async def get_current_user(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing auth")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(401, "User not found")
    return user

def check_premium(user: dict) -> bool:
    if not user.get("subscription_expires_at"):
        return False
    exp = datetime.fromisoformat(user["subscription_expires_at"])
    return exp > datetime.now(timezone.utc)

async def require_premium(user: dict = Depends(get_current_user)) -> dict:
    if not check_premium(user):
        raise HTTPException(402, "Premium subscription required")
    return user

def user_to_out(user: dict) -> UserOut:
    return UserOut(
        id=user["id"],
        email=user["email"],
        display_name=user["display_name"],
        gender=user.get("gender", "other"),
        language=user.get("language", "English"),
        travel_style=user.get("travel_style", "Explorer"),
        is_premium=check_premium(user),
        subscription_tier=user.get("subscription_tier"),
        subscription_expires_at=user.get("subscription_expires_at"),
        current_city=user.get("current_city"),
        daily_budget_usd=float(user.get("daily_budget_usd") or 80.0),
    )


# ============================================================================
# AUTH ROUTES
# ============================================================================

@api_router.post("/auth/register")
async def register(body: UserCreate):
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {
        "id": uid,
        "email": body.email.lower(),
        "password_hash": hash_password(body.password),
        "display_name": body.display_name,
        "gender": body.gender,
        "language": body.language,
        "travel_style": body.travel_style,
        "subscription_tier": None,
        "subscription_expires_at": None,
        "subscription_city": None,
        "current_city": None,
        "created_at": now_iso(),
    }
    await db.users.insert_one(doc)
    doc.pop("_id", None)
    return {"token": make_token(uid), "user": user_to_out(doc).model_dump()}


@api_router.post("/auth/login")
async def login(body: UserLogin):
    user = await db.users.find_one({"email": body.email.lower()}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid credentials")
    return {"token": make_token(user["id"]), "user": user_to_out(user).model_dump()}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_to_out(user).model_dump()


# ============================================================================
# SUBSCRIPTIONS (mocked IAP for MVP - real Apple/Google IAP requires native build)
# ============================================================================

@api_router.post("/subscriptions/activate")
async def activate_subscription(body: SubscribeReq, user: dict = Depends(get_current_user)):
    now = datetime.now(timezone.utc)
    if body.tier == "week":
        expires = now + timedelta(days=7)
        price = 9.99
    elif body.tier == "month":
        expires = now + timedelta(days=30)
        price = 19.00
    else:
        expires = now + timedelta(days=365)
        price = 99.00
    update = {
        "subscription_tier": body.tier,
        "subscription_expires_at": expires.isoformat(),
        "subscription_city": body.city if body.tier == "week" else None,
        "subscription_price": price,
        "subscription_activated_at": now.isoformat(),
    }
    await db.users.update_one({"id": user["id"]}, {"$set": update})
    await db.subscriptions.insert_one({
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "tier": body.tier,
        "price_usd": price,
        "city": body.city,
        "activated_at": now.isoformat(),
        "expires_at": expires.isoformat(),
    })
    user.update(update)
    return {"success": True, "user": user_to_out(user).model_dump()}


@api_router.get("/subscriptions/status")
async def sub_status(user: dict = Depends(get_current_user)):
    return {"is_premium": check_premium(user), "tier": user.get("subscription_tier"),
            "expires_at": user.get("subscription_expires_at")}


# ============================================================================
# HOTSPOTS
# ============================================================================

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371
    p = math.pi / 180
    a = 0.5 - math.cos((lat2 - lat1) * p) / 2 + \
        math.cos(lat1 * p) * math.cos(lat2 * p) * (1 - math.cos((lon2 - lon1) * p)) / 2
    return 2 * R * math.asin(math.sqrt(a))

@api_router.get("/hotspots")
async def list_hotspots(city: Optional[str] = None, lat: Optional[float] = None,
                        lng: Optional[float] = None, user: dict = Depends(require_premium)):
    q = {}
    if city:
        q["city"] = {"$regex": f"^{city}$", "$options": "i"}
    docs = await db.hotspots.find(q, {"_id": 0}).to_list(200)
    if lat is not None and lng is not None:
        for d in docs:
            d["distance_km"] = round(haversine_km(lat, lng, d["lat"], d["lng"]), 2)
        docs.sort(key=lambda d: d.get("distance_km", 1e9))
    return {"hotspots": docs}


@api_router.get("/hotspots/{hid}")
async def get_hotspot(hid: str, user: dict = Depends(require_premium)):
    doc = await db.hotspots.find_one({"id": hid}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Not found")
    return doc


@api_router.get("/cities")
async def list_cities(user: dict = Depends(require_premium)):
    cities = await db.hotspots.distinct("city")
    result = []
    for c in cities:
        doc = await db.hotspots.find_one({"city": c}, {"_id": 0})
        result.append({"city": c, "country": doc["country"], "cover_image": doc["image_url"]})
    return {"cities": result}


# ---------------------------------------------------------------------------
# AI Discover: generate top hotspots for ANY city using Claude + Wikipedia images
# ---------------------------------------------------------------------------

import httpx
import re
import urllib.parse as _urlparse

DISCOVER_TTL_DAYS = 14
DISCOVER_CACHE_VERSION = "v2"  # bump when image logic changes → invalidates old cache

FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1500835556837-99ac94a94552?w=800",  # travel skyline
    "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800",  # street
    "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=800",  # temple
    "https://images.unsplash.com/photo-1506929562872-bb421503ef21?w=800",  # market
    "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800",  # mountain
    "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=800",  # cafe
]


def _clean_place(name: str) -> str:
    # Drop text in parens and trim junk punctuation
    n = re.sub(r"\s*\([^)]*\)\s*", " ", name).strip()
    n = re.sub(r"\s+", " ", n)
    return n


WIKI_UA = "GuardTrip/1.0 (https://guardtrip.app; support@guardtrip.app) httpx"


async def _wiki_pageimage(client: httpx.AsyncClient, title: str) -> Optional[str]:
    """Use PageImages API to fetch the main/lead image of a Wikipedia article."""
    try:
        url = (
            "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
            "&prop=pageimages&piprop=original|thumbnail&pithumbsize=1000&titles="
            + _urlparse.quote(title)
        )
        r = await client.get(url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
        if r.status_code == 200:
            data = r.json()
            pages = ((data.get("query") or {}).get("pages") or {})
            for _, page in pages.items():
                orig = (page.get("original") or {}).get("source")
                thumb = (page.get("thumbnail") or {}).get("source")
                for cand in (orig, thumb):
                    if not cand:
                        continue
                    lower = cand.lower()
                    # Skip vector/diagram/disambig placeholders — we want real photos
                    if lower.endswith(".svg") or ".svg?" in lower:
                        continue
                    if "disambig" in lower or "commons-logo" in lower:
                        continue
                    return cand
    except Exception:
        pass
    return None


def _is_photo_url(u: str) -> bool:
    if not u:
        return False
    l = u.lower()
    if l.endswith(".svg") or ".svg?" in l:
        return False
    bad = ("commons-logo", "disambig", "question_book", "wiki_letter", "flag_of_",
           "coat_of_arms", "location_map", "map_of_", ".pdf")
    return not any(b in l for b in bad)


async def _wiki_page_photos(client: httpx.AsyncClient, title: str, limit: int = 10) -> list:
    """Return real photo URLs used on a Wikipedia article's page (excluding icons/svgs/maps)."""
    try:
        url = (
            "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1"
            "&generator=images&gimlimit=15&prop=imageinfo"
            "&iiprop=url|size|mime&iiurlwidth=1000&titles="
            + _urlparse.quote(title)
        )
        r = await client.get(url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
        if r.status_code != 200:
            return []
        pages = ((r.json().get("query") or {}).get("pages") or {})
        photos = []
        for _, page in pages.items():
            infos = page.get("imageinfo") or []
            if not infos:
                continue
            info = infos[0]
            mime = (info.get("mime") or "").lower()
            if "image" not in mime or "svg" in mime:
                continue
            width = info.get("width") or 0
            height = info.get("height") or 0
            if width < 400 or height < 300:  # skip tiny icons
                continue
            best = info.get("thumburl") or info.get("url")
            if _is_photo_url(best):
                photos.append(best)
            if len(photos) >= limit:
                break
        return photos
    except Exception:
        return []


async def _commons_search_image(client: httpx.AsyncClient, query: str) -> Optional[str]:
    """Search Wikimedia Commons (namespace 6) for a photo of the place."""
    try:
        # Search files
        s_url = (
            "https://commons.wikimedia.org/w/api.php?action=query&format=json&list=search"
            "&srnamespace=6&srlimit=5&srsearch=" + _urlparse.quote(query + " filetype:bitmap")
        )
        r = await client.get(s_url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
        if r.status_code != 200:
            return None
        results = ((r.json().get("query") or {}).get("search") or [])
        for hit in results:
            title = hit.get("title")
            if not title or not title.lower().startswith("file:"):
                continue
            i_url = (
                "https://commons.wikimedia.org/w/api.php?action=query&format=json"
                "&prop=imageinfo&iiprop=url|size|mime&iiurlwidth=1000&titles="
                + _urlparse.quote(title)
            )
            r2 = await client.get(i_url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
            if r2.status_code == 200:
                pages = ((r2.json().get("query") or {}).get("pages") or {})
                for _, page in pages.items():
                    infos = page.get("imageinfo") or []
                    if infos:
                        info = infos[0]
                        mime = info.get("mime", "")
                        if "image" in mime and "svg" not in mime:
                            return info.get("thumburl") or info.get("url")
    except Exception:
        pass
    return None


async def _wiki_summary_image(client: httpx.AsyncClient, title: str) -> Optional[str]:
    try:
        url = f"https://en.wikipedia.org/api/rest_v1/page/summary/{_urlparse.quote(title.replace(' ', '_'))}"
        r = await client.get(url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
        if r.status_code == 200:
            data = r.json()
            orig = (data.get("originalimage") or {}).get("source")
            thumb = (data.get("thumbnail") or {}).get("source")
            return orig or thumb
    except Exception:
        pass
    return None


async def _wiki_opensearch(client: httpx.AsyncClient, query: str) -> Optional[str]:
    try:
        url = ("https://en.wikipedia.org/w/api.php?action=opensearch&limit=1&namespace=0&format=json&search="
               + _urlparse.quote(query))
        r = await client.get(url, headers={"User-Agent": WIKI_UA, "Accept": "application/json"})
        if r.status_code == 200:
            data = r.json()
            titles = data[1] if isinstance(data, list) and len(data) > 1 else []
            if titles:
                return titles[0]
    except Exception:
        pass
    return None


async def _fetch_place_images(place: str, city: str, idx: int, wiki_title: Optional[str] = None) -> dict:
    """
    Return {'primary': str, 'photos': [str, ...]}.
    Photos are always REAL photographs of the exact landmark (Wikipedia article images).
    """
    clean = _clean_place(place)
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
        # Resolve the best Wikipedia title we can
        resolved_title = None
        if wiki_title:
            resolved_title = wiki_title
        if not resolved_title:
            t = await _wiki_opensearch(client, f"{clean} {city}") or await _wiki_opensearch(client, clean)
            resolved_title = t

        primary = None
        photos: list = []

        if resolved_title:
            primary = await _wiki_pageimage(client, resolved_title)
            gallery = await _wiki_page_photos(client, resolved_title, limit=8)
            photos = [g for g in gallery if _is_photo_url(g)]

        # Ensure primary is included and comes first
        if primary:
            photos = [primary] + [p for p in photos if p != primary]
        elif photos:
            primary = photos[0]

        # Fall back to Commons search only if we still have nothing
        if not primary:
            fb = await _commons_search_image(client, f"{clean} {city}")
            if fb:
                primary = fb
                photos = [fb]

    if not primary:
        primary = FALLBACK_IMAGES[idx % len(FALLBACK_IMAGES)]
        photos = [primary]

    # Cap at 6 unique photos
    seen = set()
    uniq: list = []
    for p in photos:
        if p not in seen:
            seen.add(p); uniq.append(p)
        if len(uniq) >= 6:
            break
    return {"primary": primary, "photos": uniq}



def _extract_json_array(text: str):
    """Extract a JSON array from the model reply even when wrapped in prose or code fences."""
    m = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text)
    if m:
        chunk = m.group(1)
    else:
        i = text.find("[")
        j = text.rfind("]")
        chunk = text[i:j + 1] if i != -1 and j != -1 and j > i else text
    return json.loads(chunk)


async def _generate_ai_hotspots(city: str, country: str, lat: float, lng: float) -> list:
    system = (
        "You are a highly-specific local travel expert. When asked for spots, respond with ONLY "
        "a valid JSON array (no prose, no markdown fences, no commentary). Do NOT invent places; "
        "prefer well-known, publicly documented landmarks and popular local experiences."
    )
    user_prompt = (
        f"I'm a solo international traveler currently in {city}"
        + (f", {country}" if country else "")
        + f" near coordinates ({lat:.4f}, {lng:.4f}). "
        "Give me 6 must-visit spots for the next 2 days. Return a JSON array where each element is: "
        "{name: string (well-known landmark or district name, matching its common English name), "
        "wikipedia_title: string (EXACT English Wikipedia article title for this specific place, "
        "e.g. 'Eiffel Tower', 'Lalbagh Fort', 'Great Pyramid of Giza'; empty string only if truly no Wikipedia article), "
        "description: string (one crisp sentence), "
        "lat: number, lng: number, "
        "entry_fee_local: string (in local currency, or 'Free'), "
        "entry_fee_foreigner_usd: number, "
        "transit_cost_usd: number, transit_time_min: integer, "
        "activities: array of {name: string, cost_usd: number} (2-3 items), "
        "rating: number between 4.0 and 4.9, "
        "tags: array of 2-3 lowercase words}. "
        "Coordinates must be plausible for the city; costs in USD unless noted. Return ONLY the JSON array."
    )
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"discover-{city}-{country}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    reply = await chat.send_message(UserMessage(text=user_prompt))
    text = reply if isinstance(reply, str) else str(reply)
    return _extract_json_array(text)


@api_router.post("/hotspots/discover")
async def discover_hotspots(body: DiscoverReq, user: dict = Depends(require_premium)):
    if not body.city:
        raise HTTPException(400, "city is required")
    city = body.city.strip()
    country = (body.country or "").strip()
    cache_key = f"ai:{DISCOVER_CACHE_VERSION}:{city.lower()}:{country.lower()}"

    # Return cached spots if fresh
    if not body.force_refresh:
        cached = await db.hotspots.find({"cache_key": cache_key}, {"_id": 0}).to_list(50)
        cutoff = datetime.now(timezone.utc) - timedelta(days=DISCOVER_TTL_DAYS)
        fresh = [c for c in cached if datetime.fromisoformat(c.get("cached_at", now_iso())) > cutoff]
        if len(fresh) >= 4:
            for d in fresh:
                d["distance_km"] = round(haversine_km(body.lat, body.lng, d["lat"], d["lng"]), 2)
            fresh.sort(key=lambda d: d.get("distance_km", 1e9))
            return {"city": city, "country": country, "source": "cache", "hotspots": fresh}

    # Otherwise generate with AI
    try:
        raw_spots = await _generate_ai_hotspots(city, country, body.lat, body.lng)
    except Exception as e:
        logging.exception("AI discover failed")
        raise HTTPException(502, f"Couldn't generate spots: {e}")

    if not isinstance(raw_spots, list) or len(raw_spots) == 0:
        raise HTTPException(502, "AI returned no spots")

    # Delete stale cached entries for this key first
    await db.hotspots.delete_many({"cache_key": cache_key})

    # Fetch images in parallel to keep response snappy
    candidates = [s for s in raw_spots[:8] if str(s.get("name", "")).strip()]
    image_bundles = await asyncio.gather(*[
        _fetch_place_images(
            str(s["name"]).strip(),
            city,
            i,
            wiki_title=str(s.get("wikipedia_title") or "").strip() or None,
        ) for i, s in enumerate(candidates)
    ])

    saved = []
    for i, s in enumerate(candidates):
        name = str(s.get("name", "")).strip()
        bundle = image_bundles[i]
        doc = {
            "id": str(uuid.uuid4()),
            "city": city,
            "country": country or "Unknown",
            "name": name,
            "wikipedia_title": str(s.get("wikipedia_title") or "").strip(),
            "description": str(s.get("description", "")).strip()[:280],
            "image_url": bundle["primary"],
            "photos": bundle["photos"],
            "lat": float(s.get("lat") or body.lat),
            "lng": float(s.get("lng") or body.lng),
            "entry_fee_local": str(s.get("entry_fee_local", "Free")),
            "entry_fee_usd": float(s.get("entry_fee_foreigner_usd", 0) or 0),
            "entry_fee_foreigner_usd": float(s.get("entry_fee_foreigner_usd", 0) or 0),
            "transit_cost_usd": float(s.get("transit_cost_usd", 0) or 0),
            "transit_time_min": int(s.get("transit_time_min", 15) or 15),
            "activities": [
                {"name": str(a.get("name", "")), "cost_usd": float(a.get("cost_usd", 0) or 0)}
                for a in (s.get("activities") or []) if isinstance(a, dict)
            ],
            "rating": float(s.get("rating", 4.5) or 4.5),
            "tags": [str(t).lower() for t in (s.get("tags") or [])][:4],
            "source": "ai",
            "cache_key": cache_key,
            "cached_at": now_iso(),
        }
        await db.hotspots.insert_one(doc)
        doc.pop("_id", None)
        doc["distance_km"] = round(haversine_km(body.lat, body.lng, doc["lat"], doc["lng"]), 2)
        saved.append(doc)

    saved.sort(key=lambda d: d.get("distance_km", 1e9))
    return {"city": city, "country": country, "source": "ai", "hotspots": saved}




# ============================================================================
# PARTNERS / LOCATIONS POOL
# ============================================================================

@api_router.post("/partners/checkin")
async def checkin(body: CheckInReq, user: dict = Depends(require_premium)):
    await db.users.update_one({"id": user["id"]}, {"$set": {
        "current_city": body.city, "current_country": body.country,
        "current_lat": body.lat, "current_lng": body.lng,
        "last_active": now_iso(),
    }})
    await db.locations_pool.update_one(
        {"user_id": user["id"]},
        {"$set": {
            "user_id": user["id"], "display_name": user["display_name"],
            "gender": user.get("gender"), "language": user.get("language"),
            "travel_style": user.get("travel_style"),
            "city": body.city, "country": body.country,
            "lat": body.lat, "lng": body.lng, "last_active": now_iso(),
        }},
        upsert=True,
    )
    return {"success": True}


@api_router.get("/partners")
async def list_partners(city: Optional[str] = None, gender: Optional[str] = None,
                        language: Optional[str] = None, user: dict = Depends(require_premium)):
    q = {"user_id": {"$ne": user["id"]}}
    target_city = city or user.get("current_city")
    if target_city:
        q["city"] = {"$regex": f"^{target_city}$", "$options": "i"}
    if gender and gender != "any":
        q["gender"] = gender
    if language and language != "any":
        q["language"] = language
    docs = await db.locations_pool.find(q, {"_id": 0}).limit(50).to_list(50)
    partners = []
    for d in docs:
        partners.append({
            "id": d["user_id"],
            "display_name": d["display_name"],
            "gender": d.get("gender", "other"),
            "language": d.get("language", "English"),
            "travel_style": d.get("travel_style", "Explorer"),
            "city": d.get("city", ""),
            "avatar_seed": d["user_id"],
            "bio": d.get("bio", f"Currently exploring {d.get('city', 'the world')}"),
            "verified": True,
            "last_active": d.get("last_active", now_iso()),
        })
    return {"partners": partners}


# ============================================================================
# 1-1 CHAT
# ============================================================================

def room_key(u1: str, u2: str) -> str:
    return "_".join(sorted([u1, u2]))

@api_router.post("/chat/rooms")
async def create_room(payload: dict, user: dict = Depends(require_premium)):
    other_id = payload.get("user_id")
    if not other_id:
        raise HTTPException(400, "user_id required")
    other = await db.users.find_one({"id": other_id}, {"_id": 0})
    if not other:
        raise HTTPException(404, "User not found")
    key = room_key(user["id"], other_id)
    room = await db.chat_rooms.find_one({"key": key}, {"_id": 0})
    if not room:
        room = {
            "id": str(uuid.uuid4()),
            "key": key,
            "user_ids": [user["id"], other_id],
            "created_at": now_iso(),
        }
        await db.chat_rooms.insert_one(room)
        room.pop("_id", None)
    return {"room_id": room["id"], "other_user": {
        "id": other["id"], "display_name": other["display_name"],
        "gender": other.get("gender"), "language": other.get("language"),
        "travel_style": other.get("travel_style"),
    }}


@api_router.get("/chat/rooms")
async def list_rooms(user: dict = Depends(require_premium)):
    rooms = await db.chat_rooms.find({"user_ids": user["id"]}, {"_id": 0}).to_list(100)
    result = []
    for r in rooms:
        other_id = [u for u in r["user_ids"] if u != user["id"]][0]
        other = await db.users.find_one({"id": other_id}, {"_id": 0})
        last_msg = await db.chat_messages.find_one({"room_id": r["id"]}, {"_id": 0}, sort=[("created_at", -1)])
        if other:
            result.append({
                "room_id": r["id"],
                "other_user": {"id": other["id"], "display_name": other["display_name"]},
                "last_message": last_msg["text"] if last_msg else None,
                "last_at": last_msg["created_at"] if last_msg else r["created_at"],
            })
    result.sort(key=lambda x: x["last_at"], reverse=True)
    return {"rooms": result}


@api_router.get("/chat/rooms/{room_id}/messages")
async def get_messages(room_id: str, user: dict = Depends(require_premium)):
    room = await db.chat_rooms.find_one({"id": room_id}, {"_id": 0})
    if not room or user["id"] not in room["user_ids"]:
        raise HTTPException(403, "No access")
    # mark incoming as read before building response so receiver sees status=read immediately
    await db.chat_messages.update_many(
        {"room_id": room_id, "sender_id": {"$ne": user["id"]}, "status": {"$ne": "read"}},
        {"$set": {"status": "read", "read_at": now_iso()}},
    )
    msgs = await db.chat_messages.find({"room_id": room_id}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return {"messages": msgs}


@api_router.post("/chat/rooms/{room_id}/messages")
async def send_message(room_id: str, body: MessageCreate, user: dict = Depends(require_premium)):
    room = await db.chat_rooms.find_one({"id": room_id}, {"_id": 0})
    if not room or user["id"] not in room["user_ids"]:
        raise HTTPException(403, "No access")
    msg = {
        "id": str(uuid.uuid4()),
        "room_id": room_id,
        "sender_id": user["id"],
        "sender_name": user["display_name"],
        "text": body.text,
        "status": "delivered",
        "created_at": now_iso(),
    }
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return msg


# ============================================================================
# AI TRAVEL ASSISTANT
# ============================================================================

@api_router.post("/ai/chat")
async def ai_chat(body: AIChatReq, user: dict = Depends(require_premium)):
    session_id = f"assistant-{user['id']}"
    context_bits = []
    if body.city:
        context_bits.append(f"The user is currently in {body.city}.")
    if body.lat is not None and body.lng is not None:
        context_bits.append(f"Their GPS coordinates are ({body.lat}, {body.lng}).")
    context_bits.append(f"The traveler's style is: {user.get('travel_style', 'Explorer')}.")
    context = " ".join(context_bits)

    system_message = (
        "You are GuardTrip AI, an elite personal travel concierge and safety guide for solo international travelers. "
        "You give sharp, tactical, actionable advice: concrete costs in USD, transit tips, safety warnings, "
        "and cultural do's/don'ts. Keep answers under 180 words, use short bullets when helpful, "
        f"and always sound like a premium concierge. Context: {context}"
    )

    # persist user message
    await db.ai_chats.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "role": "user",
        "content": body.message, "created_at": now_iso(),
    })

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=session_id,
        system_message=system_message,
    ).with_model("anthropic", "claude-sonnet-4-6")

    try:
        response = await chat.send_message(UserMessage(text=body.message))
        reply = response if isinstance(response, str) else str(response)
    except Exception as e:
        logging.exception("AI chat failed")
        reply = "I'm having trouble reaching the concierge right now. Please try again in a moment."

    await db.ai_chats.insert_one({
        "id": str(uuid.uuid4()), "user_id": user["id"], "role": "assistant",
        "content": reply, "created_at": now_iso(),
    })
    return {"reply": reply}


@api_router.get("/ai/history")
async def ai_history(user: dict = Depends(require_premium)):
    msgs = await db.ai_chats.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", 1).limit(100).to_list(100)
    return {"messages": msgs}


@api_router.post("/expense/predict")
async def expense_predict(body: ExpensePredictReq, user: dict = Depends(require_premium)):
    hs = await db.hotspots.find_one({"id": body.hotspot_id}, {"_id": 0})
    if not hs:
        raise HTTPException(404, "Hotspot not found")
    # Use AI to enrich with a quick tip
    system = "You are a concise travel finance advisor. Answer in 2-3 short bullet points, USD."
    prompt = (
        f"Hotspot: {hs['name']} in {hs['city']}. Entry fee foreigner: ${hs['entry_fee_foreigner_usd']}. "
        f"Transit avg: ${hs['transit_cost_usd']}. Give a smart budget tip and one hidden-cost warning."
    )
    try:
        chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"expense-{user['id']}-{body.hotspot_id}",
                       system_message=system).with_model("anthropic", "claude-sonnet-4-6")
        tip = await chat.send_message(UserMessage(text=prompt))
    except Exception:
        tip = "Bring small local cash for entry. Watch for 'skip the line' resellers charging 2x."
    return {"hotspot": hs, "ai_tip": tip if isinstance(tip, str) else str(tip)}


# ============================================================================
# TRIP WALLET
# ============================================================================

def today_str() -> str:
    return datetime.now(timezone.utc).date().isoformat()

@api_router.post("/wallet/budget")
async def set_budget(body: BudgetSet, user: dict = Depends(require_premium)):
    if body.daily_budget_usd < 1 or body.daily_budget_usd > 10000:
        raise HTTPException(400, "Budget must be between 1 and 10000 USD")
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"daily_budget_usd": float(body.daily_budget_usd)}})
    return {"success": True, "daily_budget_usd": body.daily_budget_usd}


@api_router.get("/wallet/today")
async def wallet_today(user: dict = Depends(require_premium)):
    budget = float(user.get("daily_budget_usd") or 80.0)
    today = today_str()
    expenses = await db.expenses.find({"user_id": user["id"], "day": today},
                                      {"_id": 0}).sort("created_at", -1).to_list(200)
    spent = round(sum(float(e["amount_usd"]) for e in expenses), 2)
    remaining = round(budget - spent, 2)
    by_cat: dict = {}
    for e in expenses:
        by_cat[e["category"]] = round(by_cat.get(e["category"], 0.0) + float(e["amount_usd"]), 2)
    return {
        "day": today, "daily_budget_usd": budget,
        "spent_usd": spent, "remaining_usd": remaining,
        "percent_used": round((spent / budget * 100) if budget else 0, 1),
        "expenses": expenses, "by_category": by_cat,
    }


@api_router.post("/wallet/expenses")
async def add_expense(body: ExpenseCreate, user: dict = Depends(require_premium)):
    if body.amount_usd <= 0 or body.amount_usd > 100000:
        raise HTTPException(400, "Invalid amount")
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "amount_usd": round(float(body.amount_usd), 2),
        "category": body.category,
        "note": (body.note or "").strip(),
        "city": body.city or user.get("current_city"),
        "day": today_str(),
        "created_at": now_iso(),
    }
    await db.expenses.insert_one(doc)
    doc.pop("_id", None)
    return doc


@api_router.delete("/wallet/expenses/{expense_id}")
async def delete_expense(expense_id: str, user: dict = Depends(require_premium)):
    res = await db.expenses.delete_one({"id": expense_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Expense not found")
    return {"success": True}


@api_router.get("/wallet/history")
async def wallet_history(days: int = 7, user: dict = Depends(require_premium)):
    days = max(1, min(30, days))
    budget = float(user.get("daily_budget_usd") or 80.0)
    result = []
    today = datetime.now(timezone.utc).date()
    for i in range(days):
        d = (today - timedelta(days=i)).isoformat()
        rows = await db.expenses.find({"user_id": user["id"], "day": d}, {"_id": 0}).to_list(500)
        spent = round(sum(float(r["amount_usd"]) for r in rows), 2)
        result.append({"day": d, "spent_usd": spent, "budget_usd": budget,
                       "over": spent > budget, "count": len(rows)})
    return {"history": result, "daily_budget_usd": budget}



# ============================================================================
# SAFETY ALERTS
# ============================================================================

@api_router.get("/alerts")
async def list_alerts(city: Optional[str] = None, lat: Optional[float] = None,
                      lng: Optional[float] = None, user: dict = Depends(require_premium)):
    q = {}
    if city:
        q["city"] = {"$regex": f"^{city}$", "$options": "i"}
    docs = await db.alerts.find(q, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)
    if lat is not None and lng is not None:
        for d in docs:
            d["distance_km"] = round(haversine_km(lat, lng, d["lat"], d["lng"]), 2)
        docs.sort(key=lambda d: d.get("distance_km", 1e9))
    return {"alerts": docs}


@api_router.post("/alerts")
async def create_alert(body: AlertCreate, user: dict = Depends(require_premium)):
    doc = {
        "id": str(uuid.uuid4()),
        "kind": body.kind,
        "title": body.title,
        "description": body.description,
        "lat": body.lat,
        "lng": body.lng,
        "city": body.city,
        "reported_by": user["display_name"],
        "reported_by_id": user["id"],
        "created_at": now_iso(),
        "verified": False,
    }
    await db.alerts.insert_one(doc)
    doc.pop("_id", None)
    return doc


# ============================================================================
# OFFLINE PACK
# ============================================================================

@api_router.get("/offline/pack")
async def offline_pack(city: str, user: dict = Depends(require_premium)):
    hotspots = await db.hotspots.find({"city": {"$regex": f"^{city}$", "$options": "i"}}, {"_id": 0}).to_list(50)
    alerts = await db.alerts.find({"city": {"$regex": f"^{city}$", "$options": "i"}}, {"_id": 0}).to_list(50)
    phrases = PHRASE_PACKS.get(city.lower(), PHRASE_PACKS["default"])
    return {"city": city, "hotspots": hotspots, "alerts": alerts, "phrases": phrases,
            "packed_at": now_iso()}


PHRASE_PACKS = {
    "paris": [
        {"en": "Hello", "local": "Bonjour"}, {"en": "Thank you", "local": "Merci"},
        {"en": "Help!", "local": "Au secours!"}, {"en": "Where is the police station?", "local": "Où est le commissariat?"},
        {"en": "How much?", "local": "Combien ça coûte?"}, {"en": "I don't understand", "local": "Je ne comprends pas"},
    ],
    "tokyo": [
        {"en": "Hello", "local": "Konnichiwa"}, {"en": "Thank you", "local": "Arigatou gozaimasu"},
        {"en": "Help!", "local": "Tasukete!"}, {"en": "Where is the police?", "local": "Keisatsu wa doko desu ka?"},
        {"en": "How much?", "local": "Ikura desu ka?"}, {"en": "Excuse me", "local": "Sumimasen"},
    ],
    "bali": [
        {"en": "Hello", "local": "Halo / Om Swastiastu"}, {"en": "Thank you", "local": "Terima kasih"},
        {"en": "Help!", "local": "Tolong!"}, {"en": "Police", "local": "Polisi"},
        {"en": "How much?", "local": "Berapa harganya?"}, {"en": "Sorry", "local": "Maaf"},
    ],
    "barcelona": [
        {"en": "Hello", "local": "Hola"}, {"en": "Thank you", "local": "Gracias"},
        {"en": "Help!", "local": "¡Ayuda!"}, {"en": "Where is the police?", "local": "¿Dónde está la policía?"},
        {"en": "How much?", "local": "¿Cuánto cuesta?"}, {"en": "I don't speak Spanish", "local": "No hablo español"},
    ],
    "default": [
        {"en": "Hello", "local": "Hello"}, {"en": "Thank you", "local": "Thank you"},
        {"en": "Help!", "local": "Help!"},
    ],
}


# ============================================================================
# SEED DATA
# ============================================================================

SEED_HOTSPOTS = [
    # PARIS
    {"city": "Paris", "country": "France", "name": "Eiffel Tower",
     "description": "Iron lattice tower, iconic symbol of Paris. Best at blue hour.",
     "image_url": "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=800",
     "lat": 48.8584, "lng": 2.2945, "entry_fee_local": "€29.40", "entry_fee_usd": 32.0,
     "entry_fee_foreigner_usd": 32.0, "transit_cost_usd": 2.30, "transit_time_min": 15,
     "activities": [{"name": "Summit access", "cost_usd": 32}, {"name": "Seine dinner cruise", "cost_usd": 95}],
     "rating": 4.7, "tags": ["landmark", "romantic", "must-see"]},
    {"city": "Paris", "country": "France", "name": "Louvre Museum",
     "description": "World's largest art museum. Home to the Mona Lisa.",
     "image_url": "https://images.unsplash.com/photo-1565099824688-e93eb20fe622?w=800",
     "lat": 48.8606, "lng": 2.3376, "entry_fee_local": "€22", "entry_fee_usd": 24.0,
     "entry_fee_foreigner_usd": 24.0, "transit_cost_usd": 2.30, "transit_time_min": 12,
     "activities": [{"name": "Guided tour", "cost_usd": 60}, {"name": "Audio guide", "cost_usd": 6}],
     "rating": 4.8, "tags": ["museum", "art", "culture"]},
    {"city": "Paris", "country": "France", "name": "Montmartre",
     "description": "Bohemian hilltop district with Sacré-Cœur views.",
     "image_url": "https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=800",
     "lat": 48.8867, "lng": 2.3431, "entry_fee_local": "Free", "entry_fee_usd": 0.0,
     "entry_fee_foreigner_usd": 0.0, "transit_cost_usd": 2.30, "transit_time_min": 25,
     "activities": [{"name": "Funicular", "cost_usd": 2.5}, {"name": "Artist portrait", "cost_usd": 40}],
     "rating": 4.6, "tags": ["district", "views", "art"]},
    # TOKYO
    {"city": "Tokyo", "country": "Japan", "name": "Shibuya Crossing",
     "description": "Busiest pedestrian crossing in the world. Neon chaos.",
     "image_url": "https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800",
     "lat": 35.6595, "lng": 139.7005, "entry_fee_local": "Free", "entry_fee_usd": 0.0,
     "entry_fee_foreigner_usd": 0.0, "transit_cost_usd": 1.80, "transit_time_min": 20,
     "activities": [{"name": "Shibuya Sky observation", "cost_usd": 18}],
     "rating": 4.5, "tags": ["urban", "iconic", "photo"]},
    {"city": "Tokyo", "country": "Japan", "name": "Senso-ji Temple",
     "description": "Ancient Buddhist temple in Asakusa, Tokyo's oldest.",
     "image_url": "https://images.unsplash.com/photo-1583400913573-e1f0c2eea15b?w=800",
     "lat": 35.7148, "lng": 139.7967, "entry_fee_local": "Free", "entry_fee_usd": 0.0,
     "entry_fee_foreigner_usd": 0.0, "transit_cost_usd": 1.80, "transit_time_min": 30,
     "activities": [{"name": "Fortune omikuji", "cost_usd": 1}, {"name": "Kimono rental", "cost_usd": 35}],
     "rating": 4.7, "tags": ["temple", "culture", "spiritual"]},
    {"city": "Tokyo", "country": "Japan", "name": "TeamLab Planets",
     "description": "Immersive digital art museum with water installations.",
     "image_url": "https://images.unsplash.com/photo-1554797589-7241bb691973?w=800",
     "lat": 35.6491, "lng": 139.7942, "entry_fee_local": "¥3800", "entry_fee_usd": 26.0,
     "entry_fee_foreigner_usd": 26.0, "transit_cost_usd": 2.50, "transit_time_min": 35,
     "activities": [{"name": "Full exhibit", "cost_usd": 26}],
     "rating": 4.8, "tags": ["art", "immersive", "digital"]},
    # BALI
    {"city": "Bali", "country": "Indonesia", "name": "Tegallalang Rice Terraces",
     "description": "Emerald green stepped rice paddies near Ubud.",
     "image_url": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
     "lat": -8.4318, "lng": 115.2782, "entry_fee_local": "IDR 25,000", "entry_fee_usd": 1.60,
     "entry_fee_foreigner_usd": 1.60, "transit_cost_usd": 8.0, "transit_time_min": 45,
     "activities": [{"name": "Bali swing", "cost_usd": 15}, {"name": "Coconut drink", "cost_usd": 2}],
     "rating": 4.5, "tags": ["nature", "views", "photo"]},
    {"city": "Bali", "country": "Indonesia", "name": "Uluwatu Temple",
     "description": "Cliffside temple with Kecak fire dance at sunset.",
     "image_url": "https://images.unsplash.com/photo-1584611024463-2d80af7c6cc7?w=800",
     "lat": -8.8291, "lng": 115.0849, "entry_fee_local": "IDR 50,000", "entry_fee_usd": 3.20,
     "entry_fee_foreigner_usd": 3.20, "transit_cost_usd": 12.0, "transit_time_min": 60,
     "activities": [{"name": "Kecak dance show", "cost_usd": 10}],
     "rating": 4.7, "tags": ["temple", "sunset", "cultural"]},
    {"city": "Bali", "country": "Indonesia", "name": "Nusa Penida",
     "description": "Rugged island with Kelingking cliff and manta rays.",
     "image_url": "https://images.unsplash.com/photo-1573790387438-4da905039392?w=800",
     "lat": -8.7274, "lng": 115.5444, "entry_fee_local": "Boat + tour", "entry_fee_usd": 55.0,
     "entry_fee_foreigner_usd": 55.0, "transit_cost_usd": 20.0, "transit_time_min": 90,
     "activities": [{"name": "Full day tour", "cost_usd": 65}, {"name": "Snorkel with mantas", "cost_usd": 35}],
     "rating": 4.9, "tags": ["island", "adventure", "beach"]},
    # BARCELONA
    {"city": "Barcelona", "country": "Spain", "name": "Sagrada Família",
     "description": "Gaudí's unfinished basilica, world icon of Catalan Modernism.",
     "image_url": "https://images.unsplash.com/photo-1583779457094-ab6f77f7bf57?w=800",
     "lat": 41.4036, "lng": 2.1744, "entry_fee_local": "€26", "entry_fee_usd": 28.0,
     "entry_fee_foreigner_usd": 28.0, "transit_cost_usd": 2.55, "transit_time_min": 15,
     "activities": [{"name": "Tower access", "cost_usd": 40}, {"name": "Guided tour", "cost_usd": 55}],
     "rating": 4.8, "tags": ["church", "architecture", "gaudi"]},
    {"city": "Barcelona", "country": "Spain", "name": "Park Güell",
     "description": "Whimsical park with mosaic salamander and city views.",
     "image_url": "https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800",
     "lat": 41.4145, "lng": 2.1527, "entry_fee_local": "€10", "entry_fee_usd": 11.0,
     "entry_fee_foreigner_usd": 11.0, "transit_cost_usd": 2.55, "transit_time_min": 25,
     "activities": [{"name": "Monumental Zone", "cost_usd": 11}],
     "rating": 4.6, "tags": ["park", "gaudi", "views"]},
    {"city": "Barcelona", "country": "Spain", "name": "La Boqueria Market",
     "description": "Historic food market on La Rambla. Fresh tapas heaven.",
     "image_url": "https://images.unsplash.com/photo-1553527922-f2a0e69c5be5?w=800",
     "lat": 41.3818, "lng": 2.1717, "entry_fee_local": "Free", "entry_fee_usd": 0.0,
     "entry_fee_foreigner_usd": 0.0, "transit_cost_usd": 2.55, "transit_time_min": 10,
     "activities": [{"name": "Tapas tasting tour", "cost_usd": 45}, {"name": "Jamón sandwich", "cost_usd": 5}],
     "rating": 4.5, "tags": ["food", "market", "local"]},
]

SEED_PARTNERS = [
    {"display_name": "Sofia R.", "email": "sofia@guardtrip.demo", "gender": "female",
     "language": "English", "travel_style": "Solo Female", "city": "Paris", "country": "France",
     "lat": 48.8566, "lng": 2.3522, "bio": "Design student on a 2-month Euro trip. Coffee + museums."},
    {"display_name": "Kenji M.", "email": "kenji@guardtrip.demo", "gender": "male",
     "language": "English", "travel_style": "Photographer", "city": "Tokyo", "country": "Japan",
     "lat": 35.6762, "lng": 139.6503, "bio": "Local photographer, happy to show hidden spots."},
    {"display_name": "Aisha K.", "email": "aisha@guardtrip.demo", "gender": "female",
     "language": "English", "travel_style": "Adventure", "city": "Bali", "country": "Indonesia",
     "lat": -8.3405, "lng": 115.0920, "bio": "Diving + surfing daily. Looking for beach buddies."},
    {"display_name": "Marc D.", "email": "marc@guardtrip.demo", "gender": "male",
     "language": "Spanish", "travel_style": "Foodie", "city": "Barcelona", "country": "Spain",
     "lat": 41.3851, "lng": 2.1734, "bio": "Local. Tapas expert. Free walking tours weekends."},
    {"display_name": "Priya S.", "email": "priya@guardtrip.demo", "gender": "female",
     "language": "English", "travel_style": "Solo Female", "city": "Paris", "country": "France",
     "lat": 48.8566, "lng": 2.3522, "bio": "Fashion week visitor. Museum crawls welcome."},
    {"display_name": "Luca B.", "email": "luca@guardtrip.demo", "gender": "male",
     "language": "English", "travel_style": "Digital Nomad", "city": "Bali", "country": "Indonesia",
     "lat": -8.3405, "lng": 115.0920, "bio": "Remote engineer, coworking in Canggu."},
]

SEED_ALERTS = [
    {"kind": "pickpocket", "title": "High pickpocket risk", "description": "Reports on metro line 1 near Louvre.",
     "city": "Paris", "lat": 48.8606, "lng": 2.3376},
    {"kind": "taxi_scam", "title": "Taxi overcharging", "description": "Unmetered taxis outside CDG - always request meter.",
     "city": "Paris", "lat": 49.0097, "lng": 2.5479},
    {"kind": "tourist_scam", "title": "Bracelet scam", "description": "Men tying friendship bracelets at Sacré-Cœur then demanding cash.",
     "city": "Paris", "lat": 48.8867, "lng": 2.3431},
    {"kind": "pickpocket", "title": "Watch belongings", "description": "Crowded Shibuya scramble - keep bag in front.",
     "city": "Tokyo", "lat": 35.6595, "lng": 139.7005},
    {"kind": "taxi_scam", "title": "Kuta area drivers", "description": "Some drivers refuse Grab and quote 4x. Use ride apps.",
     "city": "Bali", "lat": -8.7186, "lng": 115.1686},
    {"kind": "pickpocket", "title": "La Rambla vigilance", "description": "Distraction thefts common near La Rambla.",
     "city": "Barcelona", "lat": 41.3818, "lng": 2.1717},
]

async def seed_db():
    if await db.hotspots.count_documents({}) == 0:
        for h in SEED_HOTSPOTS:
            doc = {**h, "id": str(uuid.uuid4())}
            await db.hotspots.insert_one(doc)
        logging.info("Seeded %d hotspots", len(SEED_HOTSPOTS))
    if await db.alerts.count_documents({}) == 0:
        for a in SEED_ALERTS:
            doc = {**a, "id": str(uuid.uuid4()), "reported_by": "GuardTrip Community",
                   "reported_by_id": "system", "created_at": now_iso(), "verified": True}
            await db.alerts.insert_one(doc)
        logging.info("Seeded %d alerts", len(SEED_ALERTS))
    if await db.users.count_documents({"email": {"$regex": "@guardtrip.demo$"}}) == 0:
        expires = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
        for p in SEED_PARTNERS:
            uid = str(uuid.uuid4())
            udoc = {
                "id": uid, "email": p["email"],
                "password_hash": hash_password("demo1234"),
                "display_name": p["display_name"], "gender": p["gender"],
                "language": p["language"], "travel_style": p["travel_style"],
                "subscription_tier": "year", "subscription_expires_at": expires,
                "current_city": p["city"], "current_country": p["country"],
                "current_lat": p["lat"], "current_lng": p["lng"],
                "created_at": now_iso(),
            }
            await db.users.insert_one(udoc)
            await db.locations_pool.insert_one({
                "user_id": uid, "display_name": p["display_name"],
                "gender": p["gender"], "language": p["language"],
                "travel_style": p["travel_style"], "city": p["city"], "country": p["country"],
                "lat": p["lat"], "lng": p["lng"], "bio": p["bio"], "last_active": now_iso(),
            })
        logging.info("Seeded %d partners", len(SEED_PARTNERS))


@app.on_event("startup")
async def on_startup():
    await seed_db()


@api_router.get("/")
async def root():
    return {"app": "GuardTrip", "status": "ok"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
