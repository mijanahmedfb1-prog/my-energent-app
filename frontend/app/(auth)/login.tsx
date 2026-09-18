import { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { useAuth } from "@/src/auth";

export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
    } catch (e: any) {
      setError(e.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.back()} testID="login-back-button">
          <Text style={styles.back}>←  Back</Text>
        </Pressable>
        <Text style={styles.title}>Welcome back.</Text>
        <Text style={styles.subtitle}>Sign in to your private concierge.</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          testID="login-email-input"
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <Text style={styles.label}>Password</Text>
        <TextInput
          testID="login-password-input"
          style={styles.input}
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {error ? <Text style={styles.error} testID="login-error">{error}</Text> : null}
        <Pressable
          testID="login-submit-button"
          style={[styles.btn, loading && { opacity: 0.6 }]}
          onPress={onSubmit}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Sign in</Text>}
        </Pressable>
        <Pressable onPress={() => router.replace("/(auth)/signup")} testID="login-goto-signup">
          <Text style={styles.link}>New here? Create an account →</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: spacing.xl, gap: spacing.md, flexGrow: 1 },
  back: { color: colors.muted, marginBottom: spacing.lg },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 38, lineHeight: 44, fontWeight: "400" },
  subtitle: { color: colors.muted, fontSize: 14, marginBottom: spacing.xl },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, letterSpacing: 1.2, marginTop: spacing.md },
  input: {
    backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.md, paddingHorizontal: spacing.lg, paddingVertical: 14,
    borderWidth: 1, borderColor: colors.border, fontSize: 15,
  },
  error: { color: colors.error, fontSize: 13, marginTop: spacing.sm },
  btn: {
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 16, alignItems: "center", marginTop: spacing.xl,
  },
  btnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 15, letterSpacing: 0.4 },
  link: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.lg, fontSize: 13 },
});
