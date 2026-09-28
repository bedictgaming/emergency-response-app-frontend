import apiClient from '@/lib/apiClient';
import type { IncidentUnit } from '@/lib/services/unitService';

export type IncidentStatus = 'OPEN' | 'ACTIVE' | 'RESPONDING' | 'RESOLVED' | 'CLOSED';
export type SeverityLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type VerificationStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type ResponseService = 'FIRE' | 'MEDICAL' | 'POLICE' | 'HAZARD';
export type ServiceResponseStatus = 'RESPONDING' | 'RESOLVED';

export interface IncidentAttachment {
  attachmentId: string;
  incidentId: string;
  fileName: string;
  fileType: string;
  fileUrl: string;
  uploadedBy?: string;
  uploadedAt: string;
}

export interface IncidentTypeInfo {
  typeId: string;
  typeName: string;
  description?: string;
}

export interface LocationInfo {
  locationId: string;
  locationName: string;
  address?: string;
  city?: string;
  province?: string;
  latitude?: number;
  longitude?: number;
}

export interface BarangayInfo {
  barangayId: string;
  name: string;
  status: string;
}

export interface ReporterInfo {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  role: string;
}

export interface Incident {
  incidentId: string;
  title: string;
  description?: string;
  typeId: string;
  locationId: string;
  barangayId?: string;
  latitude?: number;
  longitude?: number;
  severityLevel: SeverityLevel;
  requestedServices?: ResponseService[];
  status: IncidentStatus;
  verificationStatus: VerificationStatus;
  verificationNotes?: string;
  reportedBy: string;
  reportedAt: string;
  updatedAt: string;
  type?: IncidentTypeInfo;
  location?: LocationInfo;
  barangay?: BarangayInfo;
  reporter?: ReporterInfo;
  attachments?: IncidentAttachment[];
  incidentUnits?: IncidentUnit[];
  serviceResponses?: Array<{ service: ResponseService; status: ServiceResponseStatus; resolvedAt?: string }>;
}

export interface CreateIncidentPayload {
  title: string;
  description?: string;
  category?: string;
  typeName?: string;
  typeId?: string;
  locationName?: string;
  address?: string;
  locationId?: string;
  barangayName?: string;
  barangayId?: string;
  severityLevel?: SeverityLevel;
  latitude?: number;
  longitude?: number;
  reporterPhone?: string;
  requestedServices?: ResponseService[];
  proofAttachment?: { publicId: string; fileName: string };
}

export interface NearbyIncidentCheckPayload {
  category: string;
  requestedServices?: ResponseService[];
  barangayName: string;
  latitude: number;
  longitude: number;
}

export interface NearbyIncidentCheckResult {
  duplicate: boolean;
  locationAccepted?: boolean;
  message?: string;
  barangayName?: string;
}

export interface CreateAttachmentPayload {
  fileName: string;
  fileType: string;
  fileUrl: string;
}

export interface IncidentFilters {
  status?: IncidentStatus;
  statuses?: IncidentStatus[];
  responseService?: ResponseService;
  serviceStatuses?: ServiceResponseStatus[];
  severityLevel?: SeverityLevel;
  typeId?: string;
  locationId?: string;
  barangayId?: string;
  reportedBy?: string;
  department?: 'FIRE' | 'MEDICAL' | 'POLICE' | 'DRRMO';
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
  includeTotal?: boolean;
  includeServiceSummary?: boolean;
  includeAttachments?: boolean;
  includeUnits?: boolean;
}

interface IncidentsResponse {
  code: number;
  status: string;
  data: {
    incidents: Incident[];
    pagination?: { page: number; limit: number; total: number; pages: number };
    summary?: IncidentSummary;
  };
}

export interface IncidentSummary {
  total: number;
  active: number;
  responding: number;
  resolved: number;
  services?: {
    fire: number;
    medical: number;
    police: number;
    hazard: number;
  };
}

export interface IncidentPage {
  incidents: Incident[];
  pagination: { page: number; limit: number; total: number; pages: number };
  summary: IncidentSummary;
}

interface SingleIncidentResponse {
  code: number;
  status: string;
  message?: string;
  data: {
    incident: Incident;
  };
}

interface AttachmentResponse {
  code: number;
  status: string;
  message?: string;
  data: {
    attachment: IncidentAttachment;
  };
}

interface AttachmentsListResponse {
  code: number;
  status: string;
  data: {
    attachments: IncidentAttachment[];
  };
}

const pendingIncidentLists = new Map<string, Promise<IncidentPage>>();

/**
 * GET /api/incidents/v1/
 * Fetches all incidents with optional filters (e.g., status, severityLevel, reportedBy).
 */
export const getIncidentPage = (filters?: IncidentFilters): Promise<IncidentPage> => {
  const params: Record<string, string> = {};
  if (filters?.status) params.status = filters.status;
  if (filters?.statuses?.length) params.statuses = filters.statuses.join(',');
  if (filters?.responseService) params.responseService = filters.responseService;
  if (filters?.serviceStatuses?.length) params.serviceStatuses = filters.serviceStatuses.join(',');
  if (filters?.severityLevel) params.severityLevel = filters.severityLevel;
  if (filters?.typeId) params.typeId = filters.typeId;
  if (filters?.locationId) params.locationId = filters.locationId;
  if (filters?.barangayId) params.barangayId = filters.barangayId;
  if (filters?.reportedBy) params.reportedBy = filters.reportedBy;
  if (filters?.department) params.department = filters.department;
  if (filters?.from) params.from = filters.from;
  if (filters?.to) params.to = filters.to;
  if (filters?.page) params.page = String(filters.page);
  if (filters?.limit) params.limit = String(filters.limit);
  if (filters?.includeTotal === false) params.includeTotal = 'false';
  if (filters?.includeServiceSummary) params.includeServiceSummary = 'true';
  if (filters?.includeAttachments) params.includeAttachments = 'true';
  if (filters?.includeUnits) params.includeUnits = 'true';

  const identity = typeof window !== 'undefined' ? localStorage.getItem('user') ?? '' : '';
  const generation = typeof window !== 'undefined' ? localStorage.getItem('emergency-session-generation') ?? '' : '';
  const requestKey = `${identity}:${generation}:${new URLSearchParams(params).toString()}`;
  const existing = pendingIncidentLists.get(requestKey);
  if (existing) return existing;

  const request = apiClient
    // A remote PostgreSQL read can briefly exceed the default API timeout,
    // especially when the dashboard also requests evidence metadata. Keep
    // mutation requests bounded by the shorter default timeout.
    .get<IncidentsResponse>('/incidents/v1/', { params, timeout: 30_000 })
    .then(response => {
      const incidents = response.data?.data?.incidents ?? [];
      return {
        incidents,
        pagination: response.data?.data?.pagination ?? {
          page: filters?.page ?? 1,
          limit: filters?.limit ?? 50,
          total: incidents.length,
          pages: incidents.length > 0 ? 1 : 0,
        },
        summary: response.data?.data?.summary ?? {
          total: incidents.length,
          active: incidents.filter(incident => incident.status === 'OPEN' || incident.status === 'ACTIVE').length,
          responding: incidents.filter(incident => incident.status === 'RESPONDING').length,
          resolved: incidents.filter(incident => incident.status === 'RESOLVED' || incident.status === 'CLOSED').length,
        },
      };
    })
    .finally(() => {
      if (pendingIncidentLists.get(requestKey) === request) pendingIncidentLists.delete(requestKey);
    });
  pendingIncidentLists.set(requestKey, request);
  return request;
};

export const getIncidents = async (filters?: IncidentFilters): Promise<Incident[]> =>
  (await getIncidentPage(filters)).incidents;

export type IncidentDashboardTab = 'All' | 'Active' | 'Responding' | 'Resolved';

export const ADMIN_INCIDENT_PAGE_SIZE = 5;

export const incidentStatusesForTab = (tab: IncidentDashboardTab): IncidentStatus[] | undefined => {
  switch (tab) {
    case 'Active':
      return ['OPEN', 'ACTIVE'];
    case 'Responding':
      return ['RESPONDING'];
    case 'Resolved':
      return ['RESOLVED', 'CLOSED'];
    default:
      return undefined;
  }
};

export const incidentServiceStatusesForTab = (
  tab: Exclude<IncidentDashboardTab, 'All' | 'Active'>,
): ServiceResponseStatus[] => tab === 'Resolved' ? ['RESOLVED'] : ['RESPONDING'];

/**
 * GET /api/incidents/v1/:id
 * Fetches details for a single incident.
 */
export const getIncidentById = async (id: string): Promise<Incident> => {
  const response = await apiClient.get<SingleIncidentResponse>(`/incidents/v1/${id}`);
  return response.data.data.incident;
};

/**
 * POST /api/incidents/v1/
 * Creates a new emergency incident.
 */
export const createIncident = async (payload: CreateIncidentPayload): Promise<Incident> => {
  const response = await apiClient.post<SingleIncidentResponse>('/incidents/v1/', payload);
  return response.data.data.incident;
};

export const checkNearbyIncident = async (
  payload: NearbyIncidentCheckPayload,
): Promise<NearbyIncidentCheckResult> => {
  const response = await apiClient.post<{ data: NearbyIncidentCheckResult }>(
    '/incidents/v1/nearby-check',
    payload,
  );
  return response.data.data;
};

/**
 * PUT /api/incidents/v1/:id
 * Updates an incident's details or status.
 */
export const updateIncident = async (
  id: string,
  payload: Partial<CreateIncidentPayload> & { status?: IncidentStatus }
): Promise<Incident> => {
  const response = await apiClient.put<SingleIncidentResponse>(`/incidents/v1/${id}`, payload);
  return response.data.data.incident;
};

export const verifyIncident = async (
  id: string,
  verificationStatus: Exclude<VerificationStatus, 'PENDING'>,
  verificationNotes?: string,
): Promise<Incident> => {
  const response = await apiClient.patch<SingleIncidentResponse>(`/incidents/v1/${id}/verify`, {
    verificationStatus,
    verificationNotes,
  });
  return response.data.data.incident;
};

/**
 * DELETE /api/incidents/v1/:id
 * Deletes an incident (ADMIN only).
 */
export const deleteIncident = async (id: string): Promise<void> => {
  await apiClient.delete(`/incidents/v1/${id}`);
};

export const updateIncidentServiceResponse = async (id: string, service: ResponseService, status: ServiceResponseStatus): Promise<void> => {
  await apiClient.patch(`/incidents/v1/${id}/services/${service}`, { status });
};

/**
 * POST /api/incidents/v1/:incidentId/attachments
 * Saves an attachment record linked to the incident.
 */
export const addIncidentAttachment = async (
  incidentId: string,
  payload: CreateAttachmentPayload
): Promise<IncidentAttachment> => {
  const response = await apiClient.post<AttachmentResponse>(
    `/incidents/v1/${incidentId}/attachments`,
    payload
  );
  return response.data.data.attachment;
};

/**
 * GET /api/incidents/v1/:incidentId/attachments
 * Fetches all attachments for a specific incident.
 */
export const getIncidentAttachments = async (
  incidentId: string
): Promise<IncidentAttachment[]> => {
  const response = await apiClient.get<AttachmentsListResponse>(
    `/incidents/v1/${incidentId}/attachments`
  );
  return response.data?.data?.attachments || [];
};

export interface DashboardIncident {
  id: string;
  type: string;
  services: string[];
  status: string; // 'active' | 'responding' | 'resolved'
  rawStatus: IncidentStatus;
  time: string;
  title: string;
  description: string;
  reporter: string;
  phone: string;
  location: string;
  hasLocationBtn: boolean;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  raw: Incident;
}

export const formatIncidentForDashboard = (inc: Incident, responseService?: ResponseService): DashboardIncident => {
  const typeName = inc.type?.typeName?.toLowerCase() || '';
  let type = 'Other';
  if (typeName.includes('fire')) type = 'Fire';
  else if (typeName.includes('med')) type = 'Medical';
  else if (typeName.includes('pol') || typeName.includes('sec')) type = 'Police';
  else if (typeName.includes('haz') || typeName.includes('flood') || typeName.includes('weath')) type = 'Hazard';

  const serviceLabels: Record<ResponseService, string> = {
    FIRE: 'Fire',
    MEDICAL: 'Medical',
    POLICE: 'Police',
    HAZARD: 'Hazard',
  };
  const services = inc.requestedServices?.length
    ? inc.requestedServices.map(service => serviceLabels[service])
    : [type];

  let status = 'active';
  if (inc.status === 'ACTIVE') status = 'active';
  else if (inc.status === 'RESPONDING') status = 'responding';
  else if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') status = 'resolved';
  else if (inc.status === 'OPEN') status = 'active';
  if (responseService) {
    const serviceResponse = inc.serviceResponses?.find(item => item.service === responseService);
    if (serviceResponse) status = serviceResponse.status === 'RESOLVED' ? 'resolved' : 'responding';
  }

  let phone = 'Not provided';
  let description = (inc.description || '').trim();
  const match = description.match(/\[Contact:\s*([^\]]+)\]/);
  if (match) {
    phone = match[1].trim();
    description = description.replace(match[0], '').trim();
  }

  // Format time
  const date = new Date(inc.reportedAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  let timeStr = 'Just now';
  if (diffMins >= 1 && diffMins < 60) timeStr = `${diffMins} min ago`;
  else if (diffMins >= 60 && diffMins < 1440) timeStr = `${Math.floor(diffMins / 60)} hr ago`;
  else if (diffMins >= 1440) timeStr = date.toLocaleDateString();

  const lat = inc.latitude ? Number(inc.latitude) : undefined;
  const lng = inc.longitude ? Number(inc.longitude) : undefined;

  return {
    id: inc.incidentId,
    type,
    services,
    status,
    rawStatus: inc.status,
    time: timeStr,
    title: inc.title,
    description,
    reporter: inc.reporter?.name || 'Citizen',
    phone,
    location: inc.location?.address || inc.location?.locationName || 'Cordova Jurisdiction',
    hasLocationBtn: !!(lat && lng),
    latitude: lat,
    longitude: lng,
    photoUrl: inc.attachments?.[0]?.fileUrl,
    raw: inc,
  };
};
