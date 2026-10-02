import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  USE_MOCK_API,
  apiClient,
  mockDelay,
} from "@/lib/api-client";
import { mockUsers, type Role, type User } from "@/lib/mock-data";

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
    if (!USE_MOCK_API) {
      const { data } = await apiClient.post("/auth/login", { email, password });
      persist(data.user as User, data.token as string);
      setUser(data.user as User);
      return;
    }

    await mockDelay();
    if (password.length < 6) {
      throw new Error("Invalid email or password.");
    }
    const role: Role = email.trim().toLowerCase().startsWith("admin") ? "admin" : "user";
    const base = mockUsers.find((u) => u.email === email.trim().toLowerCase());
    const account: User = base ?? {
      id: "usr_demo",
      name: role === "admin" ? "Aarav Mehta" : "Priya Nair",
      email: email.trim().toLowerCase(),
      role,
      joinedAt: "2026-01-18",
    };
    persist(account, "mock.jwt.token");
    setUser(account);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    if (!USE_MOCK_API) {
      const { data } = await apiClient.post("/auth/register", { name, email, password });
      persist(data.user as User, data.token as string);
      setUser(data.user as User);
      return;
    }

    await mockDelay();
    const account: User = {
      id: `usr_${Math.random().toString(16).slice(2, 7)}`,
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: "user",
      joinedAt: new Date().toISOString().slice(0, 10),
    };
    persist(account, "mock.jwt.token");
    setUser(account);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    window.localStorage.removeItem(USER_STORAGE_KEY);
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
