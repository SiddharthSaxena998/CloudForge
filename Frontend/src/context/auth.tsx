import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY, apiClient, apiErrorMessage } from "@/lib/api-client";
import type { User } from "@/lib/types";
import { dataStore } from "@/lib/store";

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function persist(user: User, token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
  window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(USER_STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as User);
    } catch {
      window.localStorage.removeItem(USER_STORAGE_KEY);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { data } = await apiClient.post("/auth/login", { email, password });
      persist(data.user as User, data.token as string);
      setUser(data.user as User);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    try {
      const { data } = await apiClient.post("/auth/register", { name, email, password });
      persist(data.user as User, data.token as string);
      setUser(data.user as User);
    } catch (e) {
      throw new Error(apiErrorMessage(e));
    }
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
    dataStore.reset();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      isAdmin: user?.role === "admin",
      login,
      register,
      logout,
    }),
    [user, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}