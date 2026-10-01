'use client';
/* eslint-disable @next/next/no-img-element -- private evidence is delivered by a short-lived authorized URL */

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, ImageIcon, MapPin, Maximize2, RotateCcw, ShieldCheck, X } from 'lucide-react';
import apiClient from '@/lib/apiClient';

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

// A signed storage URL expires after 60 seconds. Opening the protected API
// endpoint performs authorization again and issues a fresh redirect on every
// click, even when the already-rendered thumbnail has been visible for hours.
function evidenceOpenUrl(sourceUrl: string, resolvedUrl: string) {
  return isProtectedEvidenceUrl(sourceUrl) ? sourceUrl : resolvedUrl;
}

// Share only in-flight authorization checks. Never cache a signed URL across
// sessions: access can be revoked and the URL expires shortly after issuance.
const pendingEvidenceAccess = new Map<string, Promise<string>>();

function resolveEvidenceUrl(sourceUrl: string): Promise<string> {
  const user = localStorage.getItem('user') ?? '';
  const generation = localStorage.getItem('emergency-session-generation') ?? '';
  const key = `${user}:${generation}:${sourceUrl}`;
  const existing = pendingEvidenceAccess.get(key);
  if (existing) return existing;

  const request = apiClient.get<EvidenceAccessResponse>(accessUrlFor(sourceUrl))
    .then(response => response.data.data.url);
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

export function CompactEvidencePhoto({ sourceUrl, alt }: { sourceUrl: string; alt: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
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
    <div ref={container} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
      {resolvedUrl ? (
        <a
          href={evidenceOpenUrl(sourceUrl, resolvedUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="relative group block h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-slate-300 bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600"
        >
          <img src={resolvedUrl} alt={alt} onError={reportImageFailure} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <ExternalLink size={14} className="text-white" />
          </div>
        </a>
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
          <a href={evidenceOpenUrl(sourceUrl, resolvedUrl)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-slate-800 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:text-slate-200">
            View photo &rarr;
          </a>
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
          <div className="h-24 w-full max-w-sm rounded-xl border border-slate-200 bg-slate-100 animate-pulse flex items-center justify-center text-xs text-slate-500">
            Loading secure evidence…
          </div>
        )}
      </div>

      {open && resolvedUrl && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={() => setOpen(false)}>
          <div className="relative max-w-4xl w-full bg-slate-950 rounded-2xl overflow-hidden shadow-2xl border border-slate-800 text-white" onClick={(event) => event.stopPropagation()}>
            <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">{title}</h4>
                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5"><MapPin className="w-3 h-3 text-rose-400" />{location} • {timestamp}</p>
              </div>
              <div className="flex items-center gap-2">
                <a href={evidenceOpenUrl(sourceUrl, resolvedUrl)} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold">Open Full ↗</a>
                <button type="button" onClick={() => setOpen(false)} className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800" aria-label="Close evidence viewer"><X className="w-5 h-5" /></button>
              </div>
            </div>
            <div className="p-4 bg-black flex items-center justify-center max-h-[75vh] overflow-hidden">
              <img src={isProtectedEvidenceUrl(sourceUrl) ? sourceUrl : resolvedUrl} alt="Emergency evidence high resolution" onError={reportImageFailure} className="max-h-[70vh] w-auto max-w-full object-contain rounded-lg" />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
