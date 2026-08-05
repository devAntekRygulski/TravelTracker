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

export interface CountryPhoto {
  id: string;
  countryId: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
}

interface PhotosResponse {
  photos: CountryPhoto[];
}

export interface UploadSessionInfo {
  countryId: string;
  countryName: string;
  expiresAt: string;
  uploadUrl: string;
}

export interface CreatedUploadSession {
  token: string;
  expiresAt: string;
  uploadUrl: string;
}

export interface PendingSessionPhoto {
  id: string;
  contentType: string;
  size: number;
}

interface ApiError {
  message: string;
}

function resolveApiBase(): string {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // On the laptop in local dev, call Express directly so large guest photo
  // downloads are not broken by the Vite proxy.
  // On a phone via Cloudflare tunnel / LAN IP, use same-origin `/api` so the
  // request goes through the tunnel (phone localhost is not your PC).
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3001/api';
    }
  }

  return '/api';
}

const API_BASE = resolveApiBase();


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

  // FormData bodies must let the browser set the multipart boundary itself.
  if (
    !headers.has('Content-Type') &&
    options.body &&
    !(options.body instanceof FormData)
  ) {
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

  getCountriesWithPhotos(token: string) {
    return request<{ countryIds: string[] }>('/photos/countries', {}, token);
  },

  getCountryPhotos(token: string, countryId: string) {
    return request<PhotosResponse>(`/photos/${countryId}`, {}, token);
  },

  uploadCountryPhotos(token: string, countryId: string, files: File[]) {
    const body = new FormData();

    for (const file of files) {
      body.append('photos', file);
    }

    return request<PhotosResponse>(`/photos/${countryId}`, {
      method: 'POST',
      body,
    }, token);
  },

  deleteCountryPhoto(token: string, photoId: string) {
    return request<{ deleted: boolean }>(`/photos/${photoId}`, {
      method: 'DELETE',
    }, token);
  },

  createUploadSession(token: string, countryId: string, countryName: string) {
    return request<CreatedUploadSession>(`/photos/${countryId}/upload-session`, {
      method: 'POST',
      body: JSON.stringify({ countryName }),
    }, token);
  },

  getUploadSession(sessionToken: string) {
    return request<UploadSessionInfo>(`/photos/session/${sessionToken}`);
  },

  listGuestPendingSessions(countryId: string) {
    return request<{
      sessions: Array<{ token: string; expiresAt: string; count: number }>;
    }>(`/photos/guest-pending/${countryId}`);
  },

  uploadSessionPhotos(sessionToken: string, files: File[]) {
    const body = new FormData();

    for (const file of files) {
      body.append('photos', file);
    }

    return request<PhotosResponse>(`/photos/session/${sessionToken}`, {
      method: 'POST',
      body,
    });
  },

  createGuestUploadSession(countryId: string, countryName: string) {
    return request<CreatedUploadSession>('/photos/guest-session', {
      method: 'POST',
      body: JSON.stringify({ countryId, countryName }),
    });
  },

  getPendingSessionPhotos(sessionToken: string) {
    return request<{ photos: PendingSessionPhoto[] }>(
      `/photos/session/${sessionToken}/pending`,
    );
  },

  async downloadPendingSessionPhoto(
    sessionToken: string,
    photoId: string,
  ): Promise<Blob> {
    const response = await fetch(
      `${API_BASE}/photos/session/${sessionToken}/pending/${photoId}`,
    );

    if (!response.ok) {
      throw new Error('Failed to download photo');
    }

    const buffer = await response.arrayBuffer();
    const contentType =
      response.headers.get('content-type') ?? 'application/octet-stream';

    return new Blob([buffer], { type: contentType });
  },

  deletePendingSessionPhoto(sessionToken: string, photoId: string) {
    return request<{ deleted: boolean }>(
      `/photos/session/${sessionToken}/pending/${photoId}`,
      { method: 'DELETE' },
    );
  },
};
