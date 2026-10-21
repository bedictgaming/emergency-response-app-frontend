'use client';
import { useId } from 'react';
import type { CitizenPresence } from '@/hooks/useCitizenPresence';

export function CitizenPresenceControls({ presence, compact = false }: { presence?: CitizenPresence; compact?: boolean }) {
  const explanation = useId();
  if (!presence?.enabled) return null;
  return <section aria-label="Online citizens" className="my-4 border-t border-border pt-4">
    <h3 className="text-base font-semibold">Online citizens within 100 m</h3>
    <p id={explanation} className="mt-2 max-w-prose text-sm text-muted-foreground">Optional: share your reported GPS coordinates with other participating citizens within 100 m while this tab is visible. Blue dots show reported GPS positions, not emergencies. No names or report details are included, but someone could recognize a location. Stop sharing at any time. Locations use temporary server memory and expire after 30 seconds without updates. Device GPS can be inaccurate; dots do not prove exactly where someone is standing.</p>
    {presence.available === null ? <p role="status" className="mt-2 text-sm">Checking online sharing availability…</p>
      : !presence.available ? <p role="status" className="mt-2 text-sm">Online sharing is unavailable. Reporting still works. <button type="button" onClick={presence.retry} className="min-h-11 px-2 font-semibold underline underline-offset-4">Retry online sharing</button></p>
      : <>
        <button type="button" aria-describedby={explanation} onClick={presence.sharing ? presence.stop : presence.start}
          className="mt-3 min-h-11 rounded-lg border border-border bg-background px-3 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {presence.sharing ? 'Stop sharing my GPS location' : 'Share my GPS location and show nearby citizens'}
        </button>
        <p role="status" className="mt-2 text-sm" aria-live="polite">{!presence.sharing ? 'Online location sharing is off.'
          : presence.phase === 'live' ? presence.layer?.positions.length ? 'Nearby online participants detected · reported GPS dots.' : 'Sharing is live. No nearby opted-in participants detected.'
          : presence.phase === 'paused' ? 'Sharing paused while this tab is hidden or offline.'
          : presence.phase === 'gps-required' ? 'Sharing needs a GPS fix less than one minute old. Use Retry GPS if needed.'
          : presence.phase === 'unavailable' ? 'Online sharing is unconfirmed; dots are hidden. Retrying while this page is open.'
          : 'Connecting online sharing through Socket.IO…'}</p>
      </>}
    {compact && presence.sharing && <p className="mt-2 text-sm text-muted-foreground">Dots use your live GPS. If you have moved from this captured report pin, refresh and reconfirm the form’s GPS to show dots here.</p>}
  </section>;
}
