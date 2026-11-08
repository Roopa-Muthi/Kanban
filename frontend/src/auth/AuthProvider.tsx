import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, authApi, setSessionExpiredHandler, tokenStore } from "../api";
import type { RegisterPayload, User } from "../types";
import { AuthContext } from "./context";
import type { AuthContextValue } from "./context";


export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Only "loading" if there's a stored token to verify.
  const [loading, setLoading] = useState<boolean>(() => tokenStore.getAccess() !== null);

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null));
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    if (tokenStore.getAccess() === null) return;
    let cancelled = false;
    authApi
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
            .catch((err: unknown) => {
        // request() already clears the tokens when the session is really dead (refresh failed).
        // A network error or a 5xx shouldn't throw a valid session away.
        if (err instanceof ApiError && err.status === 401) tokenStore.clear();
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const tokens = await authApi.login(username, password);
    tokenStore.setTokens(tokens.access, tokens.refresh);
    setUser(await authApi.me());
  }, []);

  const register = useCallback(
    async (payload: RegisterPayload) => {
      await authApi.register(payload);
      await login(payload.username, payload.password);
    },
    [login],
  );

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}