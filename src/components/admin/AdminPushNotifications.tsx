'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { registerWebPush, registerWebPushOnAdminVisit, showWebPushDeviceTest, webPushProblem, WebPushError, type PushProblem } from '@/lib/browserPush';

type State = 'checking' | 'off' | 'blocked' | 'enabled' | 'error' | PushProblem;
const descriptions: Partial<Record<State, string>> = {
  unsupported: 'This browser cannot receive Web Push. On Android, try Chrome. On iPhone, add the site to your Home Screen and open it there.',
  insecure: 'Open the HTTPS website to enable notifications. Ordinary HTTP phone/LAN addresses cannot receive Web Push.',
  'local-disabled': 'Push is disabled in this development preview. Use the documented push-only test mode or a production preview.',
  'not-configured': 'The server has no active Web Push configuration. Ask the project administrator to configure it; your report dashboard still works.',
  'worker-disabled': 'The server notification worker is disabled. Notifications are not ready; keep the dashboard open until it is configured.',
  'worker-unavailable': 'The notification service worker did not become ready. Reload this page and try again.',
  'session-changed': 'The signed-in account changed. Reload the dashboard before enabling notifications.',
  blocked: 'Notifications are blocked. Change this site’s notification permission in your browser settings, then check again.',
  off: 'Allow notifications on this browser to receive update hints when the website tab is closed. If your browser did not show the permission prompt, use Enable notifications below. No SMS credits are needed.',
  enabled: 'This browser is registered. Stay signed in; closing a tab is different from logging out. Internet and browser/phone notification settings still control delivery.',
  error: 'Could not register this browser. Check your connection and try again. Dashboard alerts still work while the page is open.',
};

export default function AdminPushNotifications() {
  const [state, setState] = useState<State>('checking');
  const [testMessage, setTestMessage] = useState('');
  const mounted = useRef(false), busy = useRef(false);
  const check = async (request: 'automatic' | 'explicit') => {
    if (busy.current) return;
    const problem = webPushProblem();
    if (problem) { if (mounted.current) setState(problem); return; }
    busy.current = true;
    setState('checking'); setTestMessage('');
    try {
      const registered = await (request === 'automatic' ? registerWebPushOnAdminVisit() : registerWebPush(true));
      if (mounted.current) setState(registered ? 'enabled' : Notification.permission === 'denied' ? 'blocked' : 'off');
    } catch (error) {
      if (mounted.current) setState(error instanceof WebPushError ? error.problem : 'error');
    } finally { busy.current = false; }
  };
  useEffect(() => {
    mounted.current = true;
    // This header mounts only after useAdminGuard verifies the current account.
    // Wait for foreground visibility; never request consent in a background tab.
    const initialize = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', initialize);
      void check('automatic');
    };
    document.addEventListener('visibilitychange', initialize);
    initialize();
    return () => { mounted.current = false; document.removeEventListener('visibilitychange', initialize); };
  }, []);

  const deviceTest = async () => {
    setTestMessage('');
    try {
      await showWebPushDeviceTest();
      if (mounted.current) setTestMessage('Device display requested. This tests the local notification display, not server delivery or closed-tab receipt.');
    } catch {
      if (mounted.current) setTestMessage('Device display failed. Check browser and phone notification settings.');
    }
  };
  const label = state === 'enabled' ? 'Registered' : state === 'checking' ? 'Checking…' : state === 'off' ? 'Not enabled' : state === 'blocked' ? 'Blocked' : 'Unavailable';
  return (
    <details open={state === 'off' || state === 'blocked' || state === 'error'} className="min-w-0 border-t border-border pt-1 xl:col-span-2" data-admin-push>
      <summary className="min-h-11 cursor-pointer content-center text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <span className="ml-1 inline-flex items-center gap-2"><Bell size={16} aria-hidden="true" />Background notifications <span className="text-muted-foreground">· {label}</span></span>
      </summary>
      <div className="grid max-w-3xl gap-3 pb-2 pt-1 text-sm">
        <p role="status" aria-live="polite" className="text-muted-foreground">{state === 'checking' ? 'Checking notification registration…' : descriptions[state]}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={state === 'checking' || state === 'unsupported' || state === 'insecure' || state === 'local-disabled'}
            onClick={() => { void check('explicit'); }}
            className="min-h-11 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60">
            {state === 'off' ? 'Enable notifications' : 'Check notification setup'}
          </button>
          {state === 'enabled' && <button type="button" onClick={() => { void deviceTest(); }}
            className="min-h-11 rounded-lg border border-border px-3 py-2 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Show device test</button>}
        </div>
        {testMessage && <p role="status" className="text-muted-foreground">{testMessage}</p>}
        <p className="text-muted-foreground">Reports notify Main Admin and the assigned department only. Push is an update hint, not proof that someone has responded. Phone notification sounds are separate from the dashboard siren.</p>
      </div>
    </details>
  );
}
