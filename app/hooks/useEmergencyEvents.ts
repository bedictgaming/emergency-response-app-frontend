'use client';

import { useEffect } from 'react';
import { API_ORIGIN, isDefinitiveAuthFailure } from '@/lib/apiClient';
import { getMe } from '@/lib/services/authService';

export function useEmergencyEvents(onEvent: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;

    let source: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let retryAttempt = 0;
    let stopped = false;
    let checkingSession = false;
    const refresh = () => onEvent();

    const clearReconnectTimer = () => {
      if (reconnectTimer === null) return;
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    };

    const closeSource = () => {
      source?.close();
      source = null;
    };

    const connect = () => {
      if (stopped || source || checkingSession || (typeof navigator !== 'undefined' && !navigator.onLine)) return;

      const nextSource = new EventSource(`${API_ORIGIN}/api/events/v1/stream`, { withCredentials: true });
      source = nextSource;
      nextSource.addEventListener('incident.created', refresh);
      nextSource.addEventListener('incident.updated', refresh);
      nextSource.addEventListener('incident.verified', refresh);
      nextSource.addEventListener('dispatch.updated', refresh);
      nextSource.addEventListener('task.updated', refresh);
      nextSource.addEventListener('alert.created', refresh);
      nextSource.onopen = () => {
        retryAttempt = 0;
      };
      nextSource.onerror = () => {
        if (source !== nextSource) return;
        closeSource();
        if (stopped || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
        checkingSession = true;
        // EventSource does not expose the HTTP status. A failed stream may be
        // an expired access cookie, so let the shared API client refresh it.
        // A revoked/expired refresh cookie must stop this reconnect loop.
        void getMe().catch(error => {
          if (isDefinitiveAuthFailure(error)) stopped = true;
        }).finally(() => {
          checkingSession = false;
          if (stopped || !navigator.onLine) return;
          const delay = Math.min(30_000, 1_000 * 2 ** retryAttempt);
          retryAttempt += 1;
          clearReconnectTimer();
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, delay);
        });
      };
    };

    const handleOffline = () => {
      clearReconnectTimer();
      closeSource();
    };
    const handleOnline = () => {
      retryAttempt = 0;
      clearReconnectTimer();
      connect();
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    connect();

    return () => {
      stopped = true;
      clearReconnectTimer();
      closeSource();
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [enabled, onEvent]);
}
