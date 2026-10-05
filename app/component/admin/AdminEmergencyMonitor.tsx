"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  VolumeX,
  AlertTriangle,
  Flame,
  Heart,
  Shield,
  MapPin,
  Phone,
  User,
  CheckCircle,
  BellRing
} from "lucide-react";
import { type ResponseService } from "@/lib/services/incidentService";
import { getIncidentAttention, acknowledgeIncidentAttention, attentionKey, type IncidentAttention } from '@/lib/services/incidentAttentionService';
import { type EmergencyConnectionState } from '@/lib/emergencyEventStream';
import { useModalIsolation } from '@/app/hooks/useModalIsolation';
import { sirenManager } from "@/lib/services/sirenService";
import { useEmergencyEvents } from "@/app/hooks/useEmergencyEvents";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { readAdminSoundPreference, saveAdminSoundPreference } from "@/lib/adminSoundPreference";

export default function AdminEmergencyMonitor({ responseService }: { responseService?: ResponseService }) {
  const [sirenState, setSirenState] = useState(sirenManager.getState());
  const [enablingSound, setEnablingSound] = useState(false);
  const [soundPreferenceSaved, setSoundPreferenceSaved] = useState(false);
  const isSirenPlaying = sirenState.playing;
  const [queue, setQueue] = useState<IncidentAttention[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [ackError, setAckError] = useState('');
  const [acknowledging, setAcknowledging] = useState(false);
  const [connection, setConnection] = useState<EmergencyConnectionState>('connecting');
  const newIncidentAlert = queue.find(item => attentionKey(item) === selected) ?? queue[0];
  const incomingCount = queue.length;
  const queueRef = useRef<IncidentAttention[]>([]);
  const knownKeysRef = useRef(new Set<string>());
  const mutedKeysRef = useRef(new Set<string>());
  const pendingRefreshRef = useRef(false);
  const queueRevisionRef = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const isMountedRef = useRef(true);
  const requestInFlightRef = useRef(false);
  const audioActionRef = useRef(0);
  const enablingSoundRef = useRef(false);

  useEffect(() => {
    // Subscribe to audio state
    const unsubscribe = sirenManager.subscribe(setSirenState);
    return () => unsubscribe();
  }, []);

  const checkIncomingIncidents = useCallback(async () => {
      if (requestInFlightRef.current) { pendingRefreshRef.current = true; return; }
      requestInFlightRef.current = true;
      const accountAtStart = adminAccountSnapshot();
      const logoutAtStart = localStorage.getItem('emergency-logout-epoch');
      const revision = queueRevisionRef.current;
      try {
        const page = await getIncidentAttention(responseService);
        if (!isMountedRef.current || revision !== queueRevisionRef.current || adminAccountSnapshot() !== accountAtStart || localStorage.getItem('emergency-logout-epoch') !== logoutAtStart) return;
        const keys = new Set(page.items.map(attentionKey));
        const arrived = page.items.some(item => !knownKeysRef.current.has(attentionKey(item)));
        knownKeysRef.current = keys;
        mutedKeysRef.current = new Set([...mutedKeysRef.current].filter(key => keys.has(key)));
        queueRef.current = page.items; setQueue(page.items); setHasMore(page.hasMore); setQueueError('');
        if (!page.items.length) { audioActionRef.current++; sirenManager.stopSiren(); setDialogOpen(false); setAckError(''); }
        else {
          if (arrived) setDialogOpen(true);
          if (page.items.some(item => !mutedKeysRef.current.has(attentionKey(item)))) sirenManager.startSiren();
          else { audioActionRef.current++; sirenManager.stopSiren(); }
        }
      } catch {
        if (isMountedRef.current && revision === queueRevisionRef.current && adminAccountSnapshot() === accountAtStart && localStorage.getItem('emergency-logout-epoch') === logoutAtStart) {
          audioActionRef.current++; sirenManager.stopSiren();
          setQueueError('Alert queue unavailable. Shown alerts may be out of date. Check report lists and retry.');
        }
      } finally {
        requestInFlightRef.current = false;
        if (pendingRefreshRef.current && isMountedRef.current && adminAccountSnapshot() === accountAtStart) {
          pendingRefreshRef.current = false; void refreshRef.current();
        }
      }
  }, [responseService]);
  useEffect(() => { refreshRef.current = checkIncomingIncidents; }, [checkIncomingIncidents]);

  useEmergencyEvents(checkIncomingIncidents, true, setConnection);

  useEffect(() => {
    isMountedRef.current = true;

    // Run initial check immediately
    void checkIncomingIncidents();

    // Live events handle normal updates. A slow, visibility-aware refresh is a
    // recovery path for disconnected or suspended browser tabs.
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkIncomingIncidents();
    };
    const interval = window.setInterval(refreshWhenVisible, 20_000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      isMountedRef.current = false;
      audioActionRef.current += 1;
      sirenManager.stopSiren();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [checkIncomingIncidents]);

  const handleSilenceSiren = () => {
    mutedKeysRef.current = new Set(queueRef.current.map(attentionKey));
    audioActionRef.current += 1;
    sirenManager.stopSiren();
  };

  const handleAcknowledgeAlert = async () => {
    if (!newIncidentAlert || acknowledging) return;
    const item = newIncidentAlert, account = adminAccountSnapshot();
    // Cancel a gesture's pending audio unlock immediately, before the network
    // acknowledgement settles. The visual item remains until server success.
    audioActionRef.current++; sirenManager.stopSiren();
    queueRevisionRef.current++;
    setAckError('');
    setAcknowledging(true);
    try {
      await acknowledgeIncidentAttention(item, responseService);
      if (!isMountedRef.current || adminAccountSnapshot() !== account) return;
      queueRevisionRef.current++;
      queueRef.current = queueRef.current.filter(row => attentionKey(row) !== attentionKey(item));
      setQueue(queueRef.current);
      if (!queueRef.current.length) { audioActionRef.current++; sirenManager.stopSiren(); setDialogOpen(false); }
      void checkIncomingIncidents();
    } catch {
      if (isMountedRef.current && adminAccountSnapshot() === account) {
        setAckError('Acknowledgement not confirmed. Retry this report; response status is unchanged.');
        void checkIncomingIncidents();
      }
    } finally { if (isMountedRef.current && adminAccountSnapshot() === account) setAcknowledging(false); }
  };

  const activateSound = useCallback(async (mode: 'test' | 'alert' | 'restore') => {
    if (enablingSoundRef.current) return;
    const action = ++audioActionRef.current;
    const accountAtStart = adminAccountSnapshot();
    const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
    enablingSoundRef.current = true;
    setEnablingSound(true);
    const ready = await sirenManager.enableAudio();
    enablingSoundRef.current = false;
    if (!isMountedRef.current || adminAccountSnapshot() !== accountAtStart
      || localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) return;
    setEnablingSound(false);
    if (ready && mode !== 'restore') {
      setSoundPreferenceSaved(saveAdminSoundPreference(accountAtStart));
    }
    if (ready && audioActionRef.current === action) {
      if (mode === 'alert' && queueRef.current.some(item => !mutedKeysRef.current.has(attentionKey(item)))) sirenManager.startSiren();
      else if (mode === 'test') sirenManager.testSiren();
      // Restoring readiness must never replay an old or acknowledged alert.
    }
  }, []);

  useEffect(() => {
    const account = adminAccountSnapshot();
    const saved = readAdminSoundPreference(account);
    setSoundPreferenceSaved(saved);
    if (!saved) return;

    // Persist consent, not the AudioContext. A fresh document still needs a trusted
    // gesture; background reports, synthetic events and page load cannot unlock it.
    const restoreOnInteraction = (event: Event) => {
      if (!event.isTrusted || !isMountedRef.current || adminAccountSnapshot() !== account
        || sirenManager.getState().audioReady) return;
      if (event.target instanceof Element && event.target.closest('[data-siren-control]')) return;
      if (event instanceof KeyboardEvent
        && (event.repeat || event.ctrlKey || event.metaKey || event.altKey
          || event.key === 'Escape' || event.key === 'Shift' || event.key === 'Control'
          || event.key === 'Alt' || event.key === 'Meta')) return;
      void activateSound('restore');
    };
    document.addEventListener('click', restoreOnInteraction, true);
    document.addEventListener('keydown', restoreOnInteraction, true);
    return () => {
      document.removeEventListener('click', restoreOnInteraction, true);
      document.removeEventListener('keydown', restoreOnInteraction, true);
    };
  }, [activateSound]);

  const handleEnableSound = (playAlert = false) => {
    if (playAlert && newIncidentAlert && !queueError) mutedKeysRef.current.delete(attentionKey(newIncidentAlert));
    return activateSound(playAlert && !queueError ? 'alert' : 'test');
  };
  useModalIsolation(dialogOpen && Boolean(newIncidentAlert), panelRef, () => {
    handleSilenceSiren(); setDialogOpen(false);
  });

  const getCategoryIcon = (type?: string) => {
    const t = (type || "").toLowerCase();
    if (t.includes("fire")) return <Flame className="w-6 h-6 text-red-500" />;
    if (t.includes("med")) return <Heart className="w-6 h-6 text-rose-500" />;
    if (t.includes("pol") || t.includes("sec")) return <Shield className="w-6 h-6 text-blue-500" />;
    return <AlertTriangle className="w-6 h-6 text-amber-500" />;
  };

  return (
    <>
      {/* Header Siren Status & Control Button */}
      <div data-siren-control className="flex shrink-0 items-center gap-2">
        <button type="button" onClick={() => { if (incomingCount) setDialogOpen(true); void checkIncomingIncidents(); }}
          className="min-h-11 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground">
          Outstanding alerts: {incomingCount}{hasMore ? '+' : ''}
        </button>
        {isSirenPlaying ? (
          <button
            onClick={handleSilenceSiren}
            className="motion-press flex min-h-11 items-center gap-2 px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 shadow-sm border border-red-400"
            title="Siren is wailing! Click to mute audio"
          >
            <VolumeX className="w-4 h-4" />
            <span>MUTE SIREN</span>
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs">
            <span className="flex h-2 w-2 relative">
              <span className={`relative inline-flex h-2 w-2 rounded-full ${sirenState.audioReady ? 'bg-success' : 'bg-warning'}`}></span>
            </span>
            <span role="status" className="text-xs font-semibold text-foreground">
              {sirenState.audioReady ? 'Siren Armed' : sirenState.unavailable ? 'Sound unavailable' : soundPreferenceSaved ? 'Sound saved · click to arm' : 'Sound not enabled'}
            </span>
            <button
              type="button"
              disabled={enablingSound}
              onClick={() => { void handleEnableSound(queue.some(item => !mutedKeysRef.current.has(attentionKey(item)))); }}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              title={sirenState.audioReady ? "Test loud emergency siren" : soundPreferenceSaved ? "Your preference is saved. Click or press a key on this dashboard to arm sound, or use Resume sound to test it." : "Enable and test emergency alert sound; remember this preference in this browser"}
            >
              {enablingSound ? 'Enabling sound…' : sirenState.audioReady ? 'Test' : soundPreferenceSaved ? 'Resume sound' : 'Enable sound'}
            </button>
          </div>
        )}
      </div>
      <span role="status" className="max-w-xs text-xs text-muted-foreground">
        {queueError || (connection === 'live' ? 'Live connection · queue checked every 20s' : connection === 'offline' ? 'Offline · alerts cannot be confirmed' : 'Reconnecting · report polling continues')}
      </span>

      {/* Emergency Report Audio/Visual Strobe Banner / Modal */}
      {dialogOpen && newIncidentAlert && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          data-history-modal
          tabIndex={-1}
          className="motion-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          data-siren-control
          aria-modal="true"
          aria-labelledby="emergency-alert-title"
        >
          <div className="motion-dialog-panel relative my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-destructive bg-card text-foreground shadow-2xl">
            {/* Flashing Siren Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 bg-destructive px-5 py-3.5 text-destructive-foreground">
              <div className="flex items-center gap-2.5">
                <BellRing className="w-6 h-6 text-white" />
                <div>
                  <h3 id="emergency-alert-title" className="text-base font-black tracking-wide text-white uppercase">
                    Outstanding report
                  </h3>
                  <p className="text-xs text-red-100 font-medium">
                    Current work awaiting your acknowledgement
                  </p>
                </div>
              </div>
              {incomingCount > 1 && (
                <span className="shrink-0 rounded-full bg-card px-2 py-1 text-xs font-semibold text-destructive">
                  {incomingCount}{hasMore ? '+' : ''} waiting
                </span>
              )}
            </div>

            {/* Incident Details */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
              <p className="text-xs text-muted-foreground">Reported {new Date(newIncidentAlert.reportedAt).toLocaleString()}. This may be outstanding work from before you opened the dashboard.</p>
              {incomingCount > 1 && <div>
                <label htmlFor="outstanding-alert-selection" className="mb-1 block text-xs">Choose a report to review</label>
                <select id="outstanding-alert-selection" name="outstandingAlert" value={attentionKey(newIncidentAlert)} onChange={event => setSelected(event.target.value)}
                  className="min-h-11 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground">
                  {queue.map(item => <option key={attentionKey(item)} value={attentionKey(item)}>{item.title}</option>)}
                </select>
              </div>}
              {hasMore && <p className="text-xs text-muted-foreground">More reports remain in the server queue. Acknowledge reviewed items to load the next ones; none are cleared together.</p>}
              {(queueError || ackError) && <p role="alert" className="rounded-lg bg-warning p-3 text-sm text-warning-foreground">{queueError || ackError}</p>}
              {!sirenState.audioReady && (
                <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-warning p-3 text-sm text-warning-foreground">
                  <p className="min-w-0 flex-1">
                    {sirenState.unavailable ? 'Sound could not start. Try again and check your browser’s sound settings.' : soundPreferenceSaved ? 'Your sound preference is saved, but this page is not armed yet. Resume sound to hear this alert.' : 'Sound is not enabled. Enable it to hear this alert.'}
                  </p>
                  <button type="button" disabled={enablingSound}
                    onClick={() => { void handleEnableSound(true); }}
                    className="min-h-11 rounded-lg border border-current px-3 font-semibold disabled:opacity-60">
                    {enablingSound ? 'Enabling sound…' : soundPreferenceSaved ? 'Resume sound' : 'Enable sound'}
                  </button>
                </div>
              )}
              {/* Type and Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="rounded-xl border border-border bg-muted p-2.5">
                    {getCategoryIcon(newIncidentAlert.type?.typeName)}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">
                      Incident Type
                    </span>
                    <h4 className="text-lg font-bold text-foreground">
                      {newIncidentAlert.type?.typeName || "General Emergency"}
                    </h4>
                  </div>
                </div>

                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-3 py-1 text-xs font-semibold text-destructive">
                  {newIncidentAlert.status || "ACTIVE"}
                </span>
              </div>

              {/* Title & Description */}
              <div className="rounded-xl border border-border bg-muted p-3.5">
                <p className="mb-1 text-sm font-semibold text-foreground">
                  {newIncidentAlert.title}
                </p>
                {(() => {
                  const cleanDesc = (newIncidentAlert.description || '')
                    .replace(/\[Contact:\s*([^\]]+)\]/, '')
                    .trim();
                  if (!cleanDesc) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-border">
                      <span className="mb-0.5 block text-xs font-semibold text-muted-foreground">
                        Report Description:
                      </span>
                      <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                        {cleanDesc}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Location & Reporter Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-2.5">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground block text-xs font-medium">Location</span>
                    <span className="font-semibold text-foreground break-words">
                      {newIncidentAlert.location?.address ||
                        newIncidentAlert.location?.locationName ||
                        "Cordova, Cebu"}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-lg border border-border bg-muted p-2.5">
                  <User className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-muted-foreground block text-xs font-medium">Reporter</span>
                    <span className="font-semibold text-foreground">
                      {newIncidentAlert.reporter?.name || "Citizen Reporter"}
                    </span>
                    {(() => {
                      const phone =
                        newIncidentAlert.description?.match(/\[Contact:\s*([^\]]+)\]/)?.[1];
                      if (!phone) return null;
                      return (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-xs text-foreground font-mono">
                            📞 {phone}
                          </span>
                          <a
                            href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                            className="inline-flex min-h-11 items-center gap-1 rounded border border-border bg-card px-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            <span>Call Contact</span>
                          </a>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={handleSilenceSiren}
                  className={`flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    isSirenPlaying
                      ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <VolumeX className="w-4 h-4" />
                  <span>{isSirenPlaying ? "Silence Loud Siren" : "Sound not playing"}</span>
                </button>

                <button
                  type="button"
                  disabled={acknowledging || Boolean(queueError)}
                  onClick={() => { void handleAcknowledgeAlert(); }}
                  className="flex-1 rounded-xl bg-destructive px-4 py-3 text-xs font-semibold text-destructive-foreground flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{acknowledging ? 'Saving acknowledgement…' : 'Acknowledge this report'}</span>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Acknowledgement is personal. It does not dispatch units, resolve the report or clear another department’s alert.</p>
              <button type="button" onClick={() => { handleSilenceSiren(); setDialogOpen(false); }} className="min-h-11 w-full rounded-lg border border-border px-3 text-sm">Review later — keep in queue</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
