import { View, Text, StyleSheet, Pressable, ImageBackground, Dimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";

const H = Dimensions.get("window").height;

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.root}>
      <ImageBackground
        source={{ uri: "https://images.pexels.com/photos/31650443/pexels-photo-31650443.jpeg?auto=compress&cs=tinysrgb&w=940" }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["transparent", "rgba(10,10,10,0.6)", "rgba(10,10,10,0.98)"]}
        locations={[0, 0.4, 0.9]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.brandWrap}>
          <Text style={styles.mark} testID="welcome-brand-mark">GT</Text>
          <Text style={styles.tag}>GUARDTRIP</Text>
        </View>
        <View style={styles.hero}>
          <Text style={styles.title} testID="welcome-title">Your private travel concierge.</Text>
          <Text style={styles.subtitle}>
            AI-powered local guidance and a live safety shield for solo travelers. Members only.
          </Text>
        </View>
        <View style={styles.actions}>
          <Pressable
            testID="welcome-signup-button"
            style={styles.primaryBtn}
            onPress={() => router.push("/(auth)/signup")}
          >
            <Text style={styles.primaryBtnText}>Create account</Text>
          </Pressable>
          <Pressable
            testID="welcome-login-button"
            style={styles.secondaryBtn}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.secondaryBtnText}>I already have an account</Text>
          </Pressable>
          <Text style={styles.legal}>Premium membership required. From $9.99.</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  content: { flex: 1, paddingHorizontal: spacing.xl, justifyContent: "space-between" },
  brandWrap: { alignItems: "flex-start" },
  mark: {
    fontFamily: fonts.display, color: colors.brandPrimary, fontSize: 40,
    letterSpacing: 4, fontWeight: "300",
  },
  tag: { color: colors.muted, letterSpacing: 6, fontSize: 11, marginTop: spacing.xs, fontWeight: "600" },
  hero: { marginBottom: spacing["3xl"] },
  title: {
    fontFamily: fonts.display, color: colors.onSurface,
    fontSize: 44, lineHeight: 50, fontWeight: "400", marginBottom: spacing.lg,
  },
  subtitle: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22, opacity: 0.85 },
  actions: { gap: spacing.md },
  primaryBtn: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  primaryBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700", letterSpacing: 0.4 },
  secondaryBtn: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center",
  },
  secondaryBtnText: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  legal: { color: colors.muted, fontSize: 11, textAlign: "center", marginTop: spacing.sm, letterSpacing: 0.3 },
});
