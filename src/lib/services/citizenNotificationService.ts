import apiClient from '@/lib/apiClient';
export interface CitizenReviewNotification {
  id: string; incidentId: string; reportTitle: string; department: 'MAIN' | 'FIRE' | 'MEDICAL' | 'POLICE' | 'DRRMO';
  status: 'PENDING' | 'CONFIRMED' | 'DISMISSED'; updatedAt: string;
}
const uuid = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i;
export async function getCitizenReviewNotifications(signal: AbortSignal): Promise<{ items: CitizenReviewNotification[]; hasMore: boolean }> {
  const response = await apiClient.get('/notifications/v1/report-reviews', { signal });
  const data = response.data?.data;
  if (!data || !Array.isArray(data.items) || data.items.length > 50 || data.limit !== 50 || typeof data.hasMore !== 'boolean'
    || data.items.some((item: CitizenReviewNotification) => !uuid.test(item.id) || !uuid.test(item.incidentId)
      || typeof item.reportTitle !== 'string' || !['MAIN','FIRE','MEDICAL','POLICE','DRRMO'].includes(item.department)
      || !['PENDING','CONFIRMED','DISMISSED'].includes(item.status) || !Number.isFinite(Date.parse(item.updatedAt)))
    || new Set(data.items.map((item: CitizenReviewNotification) => item.id)).size !== data.items.length) throw new Error('Invalid private review notification response');
  return { items: data.items, hasMore: data.hasMore };
}
export const notificationReceipt = (item: CitizenReviewNotification) => `${item.id}@${item.updatedAt}`;
export function citizenReviewIdentity(userId: string) {
  try {
    const user = JSON.parse(localStorage.getItem('user') ?? 'null');
    return user?.id === userId && user.role === 'USER'
      ? `${userId}:${localStorage.getItem('emergency-session-generation') ?? ''}:${localStorage.getItem('emergency-logout-epoch') ?? ''}` : null;
  } catch { return null; }
}
