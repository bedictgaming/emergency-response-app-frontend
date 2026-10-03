export type IncidentStatus = 'OPEN' | 'ACTIVE' | 'RESPONDING' | 'RESOLVED' | 'CLOSED';
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type BarangayStatus = 'ACTIVE' | 'INACTIVE';

export interface BarangayItem {
  barangayId: string;
  name: string;
  status: BarangayStatus;
  _count?: {
    incidents: number;
  };
}

export interface IncidentLocation {
  locationId: string;
  locationName: string;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface IncidentTypeInfo {
  typeId: string;
  typeName: string;
  description?: string | null;
}

export interface IncidentReporterInfo {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export interface IncidentUnitAssignment {
  incidentUnitId: string;
  assignedAt: string;
  unit: {
    unitId: string;
    unitName: string;
    unitType: string;
  };
}

export interface IncidentRecord {
  verificationStatus?: 'UNVERIFIED' | 'VERIFIED' | 'REJECTED';
  incidentId: string;
  title: string;
  description?: string | null;
  typeId: string;
  locationId: string;
  barangayId?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  severityLevel: SeverityLevel;
  status: IncidentStatus;
  reportedBy: string;
  reportedAt: string;
  updatedAt: string;
  type: IncidentTypeInfo;
  location: IncidentLocation;
  barangay?: BarangayItem | null;
  reporter?: IncidentReporterInfo | null;
  incidentUnits?: IncidentUnitAssignment[];
}

export interface BarangayRankingItem {
  barangayId: string;
  name: string;
  status: BarangayStatus;
  incidentCount: number;
  activeCount: number;
  respondingCount: number;
  resolvedCount: number;
  percentage: number;
  riskLevel: 'HIGH' | 'MODERATE' | 'LOW';
}

export interface EmergencyTypeDistributionItem {
  typeId: string;
  typeName: string;
  description?: string | null;
  count: number;
  percentage: number;
  color: string;
}

export interface ResolvedSummaryItem {
  month: number;
  year: number;
  totalReportedThisMonth: number;
  resolvedThisMonth: number;
  activeThisMonth: number;
  resolutionRate: number;
  totalHistorical: number;
  totalResolvedAllTime: number;
}

export interface DashboardAnalytics {
  incidentsByBarangay: {
    totalIncidents: number;
    topArea: BarangayRankingItem | null;
    rankings: BarangayRankingItem[];
  };
  incidentsByType: {
    totalIncidents: number;
    topType: EmergencyTypeDistributionItem | null;
    distribution: EmergencyTypeDistributionItem[];
  };
  resolvedSummary: ResolvedSummaryItem;
}
