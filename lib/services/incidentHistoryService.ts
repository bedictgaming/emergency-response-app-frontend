import apiClient from '@/lib/apiClient';
import {
  IncidentRecord,
  IncidentStatus,
  SeverityLevel,
} from '@/lib/types/barangay-history';

export interface IncidentHistoryFilters {
  status?: IncidentStatus;
  severityLevel?: SeverityLevel;
  typeId?: string;
  locationId?: string;
  barangayId?: string;
}

export interface IncidentsApiResponse {
  code: number;
  status: string;
  data: {
    incidents: IncidentRecord[];
  };
}

/**
 * Fetch all incident records from backend with optional filters
 */
export const getIncidentHistory = async (
  filters?: IncidentHistoryFilters
): Promise<IncidentRecord[]> => {
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.severityLevel) params.severityLevel = filters.severityLevel;
  if (filters?.typeId) params.typeId = filters.typeId;
  if (filters?.locationId) params.locationId = filters.locationId;
  if (filters?.barangayId) params.barangayId = filters.barangayId;

  try {
    const response = await apiClient.get<IncidentsApiResponse>('/incidents/v1/', { params });
    return response.data?.data?.incidents || [];
  } catch (error) {
    console.error('Failed to fetch incident history', error);
    return [];
  }
};
