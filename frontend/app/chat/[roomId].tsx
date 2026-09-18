import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

export default function ChatRoom() {
  const { roomId, name } = useLocalSearchParams<{ roomId: string; name: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => {
    try {
      const res: any = await api.getMessages(roomId!);
      setMessages(res.messages || []);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, [roomId]);

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    setInput(""); setSending(true);
    try {
      const msg: any = await api.sendMessage(roomId!, text);
      setMessages((m) => [...m, msg]);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    } catch {} finally { setSending(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} testID="chat-back"><Text style={styles.back}>←</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{name || "Chat"}</Text>
          <Text style={styles.status}>End-to-end premium chat</Text>
        </View>
      </View>
      {loading ? (
        <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={colors.brandPrimary} /></View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chat}>
          {messages.length === 0 ? (
            <Text style={styles.empty}>Say hi. Private and encrypted for premium members.</Text>
          ) : messages.map((m) => {
            const mine = m.sender_id === user?.id;
            return (
              <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]} testID={`chat-msg-${m.id}`}>
                <Text style={[styles.bubbleText, mine && { color: colors.onBrandPrimary }]}>{m.text}</Text>
                {mine ? (
                  <Text style={styles.status2}>
                    {m.status === "read" ? "✓✓ Read" : "✓ Delivered"}
                  </Text>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 8 }]}>
        <TextInput testID="chat-input" style={styles.input} placeholder="Message..."
          placeholderTextColor={colors.muted} value={input} onChangeText={setInput} multiline />
        <Pressable testID="chat-send" style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
          onPress={send} disabled={!input.trim() || sending}>
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  back: { color: colors.onSurface, fontSize: 24 },
  name: { color: colors.onSurface, fontSize: 17, fontFamily: fonts.display },
  status: { color: colors.muted, fontSize: 11 },
  chat: { padding: spacing.lg, gap: spacing.sm },
  empty: { color: colors.muted, textAlign: "center", marginTop: spacing["2xl"] },
  bubble: { maxWidth: "80%", padding: spacing.md, borderRadius: radius.lg },
  mine: { alignSelf: "flex-end", backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: "flex-start", backgroundColor: colors.surfaceSecondary, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: colors.border },
  bubbleText: { color: colors.onSurface, fontSize: 14, lineHeight: 20 },
  status2: { color: "rgba(10,10,10,0.6)", fontSize: 10, marginTop: 4, textAlign: "right" },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: spacing.sm,
    borderTopWidth: 0.5, borderTopColor: colors.border, alignItems: "flex-end" },
  input: { flex: 1, backgroundColor: colors.surfaceSecondary, color: colors.onSurface,
    borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 12,
    borderWidth: 1, borderColor: colors.border, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 12 },
  sendText: { color: colors.onBrandPrimary, fontWeight: "700" },
});
