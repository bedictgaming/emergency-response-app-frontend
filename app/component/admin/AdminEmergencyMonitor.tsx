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
import { getIncidents, type Incident, type ResponseService } from "@/lib/services/incidentService";
import { sirenManager } from "@/lib/services/sirenService";
import { useEmergencyEvents } from "@/app/hooks/useEmergencyEvents";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { readAdminSoundPreference, saveAdminSoundPreference } from "@/lib/adminSoundPreference";

export default function AdminEmergencyMonitor({ responseService }: { responseService?: ResponseService }) {
  const [sirenState, setSirenState] = useState(sirenManager.getState());
  const [enablingSound, setEnablingSound] = useState(false);
  const [soundPreferenceSaved, setSoundPreferenceSaved] = useState(false);
  const isSirenPlaying = sirenState.playing;
  const [newIncidentAlert, setNewIncidentAlert] = useState<Incident | null>(null);
  const [incomingCount, setIncomingCount] = useState(0);

  // Keep track of known incident IDs so we only alert on genuinely new reports
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitializedRef = useRef(false);
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
      if (requestInFlightRef.current) return;
      requestInFlightRef.current = true;
      const accountAtStart = adminAccountSnapshot();
      try {
        // The stream is the primary notification path. A small newest-first
        // recovery window avoids competing with the dashboard's paginated
        // query for remote database connections.
        const incidents = await getIncidents({
          limit: 10,
          includeTotal: false,
          ...(responseService && { responseService }),
        });
        if (!isMountedRef.current || adminAccountSnapshot() !== accountAtStart) return;

        if (!isInitializedRef.current) {
          // Initial population
          incidents.forEach((inc) => knownIdsRef.current.add(inc.incidentId));
          isInitializedRef.current = true;
          return;
        }

        // Find newly arrived reports
        const newReports = incidents.filter(
          (inc) => !knownIdsRef.current.has(inc.incidentId)
        );

        if (newReports.length > 0) {
          // Register new IDs
          newReports.forEach((inc) => knownIdsRef.current.add(inc.incidentId));

          // Pick the most recent new report to display
          const latest = newReports[0];
          setNewIncidentAlert(latest);
          setIncomingCount((prev) => prev + newReports.length);

          // Visual alerts always appear; sound starts only after explicit audio activation.
          sirenManager.startSiren();
        }
      } catch (err) {
        if (isMountedRef.current && adminAccountSnapshot() === accountAtStart) {
          console.warn("Incident monitor poll error:", err);
        }
      } finally {
        requestInFlightRef.current = false;
      }
  }, [responseService]);

  useEmergencyEvents(checkIncomingIncidents, true);

  useEffect(() => {
    isMountedRef.current = true;

    // Run initial check immediately
    void checkIncomingIncidents();

    // Live events handle normal updates. A slow, visibility-aware refresh is a
    // recovery path for disconnected or suspended browser tabs.
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void checkIncomingIncidents();
    };
    const interval = window.setInterval(refreshWhenVisible, 60_000);
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
    audioActionRef.current += 1;
    sirenManager.stopSiren();
  };

  const handleAcknowledgeAlert = () => {
    audioActionRef.current += 1;
    sirenManager.stopSiren();
    setNewIncidentAlert(null);
    setIncomingCount(0);
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
      if (mode === 'alert') sirenManager.startSiren();
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

  const handleEnableSound = (playAlert = false) => activateSound(playAlert ? 'alert' : 'test');

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
              onClick={() => { void handleEnableSound(Boolean(newIncidentAlert)); }}
              className="min-h-11 rounded-lg border border-border bg-card px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-60"
              title={sirenState.audioReady ? "Test loud emergency siren" : soundPreferenceSaved ? "Your preference is saved. Click or press a key on this dashboard to arm sound, or use Resume sound to test it." : "Enable and test emergency alert sound; remember this preference in this browser"}
            >
              {enablingSound ? 'Enabling sound…' : sirenState.audioReady ? 'Test' : soundPreferenceSaved ? 'Resume sound' : 'Enable sound'}
            </button>
          </div>
        )}
      </div>

      {/* Emergency Report Audio/Visual Strobe Banner / Modal */}
      {newIncidentAlert && typeof document !== "undefined" && createPortal(
        <div
          className="motion-dialog-backdrop fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          data-siren-control
          aria-modal="true"
          aria-labelledby="emergency-alert-title"
        >
          <div className="motion-dialog-panel relative my-auto flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border-2 border-red-500 bg-[#0F172A] text-white shadow-2xl shadow-red-600/50">
            {/* Flashing Siren Header */}
            <div className="flex shrink-0 items-center justify-between bg-gradient-to-r from-red-600 via-rose-600 to-red-600 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <BellRing className="w-6 h-6 text-white" />
                <div>
                  <h3 id="emergency-alert-title" className="text-base font-black tracking-wide text-white uppercase">
                    🚨 Emergency Report Received!
                  </h3>
                  <p className="text-xs text-red-100 font-medium">
                    Immediate dispatcher attention required
                  </p>
                </div>
              </div>
              {incomingCount > 1 && (
                <span className="bg-white text-red-700 text-xs font-black px-2 py-0.5 rounded-full shadow">
                  +{incomingCount} Reports
                </span>
              )}
            </div>

            {/* Incident Details */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
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
                  <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700">
                    {getCategoryIcon(newIncidentAlert.type?.typeName)}
                  </div>
                  <div>
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                      Incident Type
                    </span>
                    <h4 className="text-lg font-bold text-white">
                      {newIncidentAlert.type?.typeName || "General Emergency"}
                    </h4>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40">
                  {newIncidentAlert.status || "ACTIVE"}
                </span>
              </div>

              {/* Title & Description */}
              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800">
                <p className="text-sm font-semibold text-white mb-1">
                  {newIncidentAlert.title}
                </p>
                {(() => {
                  const cleanDesc = (newIncidentAlert.description || '')
                    .replace(/\[Contact:\s*([^\]]+)\]/, '')
                    .trim();
                  if (!cleanDesc) return null;
                  return (
                    <div className="mt-2 pt-2 border-t border-slate-800/80">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-amber-400/90 block mb-0.5">
                        Report Description:
                      </span>
                      <p className="text-xs text-slate-200 leading-relaxed font-medium whitespace-pre-wrap">
                        {cleanDesc}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Location & Reporter Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">Location</span>
                    <span className="font-semibold text-white break-words">
                      {newIncidentAlert.location?.address ||
                        newIncidentAlert.location?.locationName ||
                        "Cordova, Cebu"}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <User className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-slate-400 block text-[10px] font-medium">Reporter</span>
                    <span className="font-semibold text-white">
                      {newIncidentAlert.reporter?.name || "Citizen Reporter"}
                    </span>
                    {(() => {
                      const phone =
                        newIncidentAlert.reporter?.phone ||
                        newIncidentAlert.description?.match(/\[Contact:\s*([^\]]+)\]/)?.[1];
                      if (!phone) return null;
                      return (
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-[11px] text-slate-300 font-mono">
                            📞 {phone}
                          </span>
                          <a
                            href={`tel:${phone.replace(/[^0-9+]/g, "")}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition-colors"
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
                      : "bg-slate-800 hover:bg-slate-700 text-slate-300"
                  }`}
                >
                  <VolumeX className="w-4 h-4" />
                  <span>{isSirenPlaying ? "Silence Loud Siren" : "Sound not playing"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAcknowledgeAlert}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-xs bg-red-600 hover:bg-red-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-red-600/40 transition-all"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>Acknowledge & Respond</span>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
