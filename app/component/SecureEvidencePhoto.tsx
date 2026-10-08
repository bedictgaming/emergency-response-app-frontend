'use client';

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

/* eslint-disable @next/next/no-img-element -- private evidence is delivered by a short-lived authorized URL */

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, Maximize2, RotateCcw, ShieldCheck } from 'lucide-react';
import apiClient from '@/lib/apiClient';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

type EvidenceAccessResponse = {
  data: {
    url: string;
    expiresInSeconds: number;
  };
};

function accessUrlFor(sourceUrl: string) {
  return sourceUrl.replace(/\/content(?:\?.*)?$/, '/access-url');
}

function isProtectedEvidenceUrl(sourceUrl: string) {
  return /\/api\/attachments\/v1\/[^/]+\/content(?:\?|$)/.test(sourceUrl);
}

// Share only in-flight authorization checks. Never cache a signed URL across
// sessions: access can be revoked and the URL expires shortly after issuance.
const pendingEvidenceAccess = new Map<string, Promise<string>>();

function evidenceAccountSnapshot() {
  const profile = localStorage.getItem('user');
  let user;
  try { user = JSON.parse(profile || 'null'); } catch { /* A damaged profile cache is not an authorization decision. */ }
  return JSON.stringify([user?.id, user?.role, user?.department, user?.isMainAdmin, user ? null : profile, localStorage.getItem('emergency-logout-epoch')]);
}

function resolveEvidenceUrl(sourceUrl: string): Promise<string> {
  const account = evidenceAccountSnapshot();
  const generation = localStorage.getItem('emergency-session-generation') ?? '';
  const key = `${account}:${generation}:${sourceUrl}`;
  const existing = pendingEvidenceAccess.get(key);
  if (existing) return existing;

  const request = apiClient.get<EvidenceAccessResponse>(accessUrlFor(sourceUrl))
    .then(response => {
      // A late response must not render another account's private evidence.
      if (evidenceAccountSnapshot() !== account) {
        throw new Error('Evidence session changed');
      }
      return response.data.data.url;
    });
  pendingEvidenceAccess.set(key, request);
  void request.then(
    () => pendingEvidenceAccess.delete(key),
    () => pendingEvidenceAccess.delete(key),
  );
  return request;
}

function useAuthorizedEvidenceUrl(sourceUrl: string, enabled = true) {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setResolvedUrl(null);
    setError(false);
    if (!enabled) return () => { active = false; };

    if (!isProtectedEvidenceUrl(sourceUrl)) {
      setResolvedUrl(sourceUrl);
      return () => { active = false; };
    }

    resolveEvidenceUrl(sourceUrl)
      .then((url) => {
        if (active) setResolvedUrl(url);
      })
      .catch(() => {
        if (active) setError(true);
      });

    return () => { active = false; };
  }, [sourceUrl, enabled, attempt]);

  return {
    resolvedUrl,
    error,
    retry: () => setAttempt((value) => value + 1),
    reportImageFailure: () => {
      setResolvedUrl(null);
      setError(true);
    },
  };
}

const VIEWER_HISTORY_KEY = 'emergencyEvidenceViewer';

// Mounted only while open: each opening resolves a fresh authorized URL. No
// photo URL, attachment ID or citizen data is added to browser history.
function EvidencePhotoViewer({ sourceUrl, alt, title = 'Report photo', description = 'Close the photo to return to your report.', onClose }: {
  sourceUrl: string;
  alt: string;
  title?: string;
  description?: string;
  onClose: () => void;
}) {
  const { resolvedUrl, error, retry, reportImageFailure } = useAuthorizedEvidenceUrl(sourceUrl);
  const onCloseRef = useRef(onClose);
  const closeViewerRef = useRef<() => void>(() => onCloseRef.current());

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const marker = crypto.randomUUID();
    const pageUrl = window.location.href;
    let ownsHistory = false;
    let returning = false;
    // Deferring history setup also avoids an extra entry during React's
    // development-only setup/cleanup probe.
    const historyFrame = requestAnimationFrame(() => {
      try {
        window.history.pushState({ ...window.history.state, [VIEWER_HISTORY_KEY]: marker }, '', pageUrl);
        ownsHistory = true;
      } catch {
        // Restricted history must not prevent the visible Close control working.
      }
    });

    closeViewerRef.current = () => {
      if (returning) return;
      if (ownsHistory && window.history.state?.[VIEWER_HISTORY_KEY] === marker && window.location.href === pageUrl) {
        returning = true;
        window.history.back();
      } else {
        onCloseRef.current();
      }
    };
    const closeOnBack = () => {
      ownsHistory = false;
      onCloseRef.current();
    };
    const closeOnAccountChange = (event: StorageEvent) => {
      if (event.key === null || event.key === 'user' || event.key === 'emergency-logout-epoch') closeViewerRef.current();
    };
    window.addEventListener('popstate', closeOnBack);
    window.addEventListener('storage', closeOnAccountChange);
    return () => {
      cancelAnimationFrame(historyFrame);
      window.removeEventListener('popstate', closeOnBack);
      window.removeEventListener('storage', closeOnAccountChange);
      // Consume only our own entry, never back out of a different route.
      if (ownsHistory && !returning && window.history.state?.[VIEWER_HISTORY_KEY] === marker && window.location.href === pageUrl) window.history.back();
    };
  }, []);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) closeViewerRef.current(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-40 items-center justify-center overflow-auto rounded-xl bg-muted">
          {resolvedUrl ? (
            <img src={resolvedUrl} alt={alt} onError={reportImageFailure} className="max-h-[calc(100dvh-15rem)] w-auto max-w-full object-contain" />
          ) : error ? (
            <div role="status" className="p-5 text-center text-sm text-foreground">
              <p>The photo could not be loaded. Your report remains available.</p>
              <button type="button" onClick={retry} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <RotateCcw size={16} aria-hidden="true" /> Retry photo
              </button>
            </div>
          ) : (
            <LoadingPlaceholder label="Loading secure photo…" layout="map" />
          )}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={() => closeViewerRef.current()} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            Close photo
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CompactEvidencePhoto({ sourceUrl, alt }: { sourceUrl: string; alt: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [open, setOpen] = useState(false);
  const { resolvedUrl, error, retry, reportImageFailure } = useAuthorizedEvidenceUrl(sourceUrl, nearViewport);

  useEffect(() => {
    const element = container.current;
    if (!element || nearViewport) return;
    if (!('IntersectionObserver' in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '400px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [nearViewport]);

  return (
    <>
    <div ref={container} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      {resolvedUrl ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="View attached photo"
          aria-haspopup="dialog"
          className="relative group block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
        >
          <img src={resolvedUrl} alt={alt} onError={reportImageFailure} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Maximize2 size={14} className="text-white" />
          </div>
        </button>
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white">
          {error ? <ImageIcon size={18} className="text-red-600" /> : <span className="h-5 w-5 animate-spin rounded-full border-2 border-red-600 border-t-transparent" />}
        </div>
      )}
      <div className="flex flex-col">
        <span className="flex items-center gap-1 text-sm font-semibold text-slate-900 dark:text-white">
          <ImageIcon size={14} className="text-red-600" />
          {error ? 'Photo image unavailable' : 'Photo attached'}
        </span>
        {resolvedUrl ? (
          <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-200">
            View photo &rarr;
          </button>
        ) : error ? (
          <div role="status" className="text-sm text-slate-700 dark:text-slate-200">
            <p>The image could not be loaded. Report details remain available.</p>
            <button type="button" onClick={retry} className="mt-1 inline-flex min-h-11 items-center gap-1 font-medium text-red-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-red-300">
              <RotateCcw size={14} /> Retry photo
            </button>
          </div>
        ) : (
          <span className="mt-1 text-sm text-slate-600 dark:text-slate-300">{nearViewport ? 'Loading secure photo…' : 'Photo available when viewed'}</span>
        )}
      </div>
    </div>
    {open && <EvidencePhotoViewer key={sourceUrl} sourceUrl={sourceUrl} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}

type EvidenceCardProps = {
  sourceUrl: string;
  title: string;
  location: string;
  timestamp: string;
};

export function EvidencePhotoCard({ sourceUrl, title, location, timestamp }: EvidenceCardProps) {
  const { resolvedUrl, error, retry, reportImageFailure } = useAuthorizedEvidenceUrl(sourceUrl);
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="bg-slate-50/70 rounded-2xl p-4 border border-slate-200/70">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>{error ? 'Photo image unavailable' : 'Verified Photo Evidence Attached'}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">Protected Evidence</span>
        </div>

        {resolvedUrl ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="View attached photo"
            aria-haspopup="dialog"
            className="group relative block w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-900 cursor-pointer shadow-xs max-w-sm aspect-video sm:aspect-auto sm:max-h-60"
          >
            <img src={resolvedUrl} alt="Incident Photo Evidence" onError={reportImageFailure} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
            <span className="absolute inset-0 bg-black/30 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200">
              <span className="px-3 py-1.5 rounded-xl bg-black/75 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg border border-white/20">
                <Maximize2 className="w-3.5 h-3.5" /> Inspect Fullscreen
              </span>
            </span>
          </button>
        ) : error ? (
          <div role="status" className="min-h-24 w-full max-w-sm rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            <p>The image could not be loaded. Report details remain available.</p>
            <button type="button" onClick={retry} className="mt-1 inline-flex min-h-11 items-center gap-2 font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
              <RotateCcw size={15} /> Retry photo
            </button>
          </div>
        ) : (
          <LoadingPlaceholder label="Loading secure evidence…" rows={1} className="max-w-sm" />
        )}
      </div>

      {open && <EvidencePhotoViewer key={sourceUrl} sourceUrl={sourceUrl} alt="Emergency evidence high resolution" title={title} description={`${location} • ${timestamp}`} onClose={() => setOpen(false)} />}
    </>
  );
}
