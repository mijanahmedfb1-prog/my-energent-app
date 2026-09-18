import { Redirect } from "expo-router";
import { useAuth } from "@/src/auth";

export default function Index() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (!user.is_premium) return <Redirect href="/paywall" />;
  return <Redirect href="/(app)/discover" />;
}
