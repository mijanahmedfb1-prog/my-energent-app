import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, ImageBackground,
  FlatList, Dimensions, NativeSyntheticEvent, NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing, radius, fonts } from "@/src/theme";
import { api } from "@/src/api";

const SCREEN_W = Dimensions.get("window").width;
const HERO_H = 420;

export default function HotspotDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [tip, setTip] = useState<string | null>(null);
  const [tipLoading, setTipLoading] = useState(false);
  const [pageIdx, setPageIdx] = useState(0);
  const galleryRef = useRef<FlatList<string>>(null);

  useEffect(() => {
    (async () => {
      try { const res: any = await api.hotspot(id!); setData(res); } catch {}
    })();
  }, [id]);

  const getTip = async () => {
    setTipLoading(true);
    try {
      const res: any = await api.expensePredict({ hotspot_id: id! });
      setTip(res.ai_tip);
    } catch {} finally { setTipLoading(false); }
  };

  if (!data) return (
    <View style={styles.loading}><ActivityIndicator color={colors.brandPrimary} /></View>
  );

  const photos: string[] = (data.photos && data.photos.length ? data.photos : [data.image_url]).filter(Boolean);
  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (i !== pageIdx) setPageIdx(i);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
        <View style={{ height: HERO_H }}>
          <FlatList
            ref={galleryRef}
            data={photos}
            keyExtractor={(u, i) => `${i}-${u.slice(-20)}`}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            renderItem={({ item }) => (
              <ImageBackground source={{ uri: item }} style={{ width: SCREEN_W, height: HERO_H }}
                testID="hotspot-gallery-img">
                <LinearGradient
                  colors={["rgba(10,10,10,0.4)", "transparent", "rgba(10,10,10,0.95)"]}
                  locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill}
                />
              </ImageBackground>
            )}
          />
          <View style={[styles.heroBar, { paddingTop: insets.top + spacing.md, position: "absolute", left: 0, right: 0 }]} pointerEvents="box-none">
            <Pressable onPress={() => router.back()} style={styles.backBtn} testID="hotspot-back">
              <Text style={styles.backText}>←</Text>
            </Pressable>
            <View style={styles.rating}>
              <Text style={styles.ratingText}>★ {data.rating}</Text>
            </View>
          </View>
          {photos.length > 1 ? (
            <View style={styles.dots} pointerEvents="none">
              {photos.map((_, i) => (
                <View key={i} style={[styles.dot, i === pageIdx && styles.dotActive]} />
              ))}
            </View>
          ) : null}
          <View style={styles.heroBottom} pointerEvents="none">
            <Text style={styles.location}>{data.city.toUpperCase()} · {data.country.toUpperCase()}</Text>
            <Text style={styles.name}>{data.name}</Text>
            {photos.length > 1 ? (
              <Text style={styles.photoCount}>{pageIdx + 1} / {photos.length} photos</Text>
            ) : null}
          </View>
        </View>
        <View style={styles.body}>
          <Text style={styles.desc}>{data.description}</Text>
          <View style={styles.tags}>
            {data.tags?.map((t: string) => (
              <View key={t} style={styles.tag}><Text style={styles.tagText}>{t}</Text></View>
            ))}
          </View>

          <Text style={styles.sectionTitle}>Expense breakdown</Text>
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <Text style={styles.cellLabel}>Entry (foreigner)</Text>
              <Text style={styles.cellValue}>${data.entry_fee_foreigner_usd}</Text>
              <Text style={styles.cellSub}>{data.entry_fee_local}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.cellLabel}>Transit</Text>
              <Text style={styles.cellValue}>${data.transit_cost_usd}</Text>
              <Text style={styles.cellSub}>~ {data.transit_time_min} min</Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Activities</Text>
          <View style={{ gap: spacing.sm }}>
            {data.activities?.map((a: any) => (
              <View key={a.name} style={styles.actRow} testID={`activity-${a.name}`}>
                <Text style={styles.actName}>{a.name}</Text>
                <Text style={styles.actCost}>${a.cost_usd}</Text>
              </View>
            ))}
          </View>

          <Pressable style={styles.aiBtn} onPress={getTip} disabled={tipLoading} testID="hotspot-ai-tip-button">
            {tipLoading ? <ActivityIndicator color={colors.onBrandPrimary} /> :
              <Text style={styles.aiBtnText}>✦  Ask concierge for a hidden-cost warning</Text>}
          </Pressable>
          {tip ? (
            <View style={styles.tipBox} testID="hotspot-ai-tip">
              <Text style={styles.tipLabel}>CONCIERGE TIP</Text>
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: colors.surface, justifyContent: "center", alignItems: "center" },
  hero: { height: 420, justifyContent: "space-between" },
  heroBar: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: spacing.lg, zIndex: 2 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(10,10,10,0.6)",
    justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.onSurface, fontSize: 22 },
  rating: { backgroundColor: "rgba(10,10,10,0.7)", paddingHorizontal: spacing.md, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.brandPrimary },
  ratingText: { color: colors.brandPrimary, fontWeight: "700" },
  heroBottom: { padding: spacing.xl, position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 2 },
  dots: { position: "absolute", top: 60, alignSelf: "center", flexDirection: "row", gap: 6, zIndex: 2 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.35)" },
  dotActive: { backgroundColor: colors.brandPrimary, width: 18 },
  photoCount: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 1.5, marginTop: 6, fontWeight: "600" },
  location: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  name: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 40, lineHeight: 44, marginTop: 4 },
  body: { padding: spacing.xl, gap: spacing.lg },
  desc: { color: colors.onSurfaceSecondary, fontSize: 15, lineHeight: 22 },
  tags: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  tag: { backgroundColor: colors.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  tagText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  sectionTitle: { fontFamily: fonts.display, color: colors.onSurface, fontSize: 22, marginTop: spacing.md },
  grid: { flexDirection: "row", gap: spacing.md },
  gridCell: { flex: 1, backgroundColor: colors.surfaceSecondary, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border },
  cellLabel: { color: colors.muted, fontSize: 10, letterSpacing: 1, textTransform: "uppercase" },
  cellValue: { color: colors.brandPrimary, fontSize: 24, fontFamily: fonts.display, marginTop: 4 },
  cellSub: { color: colors.muted, fontSize: 11 },
  actRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: colors.surfaceSecondary,
    padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  actName: { color: colors.onSurface, fontSize: 14 },
  actCost: { color: colors.brandPrimary, fontSize: 14, fontWeight: "700" },
  aiBtn: { backgroundColor: colors.brandPrimary, borderRadius: radius.pill,
    paddingVertical: 14, alignItems: "center" },
  aiBtnText: { color: colors.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  tipBox: { backgroundColor: colors.brandTertiary, padding: spacing.lg, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.brandPrimary },
  tipLabel: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  tipText: { color: colors.onSurface, fontSize: 13, lineHeight: 20, marginTop: 6 },
});
