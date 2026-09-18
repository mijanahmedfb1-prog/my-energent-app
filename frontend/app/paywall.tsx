import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, ImageBackground } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";
import { api } from "@/src/api";

type Tier = "week" | "month" | "year";
const TIERS: { id: Tier; title: string; price: string; period: string; caption: string; badge?: string }[] = [
  { id: "week", title: "Casual Traveler", price: "$9.99", period: "7-day city pass", caption: "One city. One trip. Zero commitment." },
  { id: "month", title: "Explorer", price: "$19", period: "per month", caption: "Worldwide unlimited. Cancel anytime.", badge: "MOST FLEXIBLE" },
  { id: "year", title: "Globetrotter", price: "$99", period: "per year", caption: "Save 57%. Full year, all cities.", badge: "BEST VALUE" },
];

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setUser, logout } = useAuth();
  const [selected, setSelected] = useState<Tier>("year");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setError(null); setLoading(true);
    try {
      const res: any = await api.activate({ tier: selected });
      setUser(res.user);
      router.replace("/(app)/discover");
    } catch (e: any) {
      setError(e.message || "Payment failed");
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ImageBackground
        source={{ uri: "https://images.unsplash.com/photo-1499856871958-5b9627545d1a?w=940" }}
        style={StyleSheet.absoluteFill} resizeMode="cover"
      />
      <LinearGradient colors={["rgba(10,10,10,0.4)", "rgba(10,10,10,0.85)", "rgba(10,10,10,0.98)"]}
        locations={[0, 0.35, 0.7]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>MEMBERS ONLY</Text>
          <Text style={styles.title}>Unlock your{"\n"}personal concierge.</Text>
          <Text style={styles.subtitle}>
            AI local guide, safety radar, private buddy chat, and offline survival mode. One membership. Every city.
          </Text>
        </View>
        <View style={styles.tiers}>
          {TIERS.map((t) => {
            const active = selected === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => setSelected(t.id)}
                testID={`paywall-tier-${t.id}`}
                style={[styles.tier, active && styles.tierActive]}
              >
                <View style={styles.tierTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.tierTitle, active && styles.tierTitleActive]}>{t.title}</Text>
                    <Text style={styles.tierCaption}>{t.caption}</Text>
                  </View>
                  <View style={styles.priceWrap}>
                    <Text style={[styles.price, active && styles.priceActive]}>{t.price}</Text>
                    <Text style={styles.period}>{t.period}</Text>
                  </View>
                </View>
                {t.badge ? (
                  <View style={styles.badge}><Text style={styles.badgeText}>{t.badge}</Text></View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
        <View style={styles.perks}>
          {[
            "AI travel concierge (Claude Sonnet)",
            "Live GPS-aware safety alerts",
            "Verified buddy chat, gender filters",
            "Offline city packs & phrases",
          ].map((p) => (
            <Text key={p} style={styles.perk}>✓  {p}</Text>
          ))}
        </View>
        {error ? <Text style={styles.error} testID="paywall-error">{error}</Text> : null}
        <Pressable testID="paywall-activate-button" style={[styles.cta, loading && { opacity: 0.6 }]}
          onPress={activate} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
            <Text style={styles.ctaText}>Unlock GuardTrip</Text>}
        </Pressable>
        <Text style={styles.legal}>
          Renews automatically. Cancel anytime in your Apple ID / Google Play. Terms apply.
        </Text>
        <Pressable onPress={logout} testID="paywall-logout">
          <Text style={styles.logout}>Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.xl, gap: spacing.lg },
  header: { marginBottom: spacing.lg },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700", marginBottom: spacing.md },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 40, lineHeight: 46 },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 14, lineHeight: 21, marginTop: spacing.md, opacity: 0.9 },
  tiers: { gap: spacing.md },
  tier: {
    backgroundColor: "rgba(23,23,23,0.85)", borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  tierActive: { borderColor: colors.brandPrimary, backgroundColor: "rgba(51,43,30,0.6)" },
  tierTop: { flexDirection: "row", alignItems: "center" },
  tierTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  tierTitleActive: { color: colors.brandPrimary },
  tierCaption: { color: colors.muted, fontSize: 12, marginTop: 4 },
  priceWrap: { alignItems: "flex-end" },
  price: { color: colors.onSurface, fontSize: 26, fontFamily: fonts.display, fontWeight: "500" },
  priceActive: { color: colors.brandPrimary },
  period: { color: colors.muted, fontSize: 11 },
  badge: {
    position: "absolute", top: -10, right: spacing.lg,
    backgroundColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 3,
    borderRadius: radius.pill,
  },
  badgeText: { color: colors.onBrandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 0.8 },
  perks: { gap: spacing.sm, marginVertical: spacing.md },
  perk: { color: colors.onSurfaceSecondary, fontSize: 13 },
  cta: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 18, alignItems: "center", marginTop: spacing.sm,
  },
  ctaText: { color: colors.onBrandPrimary, fontWeight: "800", fontSize: 16, letterSpacing: 0.5 },
  legal: { color: colors.muted, fontSize: 10, textAlign: "center", lineHeight: 15, marginTop: spacing.sm },
  logout: { color: colors.muted, textAlign: "center", marginTop: spacing.lg, fontSize: 12, textDecorationLine: "underline" },
  error: { color: colors.error, textAlign: "center", fontSize: 13 },
});
