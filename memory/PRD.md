# GuardTrip — Product Requirements (MVP)

## Overview
GuardTrip is a 100% paid, premium-only mobile app acting as a Personal AI Local Tour Guide and Safety Shield for solo international travelers. All content is behind a hard paywall enforced right after signup.

## Tech Stack
- Frontend: Expo Router (React Native), dark-first Glass/Luxe theme (champagne gold on obsidian)
- Backend: FastAPI + MongoDB
- AI: Claude Sonnet 4.6 via Emergent LLM Key (`emergentintegrations`)
- Auth: Email/password + JWT (bcrypt); token stored in AsyncStorage
- Payments (MVP): Mocked in-app activation. On real device, this hooks into RevenueCat / Apple Pay / Google Pay (requires native build)

## Subscription Tiers
- 7-day city pass ($9.99)
- Monthly ($19)
- Annual ($99)

## Features
1. Hyper-Local Discovery — Curated hotspots per city (Paris, Tokyo, Bali, Barcelona) with entry / transit / activity costs and distance-from-you sorting.
2. AI Travel Assistant — Claude Sonnet 4.6 concierge, GPS-aware, persisted per-user history.
3. Travel Partner Finder — Location pool of verified premium travelers, gender-match toggle (safety), language filter, one-tap chat.
4. 1-1 Buddy Chat — Sent / Delivered / Read receipts, polling refresh.
5. Safety Radar — City-filtered geo alerts (pickpocket, scam, taxi). Users can report incidents.
6. Offline Survival Mode — Downloadable city packs (hotspots + alerts + phrase list) cached in AsyncStorage.
7. Profile — Membership status, offline pack manager, logout.

## Access Control
- All feature endpoints go through `require_premium` — HTTP 402 if the user's subscription is missing or expired.
- Frontend `AuthGate` redirects: no user → welcome, user without premium → paywall, premium → tabs.

## Data Models (Mongo collections)
- `users`, `subscriptions`, `hotspots`, `locations_pool`, `chat_rooms`, `chat_messages`, `ai_chats`, `alerts`

## Non-goals (MVP)
- No hotel/flight/car rental booking
- Real native IAP (deferred to device build)
- Push notifications
