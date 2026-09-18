import { Tabs } from "expo-router";
import { Text, View, Platform } from "react-native";
import { colors, spacing } from "@/src/theme";

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <View style={{ alignItems: "center" }}>
      <Text style={{
        color: focused ? colors.brandPrimary : colors.muted,
        fontSize: 18, fontWeight: focused ? "700" : "400",
      }}>{label}</Text>
    </View>
  );
}

const iconFor = (name: string) => ({
  discover: "◇",
  partners: "◈",
  safety: "◉",
  assistant: "✦",
} as Record<string, string>)[name] || "•";

export default function AppTabsLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          ...(Platform.OS === "web" ? { height: 64 } : {}),
        },
        tabBarItemStyle: { alignSelf: "center" },
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", fontWeight: "600" },
        tabBarIcon: ({ focused }) => <TabIcon label={iconFor(route.name)} focused={focused} />,
      })}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover" }} />
      <Tabs.Screen name="partners" options={{ title: "Partners" }} />
      <Tabs.Screen name="safety" options={{ title: "Safety" }} />
      <Tabs.Screen name="assistant" options={{ title: "AI Guide" }} />
    </Tabs>
  );
}
