import apiClient from '@/lib/apiClient';

export type UnitStatus = 'AVAILABLE' | 'DEPLOYED' | 'OUT_OF_SERVICE';

export type IncidentUnitStatus = 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE' | 'RETURNED';

export interface Unit {
  unitId: string;
  unitName: string;
  unitType: string;
  status: UnitStatus;
}

export interface IncidentUnit {
  incidentUnitId: string;
  incidentId: string;
  unitId: string;
  assignedAt: string;
  role?: string | null;
  status: IncidentUnitStatus;
  unit: {
    unitId: string;
    unitName: string;
    unitType: string;
    status: UnitStatus;
  };
}

interface UnitsResponse {
  code: number;
  status: string;
  data: {
    units: Unit[];
  };
}

interface IncidentUnitsResponse {
  code: number;
  status: string;
  data: {
    incidentUnits: IncidentUnit[];
  };
}

interface SingleIncidentUnitResponse {
  code: number;
  status: string;
  message?: string;
  data: {
    incidentUnit: IncidentUnit;
  };
}

/**
 * Fetch all response units (e.g. Fire engines, ambulances, police cars)
 */
export const getUnits = async (filters?: { status?: UnitStatus; unitType?: string }): Promise<Unit[]> => {
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.unitType) params.unitType = filters.unitType;

  const response = await apiClient.get<UnitsResponse>('/units/v1/', { params });
  return response.data?.data?.units || [];
};

/**
 * Fetch all units assigned to a specific incident
 */
export const getIncidentUnits = async (incidentId: string): Promise<IncidentUnit[]> => {
  const response = await apiClient.get<IncidentUnitsResponse>(`/incidents/v1/${incidentId}/units`);
  return response.data?.data?.incidentUnits || [];
};

/**
 * Dispatch a unit to an incident
 */
export const dispatchUnitToIncident = async (
  incidentId: string,
  payload: { unitId: string; role?: string }
): Promise<IncidentUnit> => {
  const response = await apiClient.post<SingleIncidentUnitResponse>(
    `/incidents/v1/${incidentId}/units`,
    payload
  );
  return response.data.data.incidentUnit;
};

/**
 * Update the operational status of a dispatched unit (DISPATCHED -> EN_ROUTE -> ON_SCENE -> RETURNED)
 */
export const updateIncidentUnitStatus = async (
  incidentUnitId: string,
  payload: { status: IncidentUnitStatus; role?: string }
): Promise<IncidentUnit> => {
  const response = await apiClient.put<SingleIncidentUnitResponse>(
    `/incident-units/v1/${incidentUnitId}`,
    payload
  );
  return response.data.data.incidentUnit;
};

/**
 * Remove or unassign a unit from an incident
 */
export const removeUnitFromIncident = async (incidentId: string, unitId: string): Promise<void> => {
  await apiClient.delete(`/incidents/v1/${incidentId}/units/${unitId}`);
};
