export interface AuthUser {
  id: string;
  email: string;
  visitedCountries: string[];
}

interface AuthResponse {
  token: string;
  user: AuthUser;
}

interface MeResponse {
  user: AuthUser;
}

interface VisitedCountriesResponse {
  visitedCountries: string[];
}

interface ApiError {
  message: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data === 'object' &&
      data !== null &&
      'message' in data &&
      typeof (data as ApiError).message === 'string'
        ? (data as ApiError).message
        : 'Something went wrong';
    throw new Error(message);
  }

  return data as T;
}

export const api = {
  register(email: string, password: string, visitedCountries: string[] = []) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, visitedCountries }),
    });
  },

  login(email: string, password: string) {
    return request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  me(token: string) {
    return request<MeResponse>('/auth/me', {}, token);
  },

  getVisitedCountries(token: string) {
    return request<VisitedCountriesResponse>('/visited-countries', {}, token);
  },

  updateVisitedCountries(token: string, visitedCountries: string[]) {
    return request<VisitedCountriesResponse>('/visited-countries', {
      method: 'PUT',
      body: JSON.stringify({ visitedCountries }),
    }, token);
  },
};
