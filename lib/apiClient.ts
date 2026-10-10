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
let lastRenewedHint: string | undefined;
const SESSION_LOCK_NAME = 'emergency-token-refresh';
const sessionAuthPaths = ['/auth/v1/me', '/auth/v1/login-methods', '/auth/v1/google/link', '/auth/v1/google/unlink'];

// Login and refresh both replace the shared HttpOnly cookies. Keep their
// responses ordered across tabs so an older refresh cannot overwrite a newer
// account's login cookies after the login has completed.
export async function runWithSessionLock<T>(operation: () => Promise<T>): Promise<T> {
  if (typeof navigator === 'undefined' || !navigator.locks) return operation();
  return await navigator.locks.request(SESSION_LOCK_NAME, operation);
}

function isProtectedRequest(url = '', method = 'get'): boolean {
  if (url.includes('/notifications/v1/web-push-key')) return false;
  if (method.toUpperCase() === 'GET' && url.includes('/alerts/v1/')) return false;
  if (!url.includes('/auth/v1/')) return true;
  return sessionAuthPaths.some(path => url.split('?')[0].endsWith(path));
}

export function isDefinitiveAuthFailure(error: unknown): boolean {
  if (!axios.isAxiosError(error)) return false;
  return [400, 401, 403].includes(error.response?.status ?? 0);
}

export function markSessionChanged() {
  lastRenewedHint = undefined;
  localStorage.setItem(SESSION_GENERATION_KEY, crypto.randomUUID());
}

export function markSessionEnded() {
  lastRenewedHint = undefined;
  // Clear the readable hint immediately; the server clears both credentials.
  document.cookie = 'sessionRenewAt=; Max-Age=0; Path=/';
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
  // Keep the sign-in page in place so an OAuth callback failure can explain
  // why the new session could not be verified instead of hiding the error.
  if (!['/', '/login'].includes(window.location.pathname)) window.location.replace('/');
}

function renewalHint(): string | undefined {
  const value = document.cookie.split('; ').find(cookie => cookie.startsWith('sessionRenewAt='))?.slice('sessionRenewAt='.length);
  return value && /^\d{13}$/.test(value) ? value : undefined;
}

function renewalDue(): boolean {
  const hint = renewalHint();
  return !!hint && hint !== lastRenewedHint && Date.now() >= Number(hint);
}

function refreshSession(failedGeneration?: string | null, proactive = false): Promise<void> {
  const logoutEpoch = localStorage.getItem(LOGOUT_EPOCH_KEY);
  const run = async () => {
    const refreshInsideLock = async () => {
      if (localStorage.getItem(LOGOUT_EPOCH_KEY) !== logoutEpoch) throw new axios.CanceledError('Session ended during renewal');
      if (failedGeneration !== undefined && localStorage.getItem(SESSION_GENERATION_KEY) !== failedGeneration) return;
      // A different tab may have renewed while this one waited for the lock.
      if (proactive && !renewalDue()) return;
      const hint = renewalHint();
      await axios.post(
        `${API_ORIGIN}/api/auth/v1/refresh-token`,
        {},
        { withCredentials: true, timeout: 15_000 },
      );
      if (localStorage.getItem(LOGOUT_EPOCH_KEY) !== logoutEpoch) throw new axios.CanceledError('Session ended during renewal');
      markSessionChanged();
      // If a browser did not accept the updated advisory cookie, do not rotate
      // continuously for that same hint. The existing 401 fallback still works.
      lastRenewedHint = hint;
    };
    return runWithSessionLock(refreshInsideLock);
  };

  refreshing ??= run().finally(() => { refreshing = undefined; });
  return refreshing;
}

// This readable timestamp is only an optimization. The server still verifies
// both HttpOnly credentials and the current database session on every request.
export async function ensureFreshSession(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    if (refreshing) await refreshing;
    else if (renewalDue()) await refreshSession(undefined, true);
  } catch (error) {
    if (isDefinitiveAuthFailure(error)) {
      clearSession();
      redirectAfterSessionExpiry();
    }
    throw error;
  }
}

apiClient.interceptors.request.use(
  async (config) => {
    if (typeof window !== 'undefined') {
      config.headers.delete('Authorization');
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      if (isProtectedRequest(config.url, config.method)) await ensureFreshSession();
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
    const isSessionCheck = sessionAuthPaths.some(path => requestUrl.split('?')[0].endsWith(path));
    const isAuthEndpoint = requestUrl.includes('/auth/v1/') && !isSessionCheck;
    const protectedRequest = isProtectedRequest(requestUrl, error.config?.method);
    const config = error.config as (InternalAxiosRequestConfig & { retried?: boolean; safeRetryCount?: number; authGeneration?: string | null }) | undefined;

    const method = config?.method?.toUpperCase();
    const timedOut = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';
    const retryableStatus = (!status && !timedOut) || [408, 502, 503, 504].includes(status);
    // This legacy GET consumes a capability; it is not a safe read to replay.
    const isVerificationAction = requestUrl.split('?')[0].endsWith('/auth/v1/verify-email');
    // Resume handlers refresh safe reads once the tab can use the network again.
    const canRetry = typeof window === 'undefined'
      || (navigator.onLine && document.visibilityState === 'visible');
    if (canRetry && !axios.isCancel(error) && config && !isVerificationAction && ['GET', 'HEAD', 'OPTIONS'].includes(method ?? '') && retryableStatus && !config.safeRetryCount) {
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
