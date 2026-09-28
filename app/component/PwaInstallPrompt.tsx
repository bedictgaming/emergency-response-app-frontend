'use client';

import { useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

function isStandalone() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || iosNavigator.standalone === true;
}

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isStandalone() || sessionStorage.getItem('pwa-install-dismissed') === 'true') return;
    setDismissed(false);

    const onInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallEvent(null);
      setShowIosHelp(false);
      setDismissed(true);
    };
    window.addEventListener('beforeinstallprompt', onInstallAvailable);
    window.addEventListener('appinstalled', onInstalled);
    document.documentElement.dataset.pwaInstallReady = 'true';
    setShowIosHelp(/iphone|ipad|ipod/i.test(navigator.userAgent));

    return () => {
      window.removeEventListener('beforeinstallprompt', onInstallAvailable);
      window.removeEventListener('appinstalled', onInstalled);
      delete document.documentElement.dataset.pwaInstallReady;
    };
  }, []);

  const dismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', 'true');
    setDismissed(true);
  };

  const install = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === 'accepted') setDismissed(true);
    setInstallEvent(null);
  };

  if (dismissed || (!installEvent && !showIosHelp)) return null;

  return (
    <aside
      className="fixed bottom-20 left-4 right-4 z-50 mx-auto flex max-w-lg items-start gap-3 rounded-2xl border border-rose-200 bg-white p-4 shadow-xl"
      aria-label="Install Emergency Response App"
    >
      <div className="rounded-xl bg-rose-100 p-2 text-rose-700" aria-hidden="true">
        {showIosHelp && !installEvent ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">Install Emergency Response</p>
        <p className="mt-0.5 text-xs text-slate-600">
          {showIosHelp && !installEvent
            ? 'In Safari, open Share and choose Add to Home Screen.'
            : 'Add the app to this device for faster access and an app-like display.'}
        </p>
        {installEvent && (
          <button
            type="button"
            onClick={install}
            className="mt-2 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
          >
            Install app
          </button>
        )}
      </div>
      <button type="button" onClick={dismiss} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Dismiss install prompt">
        <X className="h-4 w-4" />
      </button>
    </aside>
  );
}
