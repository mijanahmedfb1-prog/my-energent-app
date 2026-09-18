import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

const CITIES = ["Paris", "Tokyo", "Bali", "Barcelona"];

export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    (async () => {
      const state: Record<string, boolean> = {};
      for (const c of CITIES) {
        const has = await AsyncStorage.getItem(`gt_offline_${c}`);
        state[c] = !!has;
      }
      setDownloaded(state);
    })();
  }, []);

  const downloadPack = async (city: string) => {
    setDownloading(city);
    try {
      const pack = await api.offlinePack(city);
      await AsyncStorage.setItem(`gt_offline_${city}`, JSON.stringify(pack));
      setDownloaded((d) => ({ ...d, [city]: true }));
    } catch {} finally { setDownloading(null); }
  };

  const expires = user?.subscription_expires_at
    ? new Date(user.subscription_expires_at).toLocaleDateString()
    : "—";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => router.back()} testID="profile-back">
          <Text style={styles.back}>←  Back</Text>
        </Pressable>
        <View style={styles.top}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{user?.display_name?.[0]}</Text></View>
          <Text style={styles.name}>{user?.display_name}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>MEMBERSHIP</Text>
          <Text style={styles.tier}>{user?.subscription_tier?.toUpperCase() || "—"}</Text>
          <Text style={styles.expire}>Active until {expires}</Text>
        </View>

        <Text style={styles.sectionTitle}>Offline Survival Packs</Text>
        <Text style={styles.sectionSub}>Cache city guides + emergency phrases for zero-signal use.</Text>
        <View style={{ gap: spacing.sm }}>
          {CITIES.map((c) => (
            <View key={c} style={styles.packRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.packCity}>{c}</Text>
                <Text style={styles.packStatus}>
                  {downloaded[c] ? "◉  Downloaded" : "○  Not downloaded"}
                </Text>
              </View>
              <Pressable
                testID={`download-pack-${c.toLowerCase()}`}
                style={styles.dlBtn}
                onPress={() => downloadPack(c)}
                disabled={downloading === c}
              >
                {downloading === c ? <ActivityIndicator color={colors.onBrandPrimary} size="small" /> :
                  <Text style={styles.dlBtnText}>{downloaded[c] ? "Refresh" : "Download"}</Text>}
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable style={styles.logoutBtn} onPress={logout} testID="profile-logout">
          <Text style={styles.logoutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.md },
  back: { color: colors.muted, marginBottom: spacing.md },
  top: { alignItems: "center", gap: 6, marginBottom: spacing.lg },
  avatar: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.brandTertiary,
    borderWidth: 1, borderColor: colors.brandPrimary, justifyContent: "center", alignItems: "center" },
  avatarText: { color: colors.brandPrimary, fontSize: 34, fontFamily: fonts.display },
  name: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, marginTop: 6 },
  email: { color: colors.muted, fontSize: 13 },
  card: { backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.brandPrimary },
  cardLabel: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  tier: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 30, marginTop: 4 },
  expire: { color: colors.muted, fontSize: 12, marginTop: 4 },
  sectionTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22, marginTop: spacing.md },
  sectionSub: { color: colors.muted, fontSize: 12, marginBottom: spacing.sm },
  packRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  packCity: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  packStatus: { color: colors.muted, fontSize: 11, marginTop: 2 },
  dlBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg,
    paddingVertical: 10, borderRadius: radius.pill },
  dlBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 12 },
  logoutBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: "center", marginTop: spacing.xl },
  logoutText: { color: colors.error, fontWeight: "700" },
});
