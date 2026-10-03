import apiClient from '@/lib/apiClient';
import { BarangayItem, IncidentRecord } from '@/lib/types/barangay-history';

export interface BarangaysResponse {
  code: number;
  status: string;
  data: {
    barangays: BarangayItem[];
  };
}

export interface SingleBarangayResponse {
  code: number;
  status: string;
  data: {
    barangay: BarangayItem;
  };
}

export interface BarangayIncidentsResponse {
  code: number;
  status: string;
  data: {
    barangay: BarangayItem;
    incidents: IncidentRecord[];
  };
}

/**
 * GET /api/barangays/v1/
 * Lists all 13 reference barangays
 */
export const getBarangays = async (options?: { throwOnError?: boolean }): Promise<BarangayItem[]> => {
  try {
    const response = await apiClient.get<BarangaysResponse>('/barangays/v1/');
    return response.data?.data?.barangays || [];
  } catch (error) {
    if (options?.throwOnError) throw error;
    console.error('Failed to fetch barangays', error);
    return [];
  }
};

/**
 * GET /api/barangays/v1/:id
 */
export const getBarangayById = async (id: string): Promise<BarangayItem | null> => {
  try {
    const response = await apiClient.get<SingleBarangayResponse>(`/barangays/v1/${id}`);
    return response.data?.data?.barangay || null;
  } catch (error) {
    console.error('Failed to fetch barangay detail', error);
    return null;
  }
};

/**
 * GET /api/barangays/v1/:id/incidents
 * Lists all incidents reported within a specific barangay
 */
export const getBarangayIncidents = async (
  barangayId: string
): Promise<IncidentRecord[]> => {
  try {
    const response = await apiClient.get<BarangayIncidentsResponse>(
      `/barangays/v1/${barangayId}/incidents`
    );
    return response.data?.data?.incidents || [];
  } catch (error) {
    console.error('Failed to fetch incidents for barangay', error);
    return [];
  }
};
