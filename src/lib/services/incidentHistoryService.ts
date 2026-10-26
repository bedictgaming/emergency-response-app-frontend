import apiClient from '@/lib/apiClient';
import {
  IncidentRecord,
  IncidentStatus,
  SeverityLevel,
} from '@/types/barangay-history';

export const INCIDENT_HISTORY_PAGE_SIZE = 5;

export interface IncidentHistoryFilters {
  status?: IncidentStatus;
  severityLevel?: SeverityLevel;
  typeId?: string;
  locationId?: string;
  barangayId?: string;
  search?: string;
  typeName?: string;
  period?: 'THIS_MONTH' | 'LAST_30_DAYS';
  page?: number;
  includeUnits?: boolean;
  to?: string;
}

export interface IncidentsApiResponse {
  code: number;
  status: string;
  data: {
    incidents: IncidentRecord[];
    pagination: { page: number; limit: number; total: number; pages: number };
  };
}

/**
 * Fetch one server-paginated history page with optional filters.
 */
export const getIncidentHistory = async (
  filters?: IncidentHistoryFilters,
  options?: { limit?: number; signal?: AbortSignal },
): Promise<IncidentsApiResponse['data']> => {
  const params: Record<string, string | number | boolean> = { page: filters?.page ?? 1, limit: options?.limit ?? INCIDENT_HISTORY_PAGE_SIZE, includeTotal: true };
  if (filters?.status) params.status = filters.status;
  if (filters?.severityLevel) params.severityLevel = filters.severityLevel;
  if (filters?.typeId) params.typeId = filters.typeId;
  if (filters?.locationId) params.locationId = filters.locationId;
  if (filters?.barangayId) params.barangayId = filters.barangayId;
  if (filters?.search?.trim()) params.search = filters.search.trim();
  if (filters?.typeName) params.typeName = filters.typeName;
  if (filters?.period) params.period = filters.period;
  if (filters?.includeUnits) params.includeUnits = true;
  if (filters?.to) params.to = filters.to;

    const response = await apiClient.get<IncidentsApiResponse>('/incidents/v1/', { params, signal: options?.signal });
    const data = response.data?.data;
    if (!Array.isArray(data?.incidents) || !data.pagination) throw new Error('History response unavailable');
    return data;
};
