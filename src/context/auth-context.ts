import { createContext } from 'react';
import type { AuthUser } from '../lib/api';

export interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  isGuest: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  enterGuestMode: () => void;
  updateUserVisitedCountries: (visitedCountries: string[]) => void;
  updateUserVisitedRegions: (visitedRegions: string[]) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
