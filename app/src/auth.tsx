import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { api, setUnauthorizedHandler } from "./api";

type AuthContextValue = {
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  registerAndLogin: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("jobcrm-token"));

  const storeToken = useCallback((value: string | null) => {
    setToken(value);
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
      async login(email, password) {
        const accessToken = await api.login(email, password);
        storeToken(accessToken);
      },
      async registerAndLogin(name, email, password) {
        await api.register(name, email, password);
        const accessToken = await api.login(email, password);
        storeToken(accessToken);
      },
      logout() {
        storeToken(null);
      }
    }),
    [token, storeToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
};
