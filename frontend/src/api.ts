import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL;
const TOKEN_KEY = "gt_token";

export async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}
export async function setToken(t: string | null) {
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

async function request<T = any>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    const detail = (data && (data.detail || data.message)) || `HTTP ${res.status}`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return data as T;
}

export const api = {
  register: (b: any) => request("/auth/register", { method: "POST", body: JSON.stringify(b) }),
  login: (b: any) => request("/auth/login", { method: "POST", body: JSON.stringify(b) }),
  me: () => request("/auth/me"),
  activate: (b: any) => request("/subscriptions/activate", { method: "POST", body: JSON.stringify(b) }),
  subStatus: () => request("/subscriptions/status"),

  cities: () => request("/cities"),
  hotspots: (params: { city?: string; lat?: number; lng?: number }) => {
    const q = new URLSearchParams();
    if (params.city) q.set("city", params.city);
    if (params.lat != null) q.set("lat", String(params.lat));
    if (params.lng != null) q.set("lng", String(params.lng));
    return request(`/hotspots?${q.toString()}`);
  },
  hotspot: (id: string) => request(`/hotspots/${id}`),
  expensePredict: (b: any) => request("/expense/predict", { method: "POST", body: JSON.stringify(b) }),

  checkin: (b: any) => request("/partners/checkin", { method: "POST", body: JSON.stringify(b) }),
  partners: (params: any) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && v !== "any" && q.set(k, String(v)));
    return request(`/partners?${q.toString()}`);
  },

  createRoom: (userId: string) =>
    request("/chat/rooms", { method: "POST", body: JSON.stringify({ user_id: userId }) }),
  listRooms: () => request("/chat/rooms"),
  getMessages: (roomId: string) => request(`/chat/rooms/${roomId}/messages`),
  sendMessage: (roomId: string, text: string) =>
    request(`/chat/rooms/${roomId}/messages`, { method: "POST", body: JSON.stringify({ text }) }),

  aiChat: (b: any) => request("/ai/chat", { method: "POST", body: JSON.stringify(b) }),
  aiHistory: () => request("/ai/history"),

  alerts: (params: any) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v != null && q.set(k, String(v)));
    return request(`/alerts?${q.toString()}`);
  },
  createAlert: (b: any) => request("/alerts", { method: "POST", body: JSON.stringify(b) }),

  offlinePack: (city: string) => request(`/offline/pack?city=${encodeURIComponent(city)}`),

  walletToday: () => request("/wallet/today"),
  walletHistory: (days = 7) => request(`/wallet/history?days=${days}`),
  addExpense: (b: any) => request("/wallet/expenses", { method: "POST", body: JSON.stringify(b) }),
  deleteExpense: (id: string) => request(`/wallet/expenses/${id}`, { method: "DELETE" }),
  setBudget: (daily_budget_usd: number) =>
    request("/wallet/budget", { method: "POST", body: JSON.stringify({ daily_budget_usd }) }),

  discoverHotspots: (b: { lat: number; lng: number; city: string; country?: string; force_refresh?: boolean }) =>
    request("/hotspots/discover", { method: "POST", body: JSON.stringify(b) }),
};
