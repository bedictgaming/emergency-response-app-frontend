import { useCallback, useEffect, useRef, useState } from 'react';

// A form-specific snapshot, not the dashboard's potentially older last fix.
const FIX_LIFETIME_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 20_000;

export interface ReportGpsFix {
    latitude: number;
    longitude: number;
    accuracy: number;
    timestamp: number;
}

export function isReportGpsFresh(fix: ReportGpsFix | null): boolean {
    return fix !== null && Date.now() - fix.timestamp < FIX_LIFETIME_MS
        && fix.timestamp <= Date.now() + 5000;
}

export function useReportGps() {
    const [fix, setFix] = useState<ReportGpsFix | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const generation = useRef(0);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const refresh = useCallback(() => {
        const request = ++generation.current;
        if (timer.current) clearTimeout(timer.current);
        setFix(null);
        setError(null);
        setLoading(true);
        let settled = false;
        const fail = (message: string) => {
            if (request !== generation.current || settled) return;
            settled = true;
            if (timer.current) clearTimeout(timer.current);
            setFix(null);
            setError(message);
            setLoading(false);
        };
        if (!navigator.geolocation) {
            fail('GPS is unavailable in this browser. Use a device with Location Services, or call 911.');
            return;
        }
        const startedAt = Date.now();
        timer.current = setTimeout(() => fail('GPS timed out. Turn on Location Services, move near a window, then retry.'), REQUEST_TIMEOUT_MS);
        try {
            navigator.geolocation.getCurrentPosition(position => {
                if (request !== generation.current || settled) return;
                const { latitude, longitude, accuracy } = position.coords;
                const next = { latitude, longitude, accuracy, timestamp: position.timestamp };
                if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
                    || !Number.isFinite(longitude) || Math.abs(longitude) > 180
                    || !Number.isFinite(accuracy) || accuracy < 0
                    || !Number.isFinite(position.timestamp) || position.timestamp < startedAt - 5000
                    || !isReportGpsFresh(next)) {
                    fail('The device returned an invalid or old GPS fix. Refresh GPS and try again.');
                    return;
                }
                settled = true;
                if (timer.current) clearTimeout(timer.current);
                setFix(next);
                setLoading(false);
                timer.current = setTimeout(() => {
                    if (request !== generation.current) return;
                    setFix(null);
                    setError('This GPS fix has expired. Refresh GPS and confirm your location again.');
                }, Math.max(0, position.timestamp + FIX_LIFETIME_MS - Date.now()));
            }, failure => {
                fail(failure.code === 1
                    ? 'Location permission is blocked. Allow location in your browser site settings, then retry.'
                    : failure.code === 3 ? 'GPS timed out. Turn on Location Services, move near a window, then retry.'
                    : 'Your device could not determine its location. Turn on Location Services and retry.');
            }, { enableHighAccuracy: true, maximumAge: 0, timeout: REQUEST_TIMEOUT_MS });
        } catch {
            fail('GPS could not start. Check your browser location settings, then retry.');
        }
    }, []);

    useEffect(() => {
        refresh();
        const requestGeneration = generation;
        return () => {
            ++requestGeneration.current;
            if (timer.current) clearTimeout(timer.current);
        };
    }, [refresh]);

    return { fix, loading, error, refresh };
}
