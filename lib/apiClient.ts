import axios, { type InternalAxiosRequestConfig } from 'axios';

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: `${API_ORIGIN}/api`,
  timeout: 15_000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

const SESSION_GENERATION_KEY = 'emergency-session-generation';
const LOGOUT_EPOCH_KEY = 'emergency-logout-epoch';
let refreshing: Promise<void> | undefined;
const SESSION_LOCK_NAME = 'emergency-token-refresh';

// Login and refresh both replace the shared HttpOnly cookies. Keep their
// responses ordered across tabs so an older refresh cannot overwrite a newer
// account's login cookies after the login has completed.
export async function runWithSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  return await navigator.locks.request(SESSION_LOCK_NAME, operation);
}

function isProtectedRequest(url = ''): boolean {
  if (url.includes('/notifications/v1/web-push-key')) return false;
  if (!url.includes('/auth/v1/')) return true;
  return url.includes('/auth/v1/me');
}

export function isDefinitiveAuthFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return [400, 401, 403].includes(error.response?.status ?? 0);
}

export function markSessionChanged() {
  localStorage.setItem(SESSION_GENERATION_KEY, crypto.randomUUID());
}

export function markSessionEnded() {
  localStorage.removeItem(SESSION_GENERATION_KEY);
  localStorage.setItem(LOGOUT_EPOCH_KEY, crypto.randomUUID());
}

function clearSession() {
  localStorage.removeItem('user');
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  markSessionEnded();
}

function redirectAfterSessionExpiry() {
  if (window.location.pathname !== '/') window.location.replace('/');
}

function refreshSession(failedGeneration?: string | null): Promise<void> {
  const run = async () => {
    const refreshInsideLock = async () => {
      if (failedGeneration !== undefined && localStorage.getItem(SESSION_GENERATION_KEY) !== failedGeneration) return;
      await axios.post(
        `${API_ORIGIN}/api/auth/v1/refresh-token`,
        {},
        { withCredentials: true, timeout: 15_000 },
      );
      markSessionChanged();
    };
    return runWithSessionLock(refreshInsideLock);
  };

  refreshing ??= run().finally(() => { refreshing = undefined; });
  return refreshing;
}

apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      config.headers.delete('Authorization');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      (config as InternalAxiosRequestConfig & { authGeneration?: string | null }).authGeneration = localStorage.getItem(SESSION_GENERATION_KEY);
    }
    return config;
  },
  (error) => Promise.reject(error),
);

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status;
    const requestUrl = error.config?.url || '';
    const isSessionCheck = requestUrl.includes('/auth/v1/me');
    const isAuthEndpoint = requestUrl.includes('/auth/v1/') && !isSessionCheck;
    const protectedRequest = isProtectedRequest(requestUrl);
    const config = error.config as (InternalAxiosRequestConfig & { retried?: boolean; safeRetryCount?: number; authGeneration?: string | null }) | undefined;

    const method = config?.method?.toUpperCase();
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const retryableStatus = (!status && !timedOut) || [408, 502, 503, 504].includes(status);
    if (config && ['GET', 'HEAD', 'OPTIONS'].includes(method ?? '') && retryableStatus && !config.safeRetryCount) {
      config.safeRetryCount = 1;
      return apiClient.request(config);
    }

    if (status === 401 && protectedRequest && !isAuthEndpoint && config && !config.retried && typeof window !== 'undefined') {
      config.retried = true;
      try {
        await refreshSession(config.authGeneration);
        return apiClient.request(config);
      } catch (refreshError) {
        if (isDefinitiveAuthFailure(refreshError)) {
          clearSession();
          redirectAfterSessionExpiry();
        }
        return Promise.reject(refreshError);
      }
    }

    if (status === 401 && protectedRequest && !isAuthEndpoint && typeof window !== 'undefined') {
      clearSession();
      redirectAfterSessionExpiry();
    }
    return Promise.reject(error);
  },
);

export default apiClient;
