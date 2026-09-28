import apiClient from '@/lib/apiClient';
import {
  DashboardAnalytics,
  BarangayRankingItem,
  EmergencyTypeDistributionItem,
  ResolvedSummaryItem,
} from '@/lib/types/barangay-history';

export interface DashboardAnalyticsResponse {
  code: number;
  status: string;
  data: DashboardAnalytics;
}

export interface IncidentsByBarangayResponse {
  code: number;
  status: string;
  data: {
    totalIncidents: number;
    topArea: BarangayRankingItem | null;
    rankings: BarangayRankingItem[];
  };
}

export interface IncidentsByTypeResponse {
  code: number;
  status: string;
  data: {
    totalIncidents: number;
    topType: EmergencyTypeDistributionItem | null;
    distribution: EmergencyTypeDistributionItem[];
  };
}

export interface ResolvedSummaryResponse {
  code: number;
  status: string;
  data: ResolvedSummaryItem;
}

/**
 * GET /api/analytics/v1/dashboard
 * Fetches unified dashboard analytics payload
 */
export const getDashboardAnalytics = async (): Promise<DashboardAnalytics | null> => {
  try {
    const response = await apiClient.get<DashboardAnalyticsResponse>(
      '/analytics/v1/dashboard'
    );
    return response.data?.data || null;
  } catch (error) {
    console.error('Failed to fetch dashboard analytics', error);
    return null;
  }
};

/**
 * GET /api/analytics/v1/incidents-by-barangay
 */
export const getIncidentsByBarangay = async (filters?: {
  from?: string;
  to?: string;
  typeId?: string;
}) => {
  try {
    const response = await apiClient.get<IncidentsByBarangayResponse>(
      '/analytics/v1/incidents-by-barangay',
      { params: filters }
    );
    return response.data?.data || null;
  } catch (error) {
    console.error('Failed to fetch incidents by barangay analytics', error);
    return null;
  }
};

/**
 * GET /api/analytics/v1/incidents-by-type
 */
export const getIncidentsByType = async (filters?: {
  from?: string;
  to?: string;
  barangayId?: string;
}) => {
  try {
    const response = await apiClient.get<IncidentsByTypeResponse>(
      '/analytics/v1/incidents-by-type',
      { params: filters }
    );
    return response.data?.data || null;
  } catch (error) {
    console.error('Failed to fetch incidents by type analytics', error);
    return null;
  }
};

/**
 * GET /api/analytics/v1/resolved-summary
 */
export const getResolvedSummary = async (filters?: {
  month?: number;
  year?: number;
  barangayId?: string;
}) => {
  try {
    const response = await apiClient.get<ResolvedSummaryResponse>(
      '/analytics/v1/resolved-summary',
      { params: filters }
    );
    return response.data?.data || null;
  } catch (error) {
    console.error('Failed to fetch resolved summary analytics', error);
    return null;
  }
};
