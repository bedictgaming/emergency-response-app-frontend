import apiClient from '@/lib/apiClient';
import { Alert, PublicAlert, CreateAlertPayload, AlertFilters } from '@/lib/types/alert';

export interface AlertsResponse {
  code: number;
  status: string;
  data: {
    alerts: PublicAlert[];
  };
}

export interface SingleAlertResponse {
  code: number;
  status: string;
  message?: string;
  data: {
    alert: PublicAlert;
  };
}

export interface GenericActionResponse {
  code: number;
  status: string;
  message?: string;
}

/**
 * GET /api/alerts/v1/
 * Fetches all broadcast alerts with optional filters.
 */
export const getAlerts = async (filters?: AlertFilters): Promise<PublicAlert[]> => {
  const params: Record<string, string> = {};
  if (filters?.alertType) params.alertType = filters.alertType;
  if (filters?.severity) params.severity = filters.severity;
  if (filters?.incidentId) params.incidentId = filters.incidentId;
  if (filters?.locationId) params.locationId = filters.locationId;

  const response = await apiClient.get<AlertsResponse>('/alerts/v1/', { params });
  return response.data?.data?.alerts || [];
};

/**
 * GET /api/alerts/v1/:id
 * Fetches single alert details by ID.
 */
export const getAlertById = async (id: string): Promise<PublicAlert> => {
  const response = await apiClient.get<SingleAlertResponse>(`/alerts/v1/${id}`);
  return response.data.data.alert;
};

/**
 * POST /api/alerts/v1/
 * Dispatches a new broadcast alert.
 */
export const createAlert = async (payload: CreateAlertPayload): Promise<Alert> => {
  const response = await apiClient.post<{ data: { alert: Alert } }>('/alerts/v1/', payload);
  return response.data.data.alert;
};

/**
 * DELETE /api/alerts/v1/:id
 * Deletes an alert record (ADMIN only).
 */
export const deleteAlert = async (id: string): Promise<GenericActionResponse> => {
  const response = await apiClient.delete<GenericActionResponse>(`/alerts/v1/${id}`);
  return response.data;
};
