'use client';
import { useId } from 'react';
import type { CitizenPresence } from '@/hooks/useCitizenPresence';

export function CitizenPresenceControls({ presence, compact = false }: { presence?: CitizenPresence; compact?: boolean }) {
  const explanation = useId();
  const rememberedChoice = useId();
  if (!presence?.enabled) return null;
  return <section aria-label="Online citizens" className="my-4 border-t border-border pt-4">
    <h3 className="text-base font-semibold">Online citizens within 100 m</h3>
    <p id={explanation} className="mt-2 max-w-prose text-sm text-muted-foreground">Optional: share your reported GPS coordinates with other participating citizens within 100 m while this tab is visible. Blue dots show reported GPS positions, not emergencies. No names or report details are included, but someone could recognize a location. Stop sharing at any time. Locations use temporary server memory and expire after 30 seconds without updates. Device GPS can be inaccurate; dots do not prove exactly where someone is standing.</p>
    <p className="mt-2 max-w-prose text-sm text-muted-foreground">Dots follow fresh GPS readings as you move, and appear or disappear when the reported positions cross the 100 m boundary. No walking trail is saved.</p>
    <p id={rememberedChoice} className="mt-2 max-w-prose text-sm text-muted-foreground">Your ON/OFF choice is remembered for your account in this browser. Enable once to resume sharing on future visits while this dashboard is visible. Stop sharing keeps it off, including after refresh.</p>
    {presence.available === null ? <p role="status" className="mt-2 text-sm">Checking online sharing availability…</p>
      : !presence.available ? <p role="status" className="mt-2 text-sm">Online sharing is unavailable. Reporting still works. <button type="button" onClick={presence.retry} className="min-h-11 px-2 font-semibold underline underline-offset-4">Retry online sharing</button></p>
      : null}
    {(presence.preferenceEnabled || presence.available === true || presence.preferenceError === 'stop') && <>
        <button type="button" aria-describedby={`${explanation} ${rememberedChoice}`} onClick={presence.preferenceEnabled || presence.preferenceError === 'stop' ? presence.stop : presence.start}
          className="mt-3 min-h-11 max-w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
          {presence.preferenceError === 'stop' ? 'Retry saving Stop sharing' : presence.preferenceEnabled ? 'Stop sharing my GPS location' : 'Enable automatic location sharing'}
        </button>
        {presence.sharing && presence.phase === 'live' && <p className="mt-2 text-sm font-semibold">Location sharing is on.</p>}
        <p role="status" className="mt-2 text-sm" aria-live="polite">{!presence.preferenceEnabled ? 'Online location sharing is off.'
          : !presence.sharing ? 'Automatic sharing is enabled, but online sharing is not connected.'
          : presence.phase === 'live' ? presence.layer?.positions.length ? 'Nearby online participants detected · reported GPS dots.' : 'Sharing is live. No nearby opted-in participants detected.'
          : presence.phase === 'paused' ? 'Sharing paused while this tab is hidden or offline.'
          : presence.phase === 'gps-required' ? 'Sharing needs a GPS fix less than one minute old. Use Retry GPS if needed.'
          : presence.phase === 'reconnect-required' ? 'Online sharing could not confirm a matching connection. Dots are hidden; reporting still works.'
          : presence.phase === 'unavailable' ? 'Online sharing is unconfirmed; dots are hidden. Retrying while this page is open.'
          : 'Connecting online sharing through Socket.IO…'}</p>
        {presence.sharing && presence.phase === 'reconnect-required' && <button type="button" onClick={presence.retry}
          className="mt-2 min-h-11 rounded-lg px-3 font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring">Retry online sharing</button>}
      </>}
    {presence.preferenceError && <p role="alert" className="mt-2 max-w-prose text-sm">{presence.preferenceError === 'stop'
      ? 'Sharing stopped in this tab, but the OFF choice could not be saved. Retry saving before reloading; a previously saved ON choice could otherwise resume sharing.'
      : 'Your browser could not remember your sharing choice. Sharing is off. Allow browser storage, then enable sharing again.'}</p>}
    {compact && presence.sharing && <p className="mt-2 text-sm text-muted-foreground">Dots use your live GPS. If you have moved from this captured report pin, refresh and reconfirm the form’s GPS to show dots here.</p>}
  </section>;
}
