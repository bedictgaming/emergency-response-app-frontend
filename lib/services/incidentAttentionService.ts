import apiClient from '@/lib/apiClient';
import type { ResponseService, IncidentStatus } from './incidentService';
export interface IncidentAttention {
  incidentId: string; version: number; scope: 'MAIN' | ResponseService;
  title: string; description?: string; reportedAt: string; status: IncidentStatus;
  type?: { typeName: string }; location?: { address?: string; locationName?: string }; reporter?: { name?: string };
}
export const attentionKey = (item: IncidentAttention) => `${item.incidentId}:${item.scope}:${item.version}`;
export async function getIncidentAttention(responseService?: ResponseService) {
  const response = await apiClient.get<{ data: { items: IncidentAttention[]; hasMore: boolean } }>('/incidents/v1/attention', { params: { responseService }, timeout: 30_000 });
  if (!Array.isArray(response.data.data?.items) || typeof response.data.data.hasMore !== 'boolean') throw new Error('Invalid alert queue response');
  return response.data.data;
}
export async function acknowledgeIncidentAttention(item: IncidentAttention, responseService?: ResponseService) {
  await apiClient.post(`/incidents/v1/${item.incidentId}/attention/acknowledge`, { version: item.version, ...(responseService && { responseService }) });
}
