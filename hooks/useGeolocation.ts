import { useState, useEffect } from 'react';
import { Geolocation, Position } from '@capacitor/geolocation';

interface GeolocationState {
    latitude: number | null;
    longitude: number | null;
    error: string | null;
    loading: boolean;
}

export function useGeolocation() {
    const [state, setState] = useState<GeolocationState>({
        latitude: null,
        longitude: null,
        error: null,
        loading: true,
    });

    const fetchLocation = async () => {
        try {
            // Request permissions first (important for native mobile)
            const permissions = await Geolocation.checkPermissions();
            if (permissions.location !== 'granted') {
                const request = await Geolocation.requestPermissions();
                if (request.location !== 'granted') {
                    setState({
                        latitude: null,
                        longitude: null,
                        error: 'Location permission denied',
                        loading: false,
                    });
                    return;
                }
            }

            const position = await Geolocation.getCurrentPosition();
            setState({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                error: null,
                loading: false,
            });
        } catch (error: any) {
            setState({
                latitude: null,
                longitude: null,
                error: error.message || 'Error fetching location',
                loading: false,
            });
        }
    };

    useEffect(() => {
        fetchLocation();
    }, []);

    const refreshLocation = () => {
        setState((prev) => ({ ...prev, loading: true }));
        fetchLocation();
    };

    return { ...state, refreshLocation };
}
