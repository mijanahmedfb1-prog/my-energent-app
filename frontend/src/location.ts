import { Linking, Platform } from "react-native";
import * as Location from "expo-location";

export type Coords = { lat: number; lng: number };

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

export function nearestSupportedCity(coords: Coords): {
  city: string; country: string; distance_km: number;
} {
  let best = { city: "Paris", country: "France", distance_km: Number.POSITIVE_INFINITY };
  for (const [city, c] of Object.entries(SUPPORTED_CITIES)) {
    const d = haversineKm(coords, c);
    if (d < best.distance_km) best = { city, country: c.country, distance_km: d };
  }
  return { ...best, distance_km: Math.round(best.distance_km) };
}

export type LocationResult =
  | { status: "granted"; coords: Coords; city: string; country: string; nearestDistanceKm: number }
  | { status: "denied"; canAskAgain: boolean; message: string }
  | { status: "error"; message: string };

export async function requestAndGetLocation(): Promise<LocationResult> {
  try {
    // Web fallback via navigator.geolocation (expo-location supports web but permissions API varies)
    if (Platform.OS === "web") {
      if (!("geolocation" in navigator)) {
        return { status: "error", message: "Geolocation not supported in this browser." };
      }
      return await new Promise<LocationResult>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const near = nearestSupportedCity(coords);
            resolve({
              status: "granted", coords,
              city: near.city, country: near.country,
              nearestDistanceKm: near.distance_km,
            });
          },
          (err) => resolve({
            status: "denied", canAskAgain: false,
            message: err.message || "Location permission denied.",
          }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        );
      });
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
    const near = nearestSupportedCity(coords);
    return {
      status: "granted", coords,
      city: near.city, country: near.country,
      nearestDistanceKm: near.distance_km,
    };
  } catch (e: any) {
    return { status: "error", message: e?.message || "Failed to get location." };
  }
}

export function openLocationSettings() {
  Linking.openSettings().catch(() => {});
}
