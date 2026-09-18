import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl, ImageBackground,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const CITIES = ["Paris", "Tokyo", "Bali", "Barcelona"];
const CITY_COORDS: Record<string, { lat: number; lng: number; country: string }> = {
  Paris: { lat: 48.8566, lng: 2.3522, country: "France" },
  Tokyo: { lat: 35.6762, lng: 139.6503, country: "Japan" },
  Bali: { lat: -8.3405, lng: 115.0920, country: "Indonesia" },
  Barcelona: { lat: 41.3851, lng: 2.1734, country: "Spain" },
};

export default function Discover() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [city, setCity] = useState(user?.current_city && CITIES.includes(user.current_city) ? user.current_city : "Paris");
  const [hotspots, setHotspots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (c: string) => {
    setLoading(true);
    try {
      const coords = CITY_COORDS[c];
      await api.checkin({ city: c, country: coords.country, lat: coords.lat, lng: coords.lng });
      const res: any = await api.hotspots({ city: c, lat: coords.lat, lng: coords.lng });
      setHotspots(res.hotspots || []);
      refresh();
    } catch (e) {
      setHotspots([]);
    } finally { setLoading(false); }
  }, [refresh]);

  useEffect(() => { load(city); }, [city]);

  const onRefresh = async () => { setRefreshing(true); await load(city); setRefreshing(false); };

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
