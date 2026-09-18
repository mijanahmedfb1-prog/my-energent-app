import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const CITIES = ["Paris", "Tokyo", "Bali", "Barcelona"];

export default function Partners() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [city, setCity] = useState(user?.current_city || "Paris");
  const [sameGenderOnly, setSameGenderOnly] = useState(user?.gender === "female");
  const [partners, setPartners] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { city };
      if (sameGenderOnly && user?.gender) params.gender = user.gender;
      const res: any = await api.partners(params);
      setPartners(res.partners || []);
    } catch { setPartners([]); }
    finally { setLoading(false); }
  }, [city, sameGenderOnly, user?.gender]);

  useEffect(() => { load(); }, [load]);

  const openChat = async (userId: string) => {
    try {
      const res: any = await api.createRoom(userId);
      router.push({ pathname: "/chat/[roomId]", params: { roomId: res.room_id, name: res.other_user.display_name } });
    } catch (e) {}
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.eyebrow}>VERIFIED MEMBERS</Text>
        <Text style={styles.title}>Buddies</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow} style={{ maxHeight: 56 }}>
        {CITIES.map((c) => (
          <Pressable key={c} onPress={() => setCity(c)}
            testID={`partners-city-${c.toLowerCase()}`}
            style={[styles.chip, city === c && styles.chipActive]}>
            <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <View style={styles.filterRow}>
        <Pressable
          testID="partners-same-gender-toggle"
          onPress={() => setSameGenderOnly((v) => !v)}
          style={[styles.toggle, sameGenderOnly && styles.toggleActive]}
        >
          <Text style={[styles.toggleText, sameGenderOnly && styles.toggleTextActive]}>
            {sameGenderOnly ? "◉  Same-gender only" : "○  Same-gender only"}
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : partners.length === 0 ? (
          <Text style={styles.empty}>No matches yet in {city}. Try disabling filters.</Text>
        ) : (
          partners.map((p) => (
            <View key={p.id} style={styles.card} testID={`partner-card-${p.id}`}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.display_name[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{p.display_name}</Text>
                  {p.verified ? <Text style={styles.verified}>✓ VERIFIED</Text> : null}
                </View>
                <Text style={styles.meta}>{p.travel_style} • {p.language} • {p.gender}</Text>
                <Text style={styles.bio} numberOfLines={2}>{p.bio}</Text>
              </View>
              <Pressable
                testID={`partner-chat-${p.id}`}
                style={styles.chatBtn}
                onPress={() => openChat(p.id)}
              >
                <Text style={styles.chatBtnText}>Chat</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 34, marginTop: 2 },
  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  chip: {
    height: 36, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, justifyContent: "center",
    backgroundColor: colors.surfaceSecondary, flexShrink: 0,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  filterRow: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  toggle: {
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, alignSelf: "flex-start",
    backgroundColor: colors.surfaceSecondary,
  },
  toggleActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  toggleText: { color: colors.onSurfaceSecondary, fontSize: 13 },
  toggleTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  list: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing["2xl"] },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing["2xl"] },
  card: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  avatar: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center",
    borderWidth: 1, borderColor: colors.brandPrimary,
  },
  avatarText: { color: colors.brandPrimary, fontSize: 20, fontWeight: "700" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  verified: { color: colors.success, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  meta: { color: colors.muted, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  bio: { color: colors.onSurfaceSecondary, fontSize: 12, marginTop: 4 },
  chatBtn: {
    backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg,
    paddingVertical: 10, borderRadius: radius.pill,
  },
  chatBtnText: { color: colors.onBrandPrimary, fontSize: 12, fontWeight: "700" },
});
