import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, ImageBackground,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";
import { requestAndGetLocation, openLocationSettings, SUPPORTED_CITIES } from "@/src/location";

const CITIES = ["Paris", "Tokyo", "Bali", "Barcelona"];
const CITY_COORDS = SUPPORTED_CITIES;

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [city, setCity] = useState(user?.current_city && CITIES.includes(user.current_city) ? user.current_city : "Paris");
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [wallet, setWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [locBusy, setLocBusy] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [nearKm, setNearKm] = useState<number | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState(false);

  const load = useCallback(async (c: string, coordsOverride?: { lat: number; lng: number }) => {
    setLoading(true);
    try {
      const cityCoords = CITY_COORDS[c];
      const useCoords = coordsOverride || cityCoords;
      await api.checkin({ city: c, country: cityCoords.country, lat: useCoords.lat, lng: useCoords.lng });
      const [res, w] = await Promise.all([
        api.hotspots({ city: c, lat: useCoords.lat, lng: useCoords.lng }),
        api.walletToday().catch(() => null),
      ]);
      setHotspots((res as any).hotspots || []);
      setWallet(w);
      refresh();
    } catch (e) {
      setHotspots([]);
    } finally { setLoading(false); }
  }, [refresh]);

  // Rehydrate last GPS from storage
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("gt_gps");
      if (raw) { try { setGps(JSON.parse(raw)); } catch {} }
    })();
  }, []);

  useEffect(() => { load(city, gps || undefined); }, [city]);

  const onRefresh = async () => { setRefreshing(true); await load(city, gps || undefined); setRefreshing(false); };

  const useMyLocation = async () => {
    setLocBusy(true); setLocError(null); setBlocked(false);
    const r = await requestAndGetLocation();
    setLocBusy(false);
    if (r.status === "granted") {
      setGps(r.coords);
      setNearKm(r.nearestDistanceKm);
      await AsyncStorage.setItem("gt_gps", JSON.stringify(r.coords));
      await AsyncStorage.setItem("gt_gps_city", r.city);
      if (r.city !== city) setCity(r.city);
      else load(r.city, r.coords);
    } else if (r.status === "denied") {
      setBlocked(!r.canAskAgain);
      setLocError(r.message);
    } else {
      setLocError(r.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: spacing["3xl"] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.hello}>Welcome, {user?.display_name?.split(" ")[0]}</Text>
            <Text style={styles.headerTitle}>Discover</Text>
          </View>
          <Pressable onPress={() => router.push("/profile")} style={styles.avatar} testID="discover-profile-button">
            <Text style={styles.avatarText}>{user?.display_name?.[0]?.toUpperCase() || "?"}</Text>
          </Pressable>
        </View>

        <View style={styles.locRow}>
          <Pressable
            testID="discover-use-location"
            style={[styles.locBtn, gps && styles.locBtnActive]}
            onPress={blocked ? openLocationSettings : useMyLocation}
            disabled={locBusy}
          >
            {locBusy ? (
              <ActivityIndicator color={colors.brandPrimary} size="small" />
            ) : (
              <Text style={[styles.locBtnText, gps && styles.locBtnTextActive]}>
                {blocked ? "◈  Open Settings" : gps ? `◉  Live GPS · ${city}` : "◉  Use my location"}
              </Text>
            )}
          </Pressable>
          {gps ? (
            <Pressable
              testID="discover-clear-location"
              onPress={async () => {
                setGps(null); setNearKm(null); setLocError(null);
                await AsyncStorage.removeItem("gt_gps");
                await AsyncStorage.removeItem("gt_gps_city");
                load(city);
              }}
            >
              <Text style={styles.clearLoc}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        {locError ? (
          <Text style={styles.locError} testID="discover-loc-error">{locError}</Text>
        ) : nearKm != null && nearKm > 200 ? (
          <Text style={styles.locHint}>
            Nearest supported city is {city} · ~{nearKm} km away.
          </Text>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          style={{ maxHeight: 56 }}
        >
          {CITIES.map((c) => (
            <Pressable
              key={c} onPress={() => setCity(c)}
              testID={`discover-city-${c.toLowerCase()}`}
              style={[styles.chip, city === c && styles.chipActive]}
            >
              <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          testID="discover-wallet-card"
          style={styles.walletCard}
          onPress={() => router.push("/wallet")}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.walletLabel}>TRIP WALLET · TODAY</Text>
            <Text style={[
              styles.walletValue,
              wallet?.remaining_usd != null && wallet.remaining_usd < 0 && { color: colors.error },
            ]}>
              ${(wallet?.remaining_usd ?? wallet?.daily_budget_usd ?? user?.daily_budget_usd ?? 80).toFixed(2)}
            </Text>
            <Text style={styles.walletSub}>
              {wallet ? `Spent $${wallet.spent_usd.toFixed(2)} of $${wallet.daily_budget_usd.toFixed(0)}` : "Set a daily budget to start"}
            </Text>
            <View style={styles.walletTrack}>
              <View style={[
                styles.walletFill,
                { width: `${Math.min(100, wallet?.percent_used ?? 0)}%` },
                wallet?.remaining_usd != null && wallet.remaining_usd < 0 && { backgroundColor: colors.error },
              ]} />
            </View>
          </View>
          <Text style={styles.walletArrow}>→</Text>
        </Pressable>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing["2xl"] }} />
        ) : hotspots.length === 0 ? (
          <Text style={styles.empty}>No hotspots for {city}. Pull to refresh.</Text>
        ) : (
          <View style={styles.list}>
            {hotspots.map((h) => (
              <Pressable
                key={h.id}
                testID={`hotspot-card-${h.id}`}
                onPress={() => router.push({ pathname: "/hotspot/[id]", params: { id: h.id } })}
                style={styles.card}
              >
                <ImageBackground source={{ uri: h.image_url }} style={styles.cardImg} imageStyle={{ borderRadius: radius.lg }}>
                  <LinearGradient
                    colors={["transparent", "rgba(10,10,10,0.95)"]}
                    style={{ ...StyleSheet.absoluteFillObject, borderRadius: radius.lg }}
                  />
                  <View style={styles.cardContent}>
                    <View style={styles.cardTop}>
                      <View style={styles.rating}>
                        <Text style={styles.ratingText}>★ {h.rating}</Text>
                      </View>
                      {h.distance_km != null ? (
                        <View style={styles.distance}>
                          <Text style={styles.distanceText}>{h.distance_km} km</Text>
                        </View>
                      ) : null}
                    </View>
                    <View>
                      <Text style={styles.cardTitle}>{h.name}</Text>
                      <Text style={styles.cardDesc} numberOfLines={2}>{h.description}</Text>
                      <View style={styles.costs}>
                        <View style={styles.cost}>
                          <Text style={styles.costLabel}>Entry</Text>
                          <Text style={styles.costValue}>${h.entry_fee_foreigner_usd}</Text>
                        </View>
                        <View style={styles.cost}>
                          <Text style={styles.costLabel}>Transit</Text>
                          <Text style={styles.costValue}>${h.transit_cost_usd}</Text>
                        </View>
                        <View style={styles.cost}>
                          <Text style={styles.costLabel}>~ Time</Text>
                          <Text style={styles.costValue}>{h.transit_time_min}m</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                </ImageBackground>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, marginBottom: spacing.lg },
  hello: { color: colors.muted, fontSize: 12, letterSpacing: 1, textTransform: "uppercase" },
  headerTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 34, marginTop: 2 },
  avatar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.brandPrimary, justifyContent: "center", alignItems: "center",
  },
  avatarText: { color: colors.brandPrimary, fontSize: 16, fontWeight: "700" },
  locRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  locBtn: { paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
    minHeight: 38, justifyContent: "center" },
  locBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  locBtnText: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "600", letterSpacing: 0.3 },
  locBtnTextActive: { color: colors.brandPrimary },
  clearLoc: { color: colors.muted, fontSize: 12, textDecorationLine: "underline" },
  locError: { color: colors.error, fontSize: 11, paddingHorizontal: spacing.xl, marginTop: 6 },
  locHint: { color: colors.muted, fontSize: 11, paddingHorizontal: spacing.xl, marginTop: 6 },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  chip: {
    height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing["2xl"] },
  walletCard: {
    marginHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: spacing.sm,
    backgroundColor: colors.brandTertiary, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.brandPrimary,
    padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md,
  },
  walletLabel: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  walletValue: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 32, marginTop: 2 },
  walletSub: { color: colors.muted, fontSize: 11, marginTop: 2 },
  walletTrack: { height: 4, borderRadius: 2, backgroundColor: colors.surfaceTertiary, marginTop: spacing.sm, overflow: "hidden" },
  walletFill: { height: 4, backgroundColor: colors.brandPrimary, borderRadius: 2 },
  walletArrow: { color: colors.brandPrimary, fontSize: 24 },
  list: { paddingHorizontal: spacing.xl, gap: spacing.lg, marginTop: spacing.md },
  card: { borderRadius: radius.lg, overflow: "hidden" },
  cardImg: { width: "100%", height: 340, justifyContent: "space-between", padding: spacing.lg },
  cardContent: { flex: 1, justifyContent: "space-between" },
  cardTop: { flexDirection: "row", justifyContent: "space-between" },
  rating: {
    backgroundColor: "rgba(10,10,10,0.7)", paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.brandPrimary,
  },
  ratingText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700" },
  distance: {
    backgroundColor: "rgba(10,10,10,0.7)", paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.pill,
  },
  distanceText: { color: colors.onSurface, fontSize: 12 },
  cardTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 28, lineHeight: 30 },
  cardDesc: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4, opacity: 0.9 },
  costs: { flexDirection: "row", gap: spacing.lg, marginTop: spacing.md },
  cost: {},
  costLabel: { color: colors.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 0.8 },
  costValue: { color: colors.brandPrimary, fontSize: 15, fontWeight: "700", marginTop: 2 },
});
