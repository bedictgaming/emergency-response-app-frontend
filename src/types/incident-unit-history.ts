// Historical DTO only; no unit-management or dispatch request methods.
export interface IncidentUnit {
  incidentUnitId: string;
  incidentId: string;
  unitId: string;
  assignedAt: string;
  role?: string | null;
  status: 'DISPATCHED' | 'EN_ROUTE' | 'ON_SCENE' | 'RETURNED';
  unit: { unitId: string; unitName: string; unitType: string; status: 'AVAILABLE' | 'DEPLOYED' | 'OUT_OF_SERVICE' };
}
