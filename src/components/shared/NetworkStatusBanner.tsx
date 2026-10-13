'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (online) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-amber-400 px-4 py-2 text-center text-sm font-semibold text-amber-950" role="status">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      You are offline. Reports are not submitted until a connection is restored and the server confirms receipt.
    </div>
  );
}
