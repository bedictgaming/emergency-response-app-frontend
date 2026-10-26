import apiClient from '@/lib/apiClient';
import type { ResponseService, IncidentStatus } from './incidentService';

export type NearbyReviewStatus = 'PENDING' | 'ACKNOWLEDGED' | 'REJECTED';
export interface NearbyReview {
  responseStarted?: boolean;
  reviewId: string; incidentId: string; service: ResponseService; status: NearbyReviewStatus; version: number;
  reason?: string | null; createdAt: string; reviewedAt?: string | null;
  incident: { title: string; status: IncidentStatus; reportedAt: string };
}
export interface NearbyReviewPage { enabled: boolean; canDecide: boolean; items: NearbyReview[]; hasMore: boolean; requiresResponseStart?: boolean; departmentReviewEnabled?: boolean }
export const nearbyReviewUiEnabled = process.env.NEXT_PUBLIC_NEARBY_REVIEW_ENABLED === 'true';
export async function getNearbyReviews(input: { page?: number; incidentId?: string; status?: NearbyReviewStatus }, signal?: AbortSignal) {
  const response = await apiClient.get<{ data: NearbyReviewPage }>('/incidents/v1/nearby-reviews', { params: input, signal });
  const value = response.data.data;
  if (!value || typeof value.enabled !== 'boolean' || typeof value.canDecide !== 'boolean' || typeof value.hasMore !== 'boolean'
    || (value.requiresResponseStart !== undefined && typeof value.requiresResponseStart !== 'boolean')
    || !Array.isArray(value.items) || value.items.length > 20 || value.items.some(item =>
      !/^[a-f\d-]{36}$/i.test(item.reviewId) || !/^[a-f\d-]{36}$/i.test(item.incidentId)
      || !['FIRE', 'MEDICAL', 'POLICE', 'HAZARD'].includes(item.service)
      || !['PENDING', 'ACKNOWLEDGED', 'REJECTED'].includes(item.status)
      || !Number.isSafeInteger(item.version) || item.version < 1 || typeof item.incident?.title !== 'string'
      || (value.requiresResponseStart === true && typeof item.responseStarted !== 'boolean')))
    throw new Error('Nearby review queue unavailable');
  return value;
}
export async function startNearbyResponse(review: NearbyReview) {
  await apiClient.post(`/incidents/v1/nearby-reviews/${review.reviewId}/start-response`, { version: review.version });
}
export async function flagNearbyReview(review: NearbyReview, reason: string) {
  await apiClient.post(`/incidents/v1/nearby-reviews/${review.reviewId}/flag`, { version: review.version, reason: reason.trim() });
}
export async function decideNearbyReview(review: NearbyReview, status: 'ACKNOWLEDGED' | 'REJECTED', reason?: string) {
  await apiClient.post(`/incidents/v1/nearby-reviews/${review.reviewId}/decision`, { status, version: review.version,
    ...(reason?.trim() && { reason: reason.trim() }) });
}
