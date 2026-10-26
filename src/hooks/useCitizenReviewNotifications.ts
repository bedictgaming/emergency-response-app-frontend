'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveRefresh } from './useLiveRefresh';
import { citizenReviewIdentity, getCitizenReviewNotifications, notificationReceipt, type CitizenReviewNotification } from '@/lib/services/citizenNotificationService';
import { addNotificationReceipts, citizenNotificationReadKey, parseNotificationReceipts } from '@/lib/citizenNotificationReadState';

export function useCitizenReviewNotifications(userId: string) {
  const [boundary, setBoundary] = useState(0);
  const identity = citizenReviewIdentity(userId);
  const [state, setState] = useState<{ identity: string; items: CitizenReviewNotification[]; hasMore: boolean; error: boolean } | null>(null);
  const [read, setRead] = useState<{ userId: string; keys: string[] }>({ userId: '', keys: [] });
  const [readWarning, setReadWarning] = useState('');
  const pending = useRef<AbortController | null>(null), revision = useRef(0);
  const readKey = citizenNotificationReadKey(userId);
  const cancel = useCallback(() => { revision.current++; pending.current?.abort(); }, []);
  const load = useCallback(async () => {
    const actor = citizenReviewIdentity(userId); if (!actor) return;
    const version = ++revision.current; pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    try {
      const data = await getCitizenReviewNotifications(controller.signal);
      if (!controller.signal.aborted && citizenReviewIdentity(userId) === actor && version === revision.current) setState({ identity: actor, ...data, error: false });
    } catch {
      if (!controller.signal.aborted && citizenReviewIdentity(userId) === actor && version === revision.current) setState(previous => ({ identity: actor, items: previous?.identity === actor ? previous.items : [], hasMore: previous?.identity === actor ? previous.hasMore : false, error: true }));
    }
  }, [userId]);
  useEffect(() => {
    if (!identity) return;
    try { setRead({ userId, keys: parseNotificationReceipts(localStorage.getItem(readKey)) }); } catch { setRead({ userId, keys: [] }); }
    void load();
    return cancel;
  }, [identity, readKey, userId, load, boundary, cancel]);
  useEffect(() => {
    const storage = (event: StorageEvent) => {
      if (!event.key || ['user','emergency-session-generation','emergency-logout-epoch'].includes(event.key)) {
        cancel(); setState(null); setBoundary(value => value + 1);
      } else if (event.key === readKey) setRead({ userId, keys: parseNotificationReceipts(event.newValue) });
    };
    window.addEventListener('storage', storage);
    return () => window.removeEventListener('storage', storage);
  }, [readKey, userId, cancel]);
  useLiveRefresh(load, Boolean(identity));
  const current = state?.identity === identity ? state : null;
  const markItemsRead = useCallback((items: CitizenReviewNotification[]) => {
    const actor = citizenReviewIdentity(userId);
    if (!actor || state?.identity !== actor) return;
    const allowed = new Set(state.items.map(notificationReceipt));
    const receipts = items.map(notificationReceipt).filter(key => allowed.has(key));
    if (!receipts.length) return;
    const keys = addNotificationReceipts(read.userId === userId ? read.keys : [], receipts);
    setRead({ userId, keys });
    try { localStorage.setItem(readKey, JSON.stringify(keys)); setReadWarning(''); }
    catch { setReadWarning('Read status could not be saved in this browser. It is remembered for this session only.'); }
  }, [readKey, userId, read, state]);
  return { identity, items: current?.items ?? [], hasMore: current?.hasMore ?? false,
    error: current?.error ? 'Review updates could not be refreshed. Try again; your reports are unchanged.' : undefined,
    loading: Boolean(identity && !current), readWarning, markRead: (item: CitizenReviewNotification) => markItemsRead([item]),
    markAllRead: () => markItemsRead(current?.items ?? []), refresh: load,
    isRead: (item: CitizenReviewNotification) => read.userId === userId && read.keys.includes(notificationReceipt(item)) };
}
