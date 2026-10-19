"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getIncidentHistory, type IncidentHistoryFilters, type IncidentsApiResponse } from "@/lib/services/incidentHistoryService";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { useLiveRefresh } from '@/hooks/useLiveRefresh';

export function useIncidentHistory(filters: IncidentHistoryFilters, enabled: boolean) {
  const key = JSON.stringify(filters);
  const [selection, setSelection] = useState({ key, page: 1 });
  const page = selection.key === key ? selection.page : 1;
  const [data, setData] = useState<(IncidentsApiResponse["data"] & { account: string | null; logout: string | null }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshId, setRefreshId] = useState(0);
  const backgroundRefresh = useRef(false);
  const refresh = useCallback(() => { backgroundRefresh.current = false; setRefreshId(id => id + 1); }, []);
  const refreshLive = useCallback(() => { backgroundRefresh.current = true; setRefreshId(id => id + 1); }, []);
  useLiveRefresh(refreshLive, enabled);
  const previousKey = useRef(key);
  const previousPage = useRef(page);
  useEffect(() => {
    let active = true;
    if (!enabled) return;
    const account = adminAccountSnapshot();
    const logout = localStorage.getItem('emergency-logout-epoch');
    const sameAccount = () => adminAccountSnapshot() === account && localStorage.getItem('emergency-logout-epoch') === logout;
    const accountChanged = () => {
      if (sameAccount()) return;
      active = false; setData(null); setLoading(false); setError('Account changed. Reload history from your authorized dashboard.');
    };
    window.addEventListener('storage', accountChanged);
    const background = backgroundRefresh.current && previousKey.current === key && previousPage.current === page;
    backgroundRefresh.current = false; previousPage.current = page;
    if (previousKey.current !== key) { setData(null); previousKey.current = key; }
    // A live reread must not disable a focused paging control or reset focus.
    if (!background) setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      void getIncidentHistory({ ...JSON.parse(key), page }).then(result => {
        if (active && sameAccount()) setData({ ...result, account, logout }); else accountChanged();
      }).catch(() => {
        if (active && sameAccount()) setError("History could not be loaded. Previously loaded records may be out of date. Retry to refresh."); else accountChanged();
      }).finally(() => { if (active) setLoading(false); });
    }, 250);
    return () => { clearTimeout(timer); active = false; window.removeEventListener('storage', accountChanged); };
  }, [key, page, enabled, refreshId]);
  const visibleData = typeof window !== 'undefined' && data?.account === adminAccountSnapshot() && data.logout === localStorage.getItem('emergency-logout-epoch') ? data : null;
  return {
    incidents: visibleData?.incidents ?? [], pagination: visibleData?.pagination, loading, error,
    refresh,
    setPage: (value: number) => setSelection({ key, page: value }),
  };
}
