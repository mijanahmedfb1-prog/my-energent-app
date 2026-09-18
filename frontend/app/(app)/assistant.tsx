import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  Paris: { lat: 48.8566, lng: 2.3522 }, Tokyo: { lat: 35.6762, lng: 139.6503 },
  Bali: { lat: -8.3405, lng: 115.0920 }, Barcelona: { lat: 41.3851, lng: 2.1734 },
};

export default function Assistant() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("gt_gps");
      if (raw) { try { setGps(JSON.parse(raw)); } catch {} }
      try {
        const res: any = await api.aiHistory();
        if (res.messages?.length) setMessages(res.messages.map((m: any) => ({ role: m.role, content: m.content })));
        else setMessages([{
          role: "assistant",
          content: `Bonjour, ${user?.display_name?.split(" ")[0] || "traveler"}. I'm your GuardTrip concierge. Ask me anything about ${user?.current_city || "your destination"} — hidden gems, safe routes, daily budgets, or scam warnings.`
        }]);
      } catch {}
    })();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const newMsgs = [...messages, { role: "user", content: text }];
    setMessages(newMsgs);
    setSending(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      const city = user?.current_city || "Paris";
      const coords = gps || CITY_COORDS[city] || CITY_COORDS.Paris;
      const res: any = await api.aiChat({ message: text, city, lat: coords.lat, lng: coords.lng });
      setMessages([...newMsgs, { role: "assistant", content: res.reply }]);
    } catch (e: any) {
      setMessages([...newMsgs, { role: "assistant", content: "Concierge is unreachable. Please try again." }]);
    } finally {
      setSending(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const suggest = (t: string) => setInput(t);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View>
          <Text style={styles.eyebrow}>CONCIERGE</Text>
          <Text style={styles.title}>AI Travel Guide</Text>
        </View>
        <View style={styles.locBadge}>
          <Text style={styles.locText}>◉ {user?.current_city || "Paris"}</Text>
        </View>
      </View>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.chat}
        showsVerticalScrollIndicator={false}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.aiBubble]}
            testID={`ai-msg-${i}`}>
            <Text style={[styles.bubbleText, m.role === "user" && { color: colors.onBrandPrimary }]}>{m.content}</Text>
          </View>
        ))}
        {sending ? (
          <View style={[styles.bubble, styles.aiBubble]}>
            <ActivityIndicator color={colors.brandPrimary} size="small" />
          </View>
        ) : null}
      </ScrollView>
      {messages.length <= 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.suggestRow} style={{ maxHeight: 46 }}>
          {[
            "Best sunset spot near me",
            "Daily budget on $80",
            "Common scams here",
            "Safe evening restaurants",
          ].map((s) => (
            <Pressable key={s} style={styles.suggestChip} onPress={() => suggest(s)}
              testID={`ai-suggest-${s.slice(0, 8)}`}>
              <Text style={styles.suggestText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput
          testID="ai-input"
          style={styles.input}
          placeholder="Ask your concierge..."
          placeholderTextColor={colors.muted}
          value={input}
          onChangeText={setInput}
          multiline
          onSubmitEditing={send}
        />
        <Pressable testID="ai-send-button" style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={send} disabled={!input.trim() || sending}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.md,
    flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  title: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 30, marginTop: 2 },
  locBadge: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md,
    paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary },
  locText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "600" },
  chat: { paddingHorizontal: spacing.xl, gap: spacing.sm, paddingBottom: spacing.md },
  bubble: { maxWidth: "85%", borderRadius: radius.lg, padding: spacing.md },
  userBubble: { backgroundColor: colors.brandPrimary, alignSelf: "flex-end", borderBottomRightRadius: 4 },
  aiBubble: { backgroundColor: colors.surfaceSecondary, alignSelf: "flex-start",
    borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  suggestRow: { gap: 8, paddingHorizontal: spacing.xl, paddingVertical: 4 },
  suggestChip: { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSecondary, flexShrink: 0 },
  suggestText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: spacing.sm, alignItems: "flex-end",
    borderTopWidth: 0.5, borderTopColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 12 },
  sendText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
});
