import apiClient, { markSessionChanged, runWithSessionLock } from '@/lib/apiClient';

// --- Types ---

export interface SignupPayload {
  name: string;
  email: string;
  password: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department?: 'MAIN' | 'FIRE' | 'MEDICAL' | 'POLICE' | 'DRRMO' | null;
  isMainAdmin?: boolean;
  permissions: string[];
}

export interface AuthResponse {
  status: string;
  message: string;
  data: {
    user: AuthUser;
  };
}

let pendingGetMe: Promise<AuthUser> | undefined;

// --- Service Functions ---

/**
 * POST /api/auth/v1/signup
 * Registers a new user account.
 */
export const signup = async (payload: SignupPayload): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/v1/signup', payload);
  return response.data;
};

/** Requests mail, not proof of delivery or of an account's existence. */
export const requestPasswordReset = async (email: string, signal?: AbortSignal): Promise<string> => {
  const response = await apiClient.post<{ message: string }>('/auth/v1/password-reset/request', { email }, { signal });
  return response.data.message;
};

/** Explicit single-use redemption; no automatic login. */
export const confirmPasswordReset = async (token: string, password: string, signal?: AbortSignal): Promise<string> => {
  const response = await apiClient.post<{ code: number; status: string; message: string }>('/auth/v1/password-reset/confirm', { token, password }, { signal });
  if (response.data.code !== 200 || response.data.status !== 'success') throw new Error('Password reset was not confirmed');
  return response.data.message;
};

/**
 * POST /api/auth/v1/login
 * Logs in a user. The backend sets an HttpOnly cookie with the refresh token.
 */
export const login = async (payload: LoginPayload): Promise<AuthResponse> => {
  return runWithSessionLock(async () => {
    const response = await apiClient.post<AuthResponse>('/auth/v1/login', payload);
    // Publish the account switch before releasing the cookie-mutation lock.
    // Other tabs must never retry an old request against this new account.
    localStorage.setItem('user', JSON.stringify(response.data.data.user));
    markSessionChanged();
    return response.data;
  });
};

/**
 * POST /api/auth/v1/logout
 * Logs out the user by clearing the session cookie on the backend.
 */
export const logout = async (): Promise<void> => {
  await apiClient.post('/auth/v1/logout', {});
};

/**
 * GET /api/auth/v1/me
 * Returns the currently authenticated user's profile.
 * Useful to verify if the session is still valid on page load.
 */
const fetchMe = (): Promise<AuthUser> => apiClient
  .get<{ data: { user: AuthUser } }>('/auth/v1/me')
  .then(response => response.data.data.user);

export const getMeFresh = (): Promise<AuthUser> => fetchMe();

export const getMe = (): Promise<AuthUser> => {
  // React development mode can run mount effects twice. Share the in-flight
  // session check so that this never becomes two simultaneous /me requests or
  // two competing token-refresh attempts.
  pendingGetMe ??= fetchMe().finally(() => {
      pendingGetMe = undefined;
    });

  return pendingGetMe;
};

/**
 * POST /api/auth/v1/refresh-token
 * Uses the HttpOnly cookie to get a new access token.
 */
export const refreshToken = async (): Promise<AuthResponse> => {
  const response = await apiClient.post<AuthResponse>('/auth/v1/refresh-token');
  return response.data;
};
