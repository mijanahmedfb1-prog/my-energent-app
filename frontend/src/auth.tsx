import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, getToken, setToken } from "./api";

export type User = {
  id: string;
  email: string;
  display_name: string;
  gender: string;
  language: string;
  travel_style: string;
  is_premium: boolean;
  subscription_tier?: string | null;
  subscription_expires_at?: string | null;
  current_city?: string | null;
  daily_budget_usd?: number;
};

type Ctx = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (b: any) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const AuthCtx = createContext<Ctx>({} as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const t = await getToken();
      if (!t) { setUser(null); return; }
      const me = await api.me();
      setUser(me);
    } catch {
      await setToken(null);
      setUser(null);
    }
  };

  useEffect(() => {
    (async () => { await refresh(); setLoading(false); })();
  }, []);

  const login = async (email: string, password: string) => {
    const res: any = await api.login({ email, password });
    await setToken(res.token);
    setUser(res.user);
  };
  const register = async (b: any) => {
    const res: any = await api.register(b);
    await setToken(res.token);
    setUser(res.user);
  };
  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, refresh, login, register, logout, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
