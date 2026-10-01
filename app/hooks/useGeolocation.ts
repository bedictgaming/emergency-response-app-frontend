import { useState, useEffect, useCallback, useRef } from 'react';

interface GeolocationState {
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
    error: string | null;
    loading: boolean;
}

export function useGeolocation() {
    const [state, setState] = useState<GeolocationState>({
        latitude: null,
        longitude: null,
        accuracy: null,
        error: null,
        loading: true,
    });
    const watchIdRef = useRef<number | null>(null);

    const startLocationWatch = useCallback(() => {
        if (watchIdRef.current !== null && navigator.geolocation) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setState((prev) => ({ ...prev, loading: true, error: null }));

        if (!navigator.geolocation) {
            setState({
                latitude: null,
                longitude: null,
                accuracy: null,
                error: 'Geolocation is not supported by your browser',
                loading: false,
            });
            return;
        }

        watchIdRef.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
                    || !Number.isFinite(accuracy) || accuracy < 0) {
                    setState((prev) => ({ ...prev, loading: false, error: 'The device returned an invalid location. Retry GPS, or call 911 for an emergency.' }));
                    return;
                }
                setState({
                    latitude,
                    longitude,
                    accuracy,
                    error: null,
                    loading: false,
                });
            },
            (err) => {
                let message = 'Error fetching location';
                if (err.code === err.PERMISSION_DENIED) {
                    message = 'Location permission is blocked. Allow it in your browser site settings, then retry.';
                } else if (err.code === err.POSITION_UNAVAILABLE) {
                    message = 'Your device could not determine its location. Turn on Location Services and retry.';
                } else if (err.code === err.TIMEOUT) {
                    message = 'Location request timed out. Move near a window and retry GPS.';
                }
                setState((prev) => ({
                    latitude: err.code === err.PERMISSION_DENIED ? null : prev.latitude,
                    longitude: err.code === err.PERMISSION_DENIED ? null : prev.longitude,
                    accuracy: err.code === err.PERMISSION_DENIED ? null : prev.accuracy,
                    error: message,
                    loading: false,
                }));
            },
            {
                enableHighAccuracy: true,
                timeout: 20000,
                maximumAge: 0,
            }
        );
    }, []);

    useEffect(() => {
        startLocationWatch();
        return () => {
            if (watchIdRef.current !== null && navigator.geolocation) {
                navigator.geolocation.clearWatch(watchIdRef.current);
                watchIdRef.current = null;
            }
        };
    }, [startLocationWatch]);

    return { ...state, refreshLocation: startLocationWatch };
}
