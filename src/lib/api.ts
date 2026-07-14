export interface AuthUser {
  id: string;
  email: string;
  visitedCountries: string[];
  visitedRegions: string[];
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

interface VisitedRegionsResponse {
  visitedRegions: string[];
}

interface ApiError {
  message: string;
}

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

function getErrorMessage(data: unknown, response: Response, rawBody: string): string {
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as ApiError).message === 'string'
  ) {
    return (data as ApiError).message;
  }

  if (response.status === 502 || response.status === 503 || response.status === 504) {
    return 'Cannot reach the server. Run npm run dev and make sure the API is running on port 3001.';
  }

  if (rawBody.includes('ECONNREFUSED') || rawBody.includes('proxy error')) {
    return 'Cannot reach the server. Run npm run dev and make sure the API is running on port 3001.';
  }

  return 'Something went wrong. Check that npm run dev is running and try again.';
}

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

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new Error(
      'Cannot reach the server. Run npm run dev and make sure the API is running on port 3001.',
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const rawBody = await response.text();
  let data: unknown = null;

  if (contentType.includes('application/json') && rawBody) {
    try {
      data = JSON.parse(rawBody);
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(data, response, rawBody));
  }

  if (data === null) {
    throw new Error('Unexpected response from server.');
  }

  return data as T;
}

export const api = {
  register(
    email: string,
    password: string,
    visitedCountries: string[] = [],
    visitedRegions: string[] = [],
  ) {
    return request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, visitedCountries, visitedRegions }),
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

  updateVisitedRegions(token: string, visitedRegions: string[]) {
    return request<VisitedRegionsResponse>('/visited-regions', {
      method: 'PUT',
      body: JSON.stringify({ visitedRegions }),
    }, token);
  },
};
