import type { AuthResponse, User } from '@care/shared';
import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setAccessToken } from '../lib/api';

/**
 * Auth state for the app. Holds the current user; the access token itself lives in
 * `lib/api`. On mount it attempts a silent refresh so a returning user with a valid
 * refresh cookie is restored without re-logging in.
 */

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    refreshSession().then((res) => {
      if (!active) return;
      setUser(res?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  async function login(email: string, password: string): Promise<void> {
    let data: AuthResponse;
    try {
      ({ data } = await api.post<AuthResponse>('/api/auth/login', { email, password }));
    } catch {
      throw new Error('Invalid email or password');
    }
    setAccessToken(data.accessToken);
    setUser(data.user);
  }

  async function logout(): Promise<void> {
    try {
      await api.post('/api/auth/logout');
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
