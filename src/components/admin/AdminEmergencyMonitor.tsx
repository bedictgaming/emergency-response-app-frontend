"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  VolumeX,
  Volume2,
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
import { useModalIsolation } from '@/hooks/useModalIsolation';
import { sirenManager } from "@/lib/services/sirenService";
import { useEmergencyEvents } from "@/hooks/useEmergencyEvents";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { saveAdminSoundPreference } from "@/lib/adminSoundPreference";
import { NewReportAlertGate } from '@/lib/newReportAlertGate';
import { NearbyReportDialog } from './NearbyReportDialog';
import { ReportContactNumber } from '@/components/shared/ReportContactNumber';
import { reportContactHref } from '@/lib/reportContact';

export default function AdminEmergencyMonitor({ responseService }: { responseService?: ResponseService }) {
  const [sirenState, setSirenState] = useState(sirenManager.getState());
  const [enablingSound, setEnablingSound] = useState(false);
  const [alertsMuted, setAlertsMuted] = useState(false);
  const [hasPendingSound, setHasPendingSound] = useState(false);
  const isSirenPlaying = sirenState.playing;
  const [queue, setQueue] = useState<IncidentAttention[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [mainMonitoring, setMainMonitoring] = useState(false);
  const [selected, setSelected] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [queueError, setQueueError] = useState('');
  const [ackError, setAckError] = useState('');
  const [acknowledging, setAcknowledging] = useState(false);
  const [nearbyReview, setNearbyReview] = useState<{ incidentId: string; identity: string } | null>(null);
  const [connection, setConnection] = useState<EmergencyConnectionState>('connecting');
  const newIncidentAlert = queue.find(item => attentionKey(item) === selected) ?? queue[0];
  const incomingCount = queue.length;
  const queueRef = useRef<IncidentAttention[]>([]);
  const queueConfirmedRef = useRef(false);
  const reportGateRef = useRef(new NewReportAlertGate());
  const gateIdentityRef = useRef('');
  const pendingSoundKeysRef = useRef(new Set<string>());
  const activeSoundKeysRef = useRef(new Set<string>());
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
    const unsubscribe = sirenManager.subscribe(state => {
      // A stopped/interrupted playback must not attach its old reports to a
      // later siren started for a genuinely new submission.
      if (!state.playing) activeSoundKeysRef.current.clear();
      setSirenState(state);
    });
    return () => unsubscribe();
  }, []);

  const playPendingReports = useCallback(() => {
    if (!queueConfirmedRef.current) return;
    const pending = queueRef.current.map(attentionKey).filter(key => pendingSoundKeysRef.current.has(key) && !mutedKeysRef.current.has(key));
    if (!pending.length) { setHasPendingSound(false); return; }
    sirenManager.startSiren();
    if (sirenManager.getState().playing) {
      for (const key of pending) {
        pendingSoundKeysRef.current.delete(key);
        activeSoundKeysRef.current.add(key);
      }
    }
    setHasPendingSound(pendingSoundKeysRef.current.size > 0);
  }, []);

  const checkIncomingIncidents = useCallback(async () => {
      if (requestInFlightRef.current) { pendingRefreshRef.current = true; return; }
      requestInFlightRef.current = true;
      const accountAtStart = adminAccountSnapshot();
      const logoutAtStart = localStorage.getItem('emergency-logout-epoch');
      const revision = queueRevisionRef.current;
      try {
        const receivedPage = await getIncidentAttention(responseService);
        if (!isMountedRef.current || revision !== queueRevisionRef.current || adminAccountSnapshot() !== accountAtStart || localStorage.getItem('emergency-logout-epoch') !== logoutAtStart) return;
        const identity = `${accountAtStart}:${logoutAtStart}:${responseService ?? 'MAIN'}`;
        if (gateIdentityRef.current !== identity) {
          gateIdentityRef.current = identity;
          reportGateRef.current = new NewReportAlertGate();
          pendingSoundKeysRef.current.clear(); activeSoundKeysRef.current.clear(); mutedKeysRef.current.clear();
          setHasPendingSound(false);
          audioActionRef.current++; sirenManager.stopSiren(); setDialogOpen(false);
        }
        // Observe quiet B too, so its later acknowledgment/admission can never
        // be mistaken for a fresh arrival. It remains visible in nearby intake.
        const arrived = reportGateRef.current.observe(receivedPage.items, receivedPage.observedAt);
        const page = { ...receivedPage, items: receivedPage.items.filter(item => item.pendingNearbyReview !== true) };
        const keys = new Set(page.items.map(attentionKey));
        pendingSoundKeysRef.current = new Set([...pendingSoundKeysRef.current].filter(key => keys.has(key)));
        activeSoundKeysRef.current = new Set([...activeSoundKeysRef.current].filter(key => keys.has(key)));
        mutedKeysRef.current = new Set([...mutedKeysRef.current].filter(key => keys.has(key)));
        for (const item of page.items) {
          const key = attentionKey(item);
          if (arrived.has(item.incidentId)) pendingSoundKeysRef.current.add(key);
          else if (!pendingSoundKeysRef.current.has(key) && !activeSoundKeysRef.current.has(key)) mutedKeysRef.current.add(key);
        }
        queueConfirmedRef.current = true;
        setAlertsMuted(page.items.length > 0 && page.items.every(item => mutedKeysRef.current.has(attentionKey(item))));
        queueRef.current = page.items; setQueue(page.items); setHasMore(page.hasMore); setQueueError('');
        const monitoring = page.acknowledgementMode === 'DEPARTMENT_HANDOFF' || page.scope === 'MAIN' || page.items.some(item => item.scope === 'MAIN');
        setMainMonitoring(monitoring);
        if (!page.items.length) { audioActionRef.current++; sirenManager.stopSiren(); setHasPendingSound(false); setDialogOpen(false); setAckError(''); }
        else {
          const newest = page.items.find(item => arrived.has(item.incidentId));
          if (newest) { setSelected(attentionKey(newest)); setDialogOpen(true); }
          if (!activeSoundKeysRef.current.size) sirenManager.stopSiren();
          playPendingReports();
          if (!pendingSoundKeysRef.current.size && !activeSoundKeysRef.current.size) audioActionRef.current++;
        }
      } catch {
        if (isMountedRef.current && revision === queueRevisionRef.current && adminAccountSnapshot() === accountAtStart && localStorage.getItem('emergency-logout-epoch') === logoutAtStart) {
          queueConfirmedRef.current = false;
          audioActionRef.current++; sirenManager.stopSiren();
          setQueueError('Alert queue unavailable. Shown alerts may be out of date. Check report lists and retry.');
        }
      } finally {
        requestInFlightRef.current = false;
        if (pendingRefreshRef.current && isMountedRef.current && adminAccountSnapshot() === accountAtStart) {
          pendingRefreshRef.current = false; void refreshRef.current();
        }
      }
  }, [responseService, playPendingReports]);
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
      queueConfirmedRef.current = false;
      audioActionRef.current += 1;
      sirenManager.stopSiren();
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [checkIncomingIncidents]);

  const handleSilenceSiren = () => {
    mutedKeysRef.current = new Set(queueRef.current.map(attentionKey));
    pendingSoundKeysRef.current.clear(); activeSoundKeysRef.current.clear();
    setHasPendingSound(false);
    setAlertsMuted(queueRef.current.length > 0);
    audioActionRef.current += 1;
    sirenManager.stopSiren();
  };

  const handleAcknowledgeAlert = async () => {
    if (!newIncidentAlert || acknowledging || mainMonitoring) return;
    if (newIncidentAlert.pendingNearbyReview) {
      setNearbyReview({ incidentId: newIncidentAlert.incidentId, identity: `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}` });
      setDialogOpen(false); return;
    }
    const item = newIncidentAlert, account = adminAccountSnapshot();
    // Cancel a gesture's pending audio unlock immediately, before the network
    // acknowledgement settles. The visual item remains until server success.
    audioActionRef.current++; sirenManager.stopSiren();
    pendingSoundKeysRef.current.delete(attentionKey(item));
    setHasPendingSound(pendingSoundKeysRef.current.size > 0);
    activeSoundKeysRef.current.clear();
    queueRevisionRef.current++;
    setAckError('');
    setAcknowledging(true);
    try {
      await acknowledgeIncidentAttention(item, responseService);
      if (!isMountedRef.current || adminAccountSnapshot() !== account) return;
      queueRevisionRef.current++;
      queueRef.current = queueRef.current.filter(row => attentionKey(row) !== attentionKey(item));
      setQueue(queueRef.current);
      setAlertsMuted(queueRef.current.length > 0 && queueRef.current.every(row => mutedKeysRef.current.has(attentionKey(row))));
      if (!queueRef.current.length) { audioActionRef.current++; sirenManager.stopSiren(); setDialogOpen(false); }
      void checkIncomingIncidents();
    } catch {
      if (isMountedRef.current && adminAccountSnapshot() === account) {
        setAckError('Acknowledgement not confirmed. Retry this report; response status is unchanged.');
        void checkIncomingIncidents();
      }
    } finally { if (isMountedRef.current && adminAccountSnapshot() === account) setAcknowledging(false); }
  };

  const activateSound = useCallback(async () => {
    const accountAtStart = adminAccountSnapshot();
    if (!accountAtStart || !isMountedRef.current || enablingSoundRef.current) return;
    const action = ++audioActionRef.current;
    const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
    enablingSoundRef.current = true;
    setEnablingSound(true);
    const ready = await sirenManager.enableAudio();
    enablingSoundRef.current = false;
    if (!isMountedRef.current || adminAccountSnapshot() !== accountAtStart
      || localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) return;
    setEnablingSound(false);
    if (ready) saveAdminSoundPreference(accountAtStart);
    if (ready && audioActionRef.current === action && queueConfirmedRef.current) {
      playPendingReports();
      // A normal gesture cannot replay baseline or already sounded work.
    }
  }, [playPendingReports]);

  useEffect(() => {
    const account = adminAccountSnapshot();
    if (!account) return;

    // The browser still owns autoplay permission. A normal trusted interaction
    // arms first-time admins too; no dedicated Enable/Resume button is needed.
    const armIfActivated = () => {
      if (document.visibilityState !== 'visible' || !navigator.userActivation?.hasBeenActive
        || !isMountedRef.current || adminAccountSnapshot() !== account
        || sirenManager.getState().audioReady) return;
      void activateSound();
    };
    const restoreOnInteraction = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible'
        || !isMountedRef.current || adminAccountSnapshot() !== account
        || sirenManager.getState().audioReady) return;
      if (event.target instanceof Element && event.target.closest('[data-siren-control]')) return;
      if (event instanceof KeyboardEvent
        && (event.repeat || event.ctrlKey || event.metaKey || event.altKey
          || event.key === 'Escape' || event.key === 'Shift' || event.key === 'Control'
          || event.key === 'Alt' || event.key === 'Meta')) return;
      void activateSound();
    };
    document.addEventListener('click', restoreOnInteraction, true);
    document.addEventListener('keydown', restoreOnInteraction, true);
    document.addEventListener('visibilitychange', armIfActivated);
    armIfActivated();
    return () => {
      document.removeEventListener('click', restoreOnInteraction, true);
      document.removeEventListener('keydown', restoreOnInteraction, true);
      document.removeEventListener('visibilitychange', armIfActivated);
    };
  }, [activateSound]);

  const handleToggleAlertSound = () => {
    if (!alertsMuted) { handleSilenceSiren(); return; }
    if (queueError) return;
    mutedKeysRef.current.clear();
    // Explicit Unmute is deliberate operator intent, unlike a refresh/gesture.
    pendingSoundKeysRef.current = new Set(queueRef.current.map(attentionKey));
    setHasPendingSound(pendingSoundKeysRef.current.size > 0);
    setAlertsMuted(false);
    void activateSound();
  };
  useModalIsolation(dialogOpen && Boolean(newIncidentAlert), panelRef, () => {
    // Main monitoring is server-owned: neither Escape nor a local dismissal
    // may substitute for an assigned department's acknowledgement.
    if (mainMonitoring) return;
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
      {/* Keep queue access and active-alarm muting, without idle sound controls. */}
      <div data-admin-monitor className="w-full min-w-0 sm:w-[22rem] sm:shrink-0">
      <div className="flex h-11 items-center gap-2 sm:h-14">
        <button type="button" onClick={() => { if (incomingCount) setDialogOpen(true); void checkIncomingIncidents(); }}
          className="h-11 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground">
          Outstanding alerts: {incomingCount}{hasMore ? '+' : ''}
        </button>
        {isSirenPlaying && (
          <button
            type="button"
            data-siren-control
            onClick={handleSilenceSiren}
            className="motion-press flex h-11 items-center justify-center gap-2 px-3 py-1.5 rounded-xl bg-red-600 text-white font-bold text-xs hover:bg-red-700 shadow-sm border border-red-400"
            title="Siren is wailing! Click to mute audio"
          >
            <VolumeX className="w-4 h-4" />
            <span>MUTE SIREN</span>
          </button>
        )}
      </div>
      <span role="status" className="mt-1 block min-h-8 text-xs leading-4 text-muted-foreground">
        {queueError || (connection === 'live' ? 'Live connection · queue checked every 20s' : connection === 'offline' ? 'Offline · alerts cannot be confirmed' : 'Reconnecting · report polling continues')}
      </span>
      </div>

      {/* Emergency Report Audio/Visual Strobe Banner / Modal */}
      {dialogOpen && newIncidentAlert && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          data-history-modal
          tabIndex={-1}
          className="motion-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
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
                    {mainMonitoring ? 'Awaiting an assigned department admin’s acknowledgement' : 'Current work awaiting your acknowledgement'}
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
              {hasMore && <p className="text-xs text-muted-foreground">{mainMonitoring ? 'More reports remain in the server queue. Each clears here when an assigned department admin acknowledges it.' : 'More reports remain in the server queue. Acknowledge reviewed items to load the next ones; none are cleared together.'}</p>}
              {(queueError || ackError) && <p role="alert" className="rounded-lg bg-warning p-3 text-sm text-warning-foreground">{queueError || ackError}</p>}
              {!sirenState.audioReady && !alertsMuted && hasPendingSound && (
                <p role="status" className="rounded-lg bg-warning p-3 text-sm text-warning-foreground">
                  {sirenState.unavailable ? 'Browser sound could not start. Check site sound settings and device volume; visual alerts remain active.' : 'Browser sound is waiting for a click or keypress on this dashboard. No separate sound button is needed.'}
                </p>
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
                      const href = reportContactHref(phone);
                      return (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <ReportContactNumber phone={phone} />
                          {href && <a
                            href={href}
                            className="inline-flex min-h-11 items-center gap-1 rounded border border-border bg-card px-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                          >
                            <Phone className="w-2.5 h-2.5" />
                            <span>Call Contact</span>
                          </a>}
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
                  data-siren-control
                  onClick={handleToggleAlertSound}
                  aria-pressed={alertsMuted}
                  disabled={alertsMuted && (enablingSound || Boolean(queueError))}
                  className={`min-h-11 flex-1 py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                    !alertsMuted
                      ? "bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-600/30"
                      : "bg-muted text-muted-foreground"
                  } disabled:opacity-60`}
                >
                  {alertsMuted ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  <span>{alertsMuted ? 'Unmute alert' : 'Mute alert'}</span>
                </button>

                {!mainMonitoring && <button
                  type="button"
                  data-siren-control
                  disabled={acknowledging || Boolean(queueError)}
                  onClick={() => { void handleAcknowledgeAlert(); }}
                  className="flex-1 rounded-xl bg-destructive px-4 py-3 text-xs font-semibold text-destructive-foreground flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{acknowledging ? 'Saving acknowledgement…' : newIncidentAlert.pendingNearbyReview ? 'Review pending nearby report' : 'Acknowledge this report'}</span>
                </button>}
              </div>
              <p role="status" className="text-xs text-muted-foreground">{alertsMuted ? 'Alert sound is muted. The report remains outstanding; new reports can still sound.' : enablingSound ? 'Enabling alert sound…' : isSirenPlaying ? 'Alert sound is playing.' : hasPendingSound ? 'Alert sound is not playing. Check your browser’s sound settings if needed.' : 'No new report is waiting to sound. Outstanding reports remain in the queue.'}</p>
              <p className="text-xs text-muted-foreground">{mainMonitoring ? 'Only an assigned Fire, Medical, Police or DRRMO Admin’s acknowledgement clears this Main Admin alert. It does not resolve the incident.' : 'Acknowledgement does not dispatch units or resolve the incident. An assigned department admin’s acknowledgement also clears the Main Admin alert; other departments keep theirs.'}</p>
              {mainMonitoring ? <button type="button" onClick={() => { void checkIncomingIncidents(); }} className="min-h-11 w-full rounded-lg border border-border px-3 text-sm">Check department acknowledgement</button> : <button type="button" data-siren-control onClick={() => { handleSilenceSiren(); setDialogOpen(false); }} className="min-h-11 w-full rounded-lg border border-border px-3 text-sm">Review later — keep in queue</button>}
            </div>
          </div>
        </div>,
        document.body
      )}
      <NearbyReportDialog incidentId={typeof window !== 'undefined' && nearbyReview?.identity === `${adminAccountSnapshot()}:${localStorage.getItem('emergency-logout-epoch')}` ? nearbyReview.incidentId : null}
        onClose={() => { setNearbyReview(null); void checkIncomingIncidents(); }} />
    </>
  );
}
