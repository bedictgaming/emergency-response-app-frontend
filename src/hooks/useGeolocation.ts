import { useSyncExternalStore } from 'react';
import { getDeviceLocation, getServerDeviceLocation, refreshDeviceLocation, subscribeDeviceLocation } from '@/lib/deviceLocation';

export function useGeolocation() {
  const state = useSyncExternalStore(subscribeDeviceLocation, getDeviceLocation, getServerDeviceLocation);
  return {
    latitude: state.estimate?.latitude ?? null,
    longitude: state.estimate?.longitude ?? null,
    accuracy: state.estimate?.accuracy ?? null,
    error: state.error,
    loading: state.loading,
    preliminary: state.estimate !== null && state.fix === null,
    refreshLocation: refreshDeviceLocation,
  };
}
