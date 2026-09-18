import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";

const GENDERS = ["female", "male", "other"] as const;

export default function Signup() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [gender, setGender] = useState<(typeof GENDERS)[number]>("female");
  const [language, setLanguage] = useState("English");
  const [style, setStyle] = useState("Solo Female");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    if (!displayName.trim() || !email.trim() || password.length < 4) {
      setError("Fill all fields (password ≥ 4 chars)");
      return;
    }
    setError(null); setLoading(true);
    try {
      await register({
        email: email.trim(), password, display_name: displayName.trim(),
        gender, language, travel_style: style,
      });
    } catch (e: any) {
      setError(e.message || "Signup failed");
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} testID="signup-back-button">
          <Text style={styles.back}>←  Back</Text>
        </Pressable>
        <Text style={styles.title}>Join the circle.</Text>
        <Text style={styles.subtitle}>A private community of verified premium travelers.</Text>

        <Text style={styles.label}>Display name</Text>
        <TextInput testID="signup-name-input" style={styles.input} value={displayName} onChangeText={setDisplayName}
          placeholder="e.g., Alex T." placeholderTextColor={colors.muted} />
        <Text style={styles.label}>Email</Text>
        <TextInput testID="signup-email-input" style={styles.input} value={email} onChangeText={setEmail}
          placeholder="you@example.com" placeholderTextColor={colors.muted}
          autoCapitalize="none" keyboardType="email-address" />
        <Text style={styles.label}>Password</Text>
        <TextInput testID="signup-password-input" style={styles.input} value={password} onChangeText={setPassword}
          placeholder="Minimum 4 characters" placeholderTextColor={colors.muted} secureTextEntry />

        <Text style={styles.label}>Gender (for safety matching)</Text>
        <View style={styles.row}>
          {GENDERS.map((g) => (
            <Pressable key={g} onPress={() => setGender(g)}
              testID={`signup-gender-${g}`}
              style={[styles.chip, gender === g && styles.chipActive]}>
              <Text style={[styles.chipText, gender === g && styles.chipTextActive]}>{g}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.label}>Language</Text>
        <TextInput testID="signup-language-input" style={styles.input} value={language} onChangeText={setLanguage} />
        <Text style={styles.label}>Travel style</Text>
        <TextInput testID="signup-style-input" style={styles.input} value={style} onChangeText={setStyle} />

        {error ? <Text style={styles.error} testID="signup-error">{error}</Text> : null}
        <Pressable testID="signup-submit-button" style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={onSubmit} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Continue</Text>}
        </Pressable>
        <Pressable onPress={() => router.replace("/(auth)/login")} testID="signup-goto-login">
          <Text style={styles.link}>Already have an account? Sign in →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  back: { color: colors.muted, marginBottom: spacing.lg },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 38, lineHeight: 44 },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: spacing.xl },
  label: { color: colors.onSurfaceSecondary, fontSize: 11, letterSpacing: 1.2, marginTop: spacing.md, textTransform: "uppercase" },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xs },
  chip: {
    paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary,
  },
  chipActive: { backgroundColor: colors.brandTertiary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceSecondary, fontSize: 13, textTransform: "capitalize" },
  chipTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  btn: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", marginTop: spacing.xl,
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15, letterSpacing: 0.4 },
  link: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.lg, fontSize: 13 },
});
