import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setUnauthorizedHandler } from "./api";
import { UserPublic } from "./types";

type AuthContextValue = {
  token: string | null;
  user: UserPublic | null;
  isUserLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("jobcrm-token"));
  const [user, setUser] = useState<UserPublic | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(false);

  const storeToken = useCallback((value: string | null) => {
    setToken(value);
    if (!value) setUser(null);
    if (value) localStorage.setItem("jobcrm-token", value);
    else localStorage.removeItem("jobcrm-token");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      storeToken(null);
    });
    return () => {
      setUnauthorizedHandler(null);
    };
  }, [storeToken]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isUserLoading,
      async login(email, password) {
        const accessToken = await api.login(email, password);
        storeToken(accessToken);
      },
      logout() {
        storeToken(null);
      }
    }),
    [token, user, isUserLoading, storeToken]
  );

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      setIsUserLoading(false);
      return;
    }
    setIsUserLoading(true);
    (async () => {
      try {
        const me = await api.getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) storeToken(null);
      } finally {
        if (!cancelled) setIsUserLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, storeToken]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};
