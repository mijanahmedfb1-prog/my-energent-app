import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, RefreshControl,
  TextInput, KeyboardAvoidingView, Platform, Modal,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const KIND_LABEL: Record<string, string> = {
  pickpocket: "PICKPOCKET",
  taxi_scam: "TAXI SCAM",
  unsafe_area: "UNSAFE AREA",
  tourist_scam: "TOURIST SCAM",
  other: "OTHER",
};
const CITIES = ["Paris", "Tokyo", "Bali", "Barcelona"];
const CITY_COORDS: Record<string, [number, number]> = {
  Paris: [48.8566, 2.3522], Tokyo: [35.6762, 139.6503],
  Bali: [-8.3405, 115.0920], Barcelona: [41.3851, 2.1734],
};

export default function Safety() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [city, setCity] = useState(user?.current_city || "Paris");
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [rKind, setRKind] = useState("pickpocket");
  const [rTitle, setRTitle] = useState("");
  const [rDesc, setRDesc] = useState("");
  const [rSubmitting, setRSubmitting] = useState(false);
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem("gt_gps");
      if (raw) { try { setGps(JSON.parse(raw)); } catch {} }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [defLat, defLng] = CITY_COORDS[city] || [0, 0];
      const lat = gps?.lat ?? defLat;
      const lng = gps?.lng ?? defLng;
      const res: any = await api.alerts({ city, lat, lng });
      setAlerts(res.alerts || []);
    } catch { setAlerts([]); }
    finally { setLoading(false); }
  }, [city, gps]);

  useEffect(() => { load(); }, [load]);

  const submitReport = async () => {
    if (!rTitle.trim()) return;
    setRSubmitting(true);
    try {
      const [defLat, defLng] = CITY_COORDS[city];
      const lat = gps?.lat ?? defLat;
      const lng = gps?.lng ?? defLng;
      await api.createAlert({
        kind: rKind, title: rTitle.trim(),
        description: rDesc.trim() || "Community report", city, lat, lng,
      });
      setReportOpen(false); setRTitle(""); setRDesc(""); setRKind("pickpocket");
      load();
    } catch {} finally { setRSubmitting(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Text style={styles.eyebrow}>SAFETY RADAR</Text>
        <Text style={styles.title}>Live alerts</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow} style={{ maxHeight: 56 }}>
        {CITIES.map((c) => (
          <Pressable key={c} onPress={() => setCity(c)}
            testID={`safety-city-${c.toLowerCase()}`}
            style={[styles.chip, city === c && styles.chipActive]}>
            <Text style={[styles.chipText, city === c && styles.chipTextActive]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} />
        ) : alerts.length === 0 ? (
          <View style={styles.safeBanner}>
            <Text style={styles.safeText}>✓  No active threats in {city}.</Text>
            <Text style={styles.safeSub}>Stay aware. Pull to refresh.</Text>
          </View>
        ) : (
          alerts.map((a) => (
            <View key={a.id} style={styles.alert} testID={`alert-card-${a.id}`}>
              <View style={styles.kindPill}>
                <Text style={styles.kindText}>{KIND_LABEL[a.kind] || a.kind.toUpperCase()}</Text>
              </View>
              <Text style={styles.alertTitle}>{a.title}</Text>
              <Text style={styles.alertDesc}>{a.description}</Text>
              <View style={styles.alertMeta}>
                <Text style={styles.metaText}>{a.reported_by}</Text>
                {a.distance_km != null ? <Text style={styles.metaText}>{a.distance_km} km away</Text> : null}
              </View>
            </View>
          ))
        )}
      </ScrollView>
      <Pressable
        testID="safety-report-fab"
        style={[styles.fab, { bottom: spacing.xl }]}
        onPress={() => setReportOpen(true)}
      >
        <Text style={styles.fabText}>+  Report incident</Text>
      </Pressable>

      <Modal transparent visible={reportOpen} animationType="slide" onRequestClose={() => setReportOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBg}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
            <View style={styles.grabber} />
            <Text style={styles.sheetTitle}>Report an incident in {city}</Text>
            <Text style={styles.label}>Kind</Text>
            <View style={styles.kindRow}>
              {Object.keys(KIND_LABEL).map((k) => (
                <Pressable key={k} onPress={() => setRKind(k)}
                  testID={`report-kind-${k}`}
                  style={[styles.kindOpt, rKind === k && styles.kindOptActive]}>
                  <Text style={[styles.kindOptText, rKind === k && styles.kindOptTextActive]}>{KIND_LABEL[k]}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Title</Text>
            <TextInput testID="report-title-input" style={styles.input} value={rTitle} onChangeText={setRTitle}
              placeholder="e.g., Bracelet scam at cathedral" placeholderTextColor={colors.muted} />
            <Text style={styles.label}>Details</Text>
            <TextInput testID="report-desc-input" style={[styles.input, { height: 80 }]}
              value={rDesc} onChangeText={setRDesc}
              placeholder="What happened?" placeholderTextColor={colors.muted} multiline />
            <Pressable testID="report-submit-button" style={[styles.submit, rSubmitting && { opacity: 0.6 }]}
              onPress={submitReport} disabled={rSubmitting}>
              {rSubmitting ? <ActivityIndicator color={colors.onBrandPrimary} /> :
                <Text style={styles.submitText}>Submit report</Text>}
            </Pressable>
            <Pressable onPress={() => setReportOpen(false)} testID="report-close">
              <Text style={styles.cancel}>Cancel</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  eyebrow: { color: colors.error, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
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
  list: { paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: 120 },
  safeBanner: {
    backgroundColor: colors.brandTertiary, borderRadius: radius.lg, padding: spacing.xl,
    borderWidth: 1, borderColor: colors.success, alignItems: "center",
  },
  safeText: { color: colors.brandPrimary, fontSize: 16, fontWeight: "700" },
  safeSub: { color: colors.muted, fontSize: 12, marginTop: 4 },
  alert: {
    backgroundColor: colors.surfaceSecondary, borderRadius: radius.lg,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
    borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  kindPill: { alignSelf: "flex-start", backgroundColor: "rgba(155,34,38,0.2)",
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  kindText: { color: "#F87171", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  alertTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 8 },
  alertDesc: { color: colors.onSurfaceSecondary, fontSize: 13, marginTop: 4 },
  alertMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.md },
  metaText: { color: colors.muted, fontSize: 11 },
  fab: {
    position: "absolute", right: spacing.xl, bottom: 16,
    backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
  fabText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  kindRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  kindOpt: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  kindOptActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  kindOptText: { color: colors.onSurfaceSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  kindOptTextActive: { color: colors.brandPrimary },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  submit: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.lg },
  submitText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  cancel: { color: colors.muted, textAlign: "center", marginTop: spacing.md, fontSize: 12 },
});
