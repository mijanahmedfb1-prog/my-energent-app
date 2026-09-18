"""GuardTrip backend end-to-end pytest suite.
Covers: auth, subscriptions/paywall (402), hotspots, cities, partners/checkin,
1-1 chat, AI concierge (Claude), alerts, offline pack, expense predict.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or "").rstrip("/") + "/api"
assert BASE_URL.startswith("http"), "EXPO_PUBLIC_BACKEND_URL missing"

FRESH_EMAIL = f"test_{uuid.uuid4().hex[:10]}@guardtrip.example.com"
FRESH_PASSWORD = "test1234"

STATE = {}


# ----------------------- AUTH -----------------------
class TestAuth:
    def test_register_returns_jwt(self):
        r = requests.post(f"{BASE_URL}/auth/register", json={
            "email": FRESH_EMAIL,
            "password": FRESH_PASSWORD,
            "display_name": "Test User",
            "gender": "female",
            "language": "English",
            "travel_style": "Solo Female",
        })
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data["token"]
        assert data["user"]["email"] == FRESH_EMAIL
        assert data["user"]["is_premium"] is False
        STATE["token"] = data["token"]
        STATE["user_id"] = data["user"]["id"]

    def test_login_same_user(self):
        r = requests.post(f"{BASE_URL}/auth/login", json={
            "email": FRESH_EMAIL, "password": FRESH_PASSWORD,
        })
        assert r.status_code == 200, r.text
        assert "token" in r.json()

    def test_me_returns_non_premium(self):
        r = requests.get(f"{BASE_URL}/auth/me",
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        me = r.json()
        assert me["is_premium"] is False
        assert me["email"] == FRESH_EMAIL


# ----------------------- PAYWALL 402 -----------------------
class TestPaywall:
    def test_hotspots_without_premium_returns_402(self):
        r = requests.get(f"{BASE_URL}/hotspots",
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 402, r.text


# ----------------------- SUBSCRIPTIONS -----------------------
class TestSubscription:
    def test_activate_month_sets_premium(self):
        r = requests.post(f"{BASE_URL}/subscriptions/activate",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"tier": "month"})
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["is_premium"] is True
        assert u["subscription_tier"] == "month"
        assert u["subscription_expires_at"] is not None


# ----------------------- HOTSPOTS + CITIES -----------------------
class TestHotspots:
    def test_hotspots_paris_sorted_by_distance(self):
        r = requests.get(f"{BASE_URL}/hotspots",
                         params={"city": "Paris", "lat": 48.8566, "lng": 2.3522},
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200, r.text
        hotspots = r.json()["hotspots"]
        assert len(hotspots) == 3
        assert all(h["city"] == "Paris" for h in hotspots)
        dists = [h["distance_km"] for h in hotspots]
        assert dists == sorted(dists)
        STATE["paris_hotspot_id"] = hotspots[0]["id"]

    def test_cities_returns_four(self):
        r = requests.get(f"{BASE_URL}/cities",
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        cities = r.json()["cities"]
        assert len(cities) == 4
        names = {c["city"] for c in cities}
        assert {"Paris", "Tokyo", "Bali", "Barcelona"} == names


# ----------------------- PARTNERS -----------------------
class TestPartners:
    def test_checkin_paris(self):
        r = requests.post(f"{BASE_URL}/partners/checkin",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"city": "Paris", "country": "France",
                                "lat": 48.8566, "lng": 2.3522})
        assert r.status_code == 200
        assert r.json()["success"] is True

    def test_partners_paris_female_returns_sofia_and_priya(self):
        r = requests.get(f"{BASE_URL}/partners",
                         params={"city": "Paris", "gender": "female"},
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        partners = r.json()["partners"]
        names = {p["display_name"] for p in partners}
        assert "Sofia R." in names
        assert "Priya S." in names
        # verify current user excluded
        assert STATE["user_id"] not in {p["id"] for p in partners}
        # capture sofia id for chat
        for p in partners:
            if p["display_name"] == "Sofia R.":
                STATE["sofia_id"] = p["id"]


# ----------------------- CHAT -----------------------
class TestChat:
    def test_create_room_and_messaging(self):
        # create room
        r = requests.post(f"{BASE_URL}/chat/rooms",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"user_id": STATE["sofia_id"]})
        assert r.status_code == 200, r.text
        room_id = r.json()["room_id"]
        STATE["room_id"] = room_id

        # send msg from test user
        r2 = requests.post(f"{BASE_URL}/chat/rooms/{room_id}/messages",
                           headers={"Authorization": f"Bearer {STATE['token']}"},
                           json={"text": "Hello Sofia!"})
        assert r2.status_code == 200
        assert r2.json()["status"] == "delivered"

        # sofia logs in
        sr = requests.post(f"{BASE_URL}/auth/login",
                           json={"email": "sofia@guardtrip.demo", "password": "demo1234"})
        assert sr.status_code == 200
        sofia_token = sr.json()["token"]

        # sofia sends a reply
        r3 = requests.post(f"{BASE_URL}/chat/rooms/{room_id}/messages",
                           headers={"Authorization": f"Bearer {sofia_token}"},
                           json={"text": "Hi there!"})
        assert r3.status_code == 200

        # test user fetches - triggers marking sofia's message as read (returned pre-update)
        r4 = requests.get(f"{BASE_URL}/chat/rooms/{room_id}/messages",
                          headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r4.status_code == 200
        msgs = r4.json()["messages"]
        assert len(msgs) == 2

        # second fetch verifies persistence - incoming (from sofia) must now be read
        r5 = requests.get(f"{BASE_URL}/chat/rooms/{room_id}/messages",
                          headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r5.status_code == 200
        msgs2 = r5.json()["messages"]
        incoming = [m for m in msgs2 if m["sender_id"] == STATE["sofia_id"]]
        assert incoming and incoming[0]["status"] == "read"


# ----------------------- AI CONCIERGE (Claude) -----------------------
class TestAI:
    def test_ai_chat_returns_reply(self):
        r = requests.post(f"{BASE_URL}/ai/chat",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"message": "Give me one safety tip for Paris metro.",
                                "city": "Paris", "lat": 48.8566, "lng": 2.3522},
                          timeout=60)
        assert r.status_code == 200, r.text
        reply = r.json()["reply"]
        assert isinstance(reply, str) and len(reply.strip()) > 0
        # Should not be the fallback error string
        assert "trouble reaching the concierge" not in reply.lower()

    def test_ai_history_has_messages(self):
        r = requests.get(f"{BASE_URL}/ai/history",
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        msgs = r.json()["messages"]
        assert len(msgs) >= 2
        roles = {m["role"] for m in msgs}
        assert {"user", "assistant"} <= roles


# ----------------------- ALERTS -----------------------
class TestAlerts:
    def test_create_alert(self):
        r = requests.post(f"{BASE_URL}/alerts",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"kind": "pickpocket",
                                "title": "TEST_ Watch out",
                                "description": "TEST alert near Eiffel.",
                                "city": "Paris",
                                "lat": 48.8584, "lng": 2.2945})
        assert r.status_code == 200
        assert r.json()["id"]

    def test_list_alerts_paris_sorted_by_distance(self):
        r = requests.get(f"{BASE_URL}/alerts",
                         params={"city": "Paris", "lat": 48.8566, "lng": 2.3522},
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        alerts = r.json()["alerts"]
        assert len(alerts) >= 3
        dists = [a["distance_km"] for a in alerts]
        assert dists == sorted(dists)


# ----------------------- OFFLINE -----------------------
class TestOffline:
    def test_offline_pack_paris(self):
        r = requests.get(f"{BASE_URL}/offline/pack",
                         params={"city": "Paris"},
                         headers={"Authorization": f"Bearer {STATE['token']}"})
        assert r.status_code == 200
        data = r.json()
        assert len(data["hotspots"]) == 3
        assert len(data["alerts"]) >= 3
        phrase_words = [p["local"] for p in data["phrases"]]
        assert "Bonjour" in phrase_words


# ----------------------- EXPENSE PREDICT -----------------------
class TestExpense:
    def test_expense_predict_with_hotspot(self):
        r = requests.post(f"{BASE_URL}/expense/predict",
                          headers={"Authorization": f"Bearer {STATE['token']}"},
                          json={"hotspot_id": STATE["paris_hotspot_id"]},
                          timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["hotspot"]["id"] == STATE["paris_hotspot_id"]
        assert isinstance(data["ai_tip"], str) and len(data["ai_tip"]) > 0
