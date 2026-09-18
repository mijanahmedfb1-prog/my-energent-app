import { Linking, Platform } from "react-native";
import * as Location from "expo-location";

export type Coords = { lat: number; lng: number };

// Kept only for legacy fallback distance computation
export const SUPPORTED_CITIES: Record<string, { lat: number; lng: number; country: string }> = {
  Paris: { lat: 48.8566, lng: 2.3522, country: "France" },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: "Japan" },
  Bali: { lat: -8.3405, lng: 115.0920, country: "Indonesia" },
  Barcelona: { lat: 41.3851, lng: 2.1734, country: "Spain" },
};

function haversineKm(a: Coords, b: Coords): number {
  const R = 6371;
  const p = Math.PI / 180;
  const s =
    0.5 -
    Math.cos((b.lat - a.lat) * p) / 2 +
    (Math.cos(a.lat * p) * Math.cos(b.lat * p) * (1 - Math.cos((b.lng - a.lng) * p))) / 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function reverseGeocode(coords: Coords): Promise<{ city: string; country: string }> {
  try {
    if (Platform.OS !== "web") {
      const res = await Location.reverseGeocodeAsync(coords);
      const r: any = res && res[0];
      if (r) {
        const city = r.city || r.subregion || r.region || r.district || "Unknown";
        const country = r.country || "";
        return { city, country };
      }
    } else {
      // Use OpenStreetMap Nominatim (no key required, small rate limits fine for MVP)
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}&zoom=10`;
      const r = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (r.ok) {
        const data = await r.json();
        const a = data.address || {};
        const city = a.city || a.town || a.village || a.municipality || a.county || data.name || "Unknown";
        const country = a.country || "";
        return { city, country };
      }
    }
  } catch {}
  return { city: "Unknown", country: "" };
}

export type LocationResult =
  | {
      status: "granted";
      coords: Coords;
      city: string;
      country: string;
    }
  | { status: "denied"; canAskAgain: boolean; message: string }
  | { status: "error"; message: string };

export async function requestAndGetLocation(): Promise<LocationResult> {
  try {
    if (Platform.OS === "web") {
      if (!("geolocation" in navigator)) {
        return { status: "error", message: "Geolocation not supported in this browser." };
      }
      const coords: Coords = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
      }).catch((err) => {
        throw new Error(err?.message || "Location permission denied.");
      });
      const geo = await reverseGeocode(coords);
      return { status: "granted", coords, city: geo.city, country: geo.country };
    }

    let perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      if (!perm.canAskAgain) {
        return {
          status: "denied", canAskAgain: false,
          message: "Location was previously blocked. Open Settings to enable it.",
        };
      }
      perm = await Location.requestForegroundPermissionsAsync();
    }
    if (perm.status !== "granted") {
      return {
        status: "denied", canAskAgain: perm.canAskAgain,
        message: perm.canAskAgain
          ? "Location permission is required to use GPS features."
          : "Location was blocked. Open Settings to enable it.",
      };
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    const geo = await reverseGeocode(coords);
    return { status: "granted", coords, city: geo.city, country: geo.country };
  } catch (e: any) {
    if (String(e?.message || "").toLowerCase().includes("denied")) {
      return { status: "denied", canAskAgain: false, message: e.message };
    }
    return { status: "error", message: e?.message || "Failed to get location." };
  }
}

export function openLocationSettings() {
  Linking.openSettings().catch(() => {});
}

export function isSeededCity(city: string): boolean {
  return Object.keys(SUPPORTED_CITIES).some(
    (c) => c.toLowerCase() === (city || "").toLowerCase(),
  );
}

export { haversineKm };
