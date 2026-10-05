'use client';
import { useEffect, useRef } from 'react';
import { subscribeEmergencyStream, type EmergencyConnectionState } from '@/lib/emergencyEventStream';

export function useEmergencyEvents(onEvent: () => void, enabled = true, onState?: (state: EmergencyConnectionState) => void) {
  const callback = useRef(onEvent), state = useRef(onState);
  useEffect(() => { callback.current = onEvent; state.current = onState; }, [onEvent, onState]);
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return;
    return subscribeEmergencyStream({ refresh: () => callback.current(), state: value => state.current?.(value) });
  }, [enabled]);
}
