import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import {
  clearGuestVisitedCountries,
  getGuestVisitedCountries,
  getGuestVisitedRegions,
  getStoredToken,
  setStoredToken,
} from '../lib/authStorage';
import { AuthContext, type AuthContextValue } from './auth-context';
import type { AuthUser } from '../lib/api';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(
    () => sessionStorage.getItem('guestMode') === 'true',
  );

  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      const storedToken = getStoredToken();

      if (!storedToken) {
        if (!cancelled) {
          setIsLoading(false);
        }
        return;
      }

      try {
        const { user: currentUser } = await api.me(storedToken);

        if (!cancelled) {
          setToken(storedToken);
          setUser(currentUser);
          setIsGuest(false);
          sessionStorage.removeItem('guestMode');
        }
      } catch {
        setStoredToken(null);

        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { token: nextToken, user: nextUser } = await api.login(email, password);

    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setIsGuest(false);
    sessionStorage.removeItem('guestMode');
    clearGuestVisitedCountries();
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const guestCountries = getGuestVisitedCountries();
    const guestRegions = getGuestVisitedRegions();
    const { token: nextToken, user: nextUser } = await api.register(
      email,
      password,
      guestCountries,
      guestRegions,
    );

    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setIsGuest(false);
    sessionStorage.removeItem('guestMode');
    clearGuestVisitedCountries();
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setIsGuest(false);
    sessionStorage.removeItem('guestMode');
    clearGuestVisitedCountries();
  }, []);

  const enterGuestMode = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setIsGuest(true);
    sessionStorage.setItem('guestMode', 'true');
  }, []);

  const updateUserVisitedCountries = useCallback((visitedCountries: string[]) => {
    setUser((current) =>
      current ? { ...current, visitedCountries } : current,
    );
  }, []);

  const updateUserVisitedRegions = useCallback((visitedRegions: string[]) => {
    setUser((current) =>
      current ? { ...current, visitedRegions } : current,
    );
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isGuest,
      login,
      register,
      logout,
      enterGuestMode,
      updateUserVisitedCountries,
      updateUserVisitedRegions,
    }),
    [
      user,
      token,
      isLoading,
      isGuest,
      login,
      register,
      logout,
      enterGuestMode,
      updateUserVisitedCountries,
      updateUserVisitedRegions,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
