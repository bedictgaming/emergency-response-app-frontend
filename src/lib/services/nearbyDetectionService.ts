import apiClient from '@/lib/apiClient';
import type { ResponseService, IncidentStatus } from './incidentService';
import { isWithinCordovaMapBounds } from '@/lib/cordovaBoundary';

export type NearbyDetectionInput = { kind: 'citizen'; latitude: number; longitude: number; services: ResponseService[] }
  | { kind: 'department'; incidentId: string };
export interface NearbyMapPin { incidentId: string; latitude: number; longitude: number; status: IncidentStatus; services: ResponseService[]; distanceMeters: number; flaggedForReview?: boolean }
export interface NearbyDetectionResult { radiusMeters: 100; active: boolean; nearby: boolean | null; complete: boolean; items?: NearbyMapPin[]; reviewIncidentIds?: string[]; waitingIncidentIds?: string[]; center?: { latitude: number; longitude: number } }
export async function detectNearby(input: NearbyDetectionInput, signal: AbortSignal): Promise<NearbyDetectionResult> {
  const response = await apiClient.post('/incidents/v1/nearby-detection', input, { signal });
  const result = response.data?.data as NearbyDetectionResult | undefined;
  if (!result || result.radiusMeters !== 100 || typeof result.active !== 'boolean' || typeof result.complete !== 'boolean'
    || ![true, false, null].includes(result.nearby)) throw new Error('Nearby result unavailable');
  if (input.kind === 'citizen') return { radiusMeters: 100, active: result.active, nearby: result.nearby, complete: result.complete };
  if (!result.center || !isWithinCordovaMapBounds(result.center.latitude, result.center.longitude)
    || !Array.isArray(result.items) || result.items.length > 50 || result.items.some(pin =>
      typeof pin.incidentId !== 'string' || !/^[a-f\d-]{36}$/i.test(pin.incidentId)
      || !isWithinCordovaMapBounds(pin.latitude, pin.longitude) || !Number.isFinite(pin.distanceMeters)
      || pin.distanceMeters < 0 || pin.distanceMeters > 100 || !Array.isArray(pin.services)
      || (pin.flaggedForReview !== undefined && typeof pin.flaggedForReview !== 'boolean')
      || !['OPEN', 'ACTIVE', 'RESPONDING'].includes(pin.status))) throw new Error('Nearby result unavailable');
  if (result.reviewIncidentIds !== undefined && (!Array.isArray(result.reviewIncidentIds) || result.reviewIncidentIds.length > 200
    || result.reviewIncidentIds.some(id => typeof id !== 'string' || !result.items!.some(pin => pin.incidentId === id)))) throw new Error('Nearby review result unavailable');
  if (result.waitingIncidentIds !== undefined && (!Array.isArray(result.waitingIncidentIds) || result.waitingIncidentIds.length > 200
    || result.waitingIncidentIds.some(id => typeof id !== 'string' || !result.reviewIncidentIds?.includes(id)))) throw new Error('Nearby waiting result unavailable');
  return result;
}
