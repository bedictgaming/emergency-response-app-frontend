import type { useNearbyDetection } from '@/hooks/useNearbyDetection';
export function NearbyDetectionStatus({ detection }: { detection: ReturnType<typeof useNearbyDetection> }) {
  const result = detection.result;
  const message = detection.phase === 'checking' ? 'Checking submitted reports within 100 m…'
    : !result ? 'Nearby detection unavailable. Do not assume there are no nearby reports.'
      : !result.active ? 'This report is no longer active; nearby detection is paused.'
        : result.nearby ? 'Similar submitted report detected within 100 m.'
          : result.complete ? 'No similar active submitted reports detected within 100 m.'
            : 'Nearby results are incomplete. Some reports could not be checked.';
  return <div role="status" className="my-2 text-sm leading-5 text-slate-700 dark:text-slate-200">
    <p>{message}</p>
    <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{detection.connection === 'live' ? 'Live updates connected' : 'Live connection unavailable · automatic recovery checks continue'}{result && !result.complete && result.nearby ? ' · showing a limited set of matches' : ''}</p>
  </div>;
}
