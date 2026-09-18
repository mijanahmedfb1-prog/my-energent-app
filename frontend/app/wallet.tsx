import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";
import { useAuth } from "@/src/auth";

const CATS = [
  { id: "food", label: "Food", icon: "◕" },
  { id: "transit", label: "Transit", icon: "→" },
  { id: "entry", label: "Entry", icon: "◆" },
  { id: "activity", label: "Activity", icon: "✦" },
  { id: "shopping", label: "Shop", icon: "◈" },
  { id: "lodging", label: "Stay", icon: "▲" },
  { id: "other", label: "Other", icon: "•" },
] as const;

const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.label]));
const CAT_ICON: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.id, c.icon]));

export default function Wallet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, refresh } = useAuth();
  const [today, setToday] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, h] = await Promise.all([api.walletToday(), api.walletHistory(7)]);
      setToday(t); setHistory((h as any).history || []);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const budget = today?.daily_budget_usd ?? user?.daily_budget_usd ?? 80;
  const spent = today?.spent_usd ?? 0;
  const remaining = today?.remaining_usd ?? budget;
  const pct = Math.min(100, today?.percent_used ?? 0);
  const isOver = remaining < 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={colors.brandPrimary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} testID="wallet-back">
            <Text style={styles.back}>←  Back</Text>
          </Pressable>
          <Pressable onPress={() => setBudgetOpen(true)} testID="wallet-edit-budget">
            <Text style={styles.editBudget}>Edit budget</Text>
          </Pressable>
        </View>
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>TODAY · ${budget.toFixed(0)}/DAY BUDGET</Text>
          <Text style={[styles.remaining, isOver && { color: colors.error }]} testID="wallet-remaining">
            ${remaining.toFixed(2)}
          </Text>
          <Text style={styles.subLabel}>
            {isOver ? `Over budget by $${Math.abs(remaining).toFixed(2)}` : "Remaining today"}
          </Text>
          <View style={styles.progressTrack}>
            <View style={[
              styles.progressFill,
              { width: `${pct}%` },
              isOver && { backgroundColor: colors.error },
            ]} />
          </View>
          <View style={styles.progressLabels}>
            <Text style={styles.progressText}>Spent ${spent.toFixed(2)}</Text>
            <Text style={styles.progressText}>{pct.toFixed(0)}%</Text>
          </View>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
        ) : (
          <>
            <Text style={styles.sectionTitle}>By category</Text>
            <View style={styles.catGrid}>
              {CATS.map((c) => {
                const val = today?.by_category?.[c.id] || 0;
                return (
                  <View key={c.id} style={styles.catCell} testID={`wallet-cat-${c.id}`}>
                    <Text style={styles.catIcon}>{c.icon}</Text>
                    <Text style={styles.catLabel}>{c.label}</Text>
                    <Text style={styles.catValue}>${val.toFixed(2)}</Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Today's expenses</Text>
            {today?.expenses?.length ? (
              <View style={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}>
                {today.expenses.map((e: any) => (
                  <View key={e.id} style={styles.expRow} testID={`expense-${e.id}`}>
                    <View style={styles.expIcon}><Text style={styles.expIconText}>{CAT_ICON[e.category] || "•"}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.expTitle}>{e.note || CAT_LABEL[e.category] || e.category}</Text>
                      <Text style={styles.expMeta}>{CAT_LABEL[e.category]} • {e.city || "—"}</Text>
                    </View>
                    <Text style={styles.expAmt}>-${Number(e.amount_usd).toFixed(2)}</Text>
                    <Pressable onPress={async () => { await api.deleteExpense(e.id); load(); }}
                      testID={`expense-delete-${e.id}`}>
                      <Text style={styles.expDel}>✕</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.empty}>No expenses logged yet today.</Text>
            )}

            <Text style={styles.sectionTitle}>Last 7 days</Text>
            <View style={styles.weekRow}>
              {[...history].reverse().map((h: any) => {
                const barPct = Math.min(120, (h.spent_usd / (h.budget_usd || 1)) * 100);
                return (
                  <View key={h.day} style={styles.weekCol}>
                    <View style={styles.weekTrack}>
                      <View style={[styles.weekFill, { height: `${barPct}%` }, h.over && { backgroundColor: colors.error }]} />
                    </View>
                    <Text style={styles.weekAmt}>${h.spent_usd.toFixed(0)}</Text>
                    <Text style={styles.weekDay}>{new Date(h.day).toLocaleDateString("en", { weekday: "short" }).slice(0, 2)}</Text>
                  </View>
                );
              })}
            </View>
          </>
        )}
      </ScrollView>

      <Pressable
        testID="wallet-add-fab"
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => setAddOpen(true)}
      >
        <Text style={styles.fabText}>+  Add expense</Text>
      </Pressable>

      <AddExpenseModal
        open={addOpen} onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); load(); }}
        city={user?.current_city || undefined}
      />
      <BudgetModal
        open={budgetOpen} onClose={() => setBudgetOpen(false)} current={budget}
        onDone={async (v) => { await api.setBudget(v); setBudgetOpen(false); refresh(); load(); }}
      />
    </View>
  );
}

function AddExpenseModal({ open, onClose, onDone, city }: any) {
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState("");
  const [cat, setCat] = useState<string>("food");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setAmount(""); setCat("food"); setNote(""); } }, [open]);

  const save = async () => {
    const val = parseFloat(amount);
    if (!val || val <= 0) return;
    setSaving(true);
    try {
      await api.addExpense({ amount_usd: val, category: cat, note, city });
      onDone();
    } catch {} finally { setSaving(false); }
  };

  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBg}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Add expense</Text>
          <Text style={styles.label}>Amount (USD)</Text>
          <TextInput
            testID="add-expense-amount"
            style={styles.input} placeholder="0.00" placeholderTextColor={colors.muted}
            keyboardType="decimal-pad" value={amount} onChangeText={setAmount}
          />
          <Text style={styles.label}>Category</Text>
          <View style={styles.catRow}>
            {CATS.map((c) => (
              <Pressable key={c.id} onPress={() => setCat(c.id)}
                testID={`add-expense-cat-${c.id}`}
                style={[styles.catOpt, cat === c.id && styles.catOptActive]}>
                <Text style={[styles.catOptText, cat === c.id && styles.catOptTextActive]}>{c.icon}  {c.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Note</Text>
          <TextInput
            testID="add-expense-note"
            style={styles.input} placeholder="Espresso at Café de Flore" placeholderTextColor={colors.muted}
            value={note} onChangeText={setNote}
          />
          <Pressable testID="add-expense-save" style={[styles.submit, saving && { opacity: 0.6 }]}
            onPress={save} disabled={saving || !amount}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={styles.submitText}>Log expense</Text>}
          </Pressable>
          <Pressable onPress={onClose} testID="add-expense-cancel">
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function BudgetModal({ open, onClose, onDone, current }: any) {
  const insets = useSafeAreaInsets();
  const [v, setV] = useState(String(current || 80));
  useEffect(() => { if (open) setV(String(current || 80)); }, [open, current]);

  return (
    <Modal transparent visible={open} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBg}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.grabber} />
          <Text style={styles.sheetTitle}>Daily budget</Text>
          <Text style={styles.label}>USD per day</Text>
          <TextInput testID="budget-input" style={styles.input} keyboardType="decimal-pad"
            value={v} onChangeText={setV} placeholder="80" placeholderTextColor={colors.muted} />
          <Pressable testID="budget-save" style={styles.submit} onPress={() => onDone(parseFloat(v) || 0)}>
            <Text style={styles.submitText}>Save</Text>
          </Pressable>
          <Pressable onPress={onClose}><Text style={styles.cancel}>Cancel</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", justifyContent: "space-between",
    paddingHorizontal: spacing.xl, marginBottom: spacing.md },
  back: { color: colors.muted, fontSize: 14 },
  editBudget: { color: colors.brandPrimary, fontSize: 13, fontWeight: "600" },
  hero: { paddingHorizontal: spacing.xl, marginBottom: spacing.xl },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 2.5, fontSize: 10, fontWeight: "700" },
  remaining: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 68, marginTop: 4 },
  subLabel: { color: colors.muted, fontSize: 13, marginTop: 4 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceTertiary, marginTop: spacing.lg, overflow: "hidden" },
  progressFill: { height: 8, backgroundColor: colors.brandPrimary, borderRadius: 4 },
  progressLabels: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  progressText: { color: colors.muted, fontSize: 11 },
  sectionTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22,
    paddingHorizontal: spacing.xl, marginTop: spacing.xl, marginBottom: spacing.md },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.xl },
  catCell: { width: "31%", backgroundColor: colors.surfaceSecondary, padding: spacing.md,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  catIcon: { color: colors.brandPrimary, fontSize: 16 },
  catLabel: { color: colors.muted, fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 4 },
  catValue: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 2 },
  empty: { color: colors.muted, textAlign: "center", paddingVertical: spacing.lg },
  expRow: { flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surfaceSecondary, padding: spacing.md, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border },
  expIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.brandTertiary,
    justifyContent: "center", alignItems: "center" },
  expIconText: { color: colors.brandPrimary, fontSize: 16 },
  expTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  expMeta: { color: colors.muted, fontSize: 11, marginTop: 2, textTransform: "capitalize" },
  expAmt: { color: colors.error, fontSize: 14, fontWeight: "700" },
  expDel: { color: colors.muted, fontSize: 16, paddingHorizontal: 8 },
  weekRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.xl, gap: 6 },
  weekCol: { flex: 1, alignItems: "center" },
  weekTrack: { width: "100%", height: 90, backgroundColor: colors.surfaceTertiary,
    borderRadius: 4, justifyContent: "flex-end", overflow: "hidden" },
  weekFill: { width: "100%", backgroundColor: colors.brandPrimary, borderRadius: 4 },
  weekAmt: { color: colors.onSurfaceSecondary, fontSize: 10, marginTop: 4 },
  weekDay: { color: colors.muted, fontSize: 9, textTransform: "uppercase" },
  fab: { position: "absolute", right: spacing.xl, backgroundColor: colors.brandPrimary,
    borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 14,
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surfaceSecondary, borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg, padding: spacing.xl, gap: spacing.sm },
  grabber: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: spacing.md },
  sheetTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 24, marginBottom: spacing.md },
  label: { color: colors.muted, fontSize: 11, letterSpacing: 1, textTransform: "uppercase", marginTop: spacing.sm },
  input: { backgroundColor: colors.surfaceTertiary, color: colors.onSurface,
    borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  catRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  catOpt: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceTertiary },
  catOptActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  catOptText: { color: colors.onSurfaceSecondary, fontSize: 12 },
  catOptTextActive: { color: colors.brandPrimary, fontWeight: "600" },
  submit: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 14,
    alignItems: "center", marginTop: spacing.lg },
  submitText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 14 },
  cancel: { color: colors.muted, textAlign: "center", marginTop: spacing.md, fontSize: 12 },
});
