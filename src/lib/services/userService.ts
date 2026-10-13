import apiClient from '@/lib/apiClient';

export type UserRole = 'USER' | 'ADMIN' | 'DISPATCHER' | 'RESPONDER';
export type UserStatus = 'ACTIVE' | 'INACTIVE';
export type AdminDepartment = 'MAIN' | 'FIRE' | 'MEDICAL' | 'POLICE' | 'DRRMO';

export interface ResponderInfo {
  responderId: string;
  rank?: string;
  status: string;
  unit: {
    unitId: string;
    unitName: string;
    unitType: string;
  };
}

export interface UserCountInfo {
  reportedIncidents: number;
  uploadedFiles: number;
  sentAlerts: number;
}

export interface SystemUser {
  id: string;
  name?: string;
  email?: string;
  role: UserRole;
  status: UserStatus;
  department?: AdminDepartment | null;
  isMainAdmin?: boolean;
  emailVerified?: string;
  createdAt: string;
  updatedAt: string;
  responder?: ResponderInfo;
  _count?: UserCountInfo;
}

interface UsersResponse {
  code: number;
  status: string;
  data: { users: SystemUser[] };
}

interface SingleUserResponse {
  code: number;
  status: string;
  data: { user: SystemUser };
}

interface UpdateRoleResponse {
  code: number;
  status: string;
  data: { user: SystemUser };
}

/**
 * GET /api/users/v1/
 * Fetch all system users with optional filters
 */
export const getAllUsers = async (filters?: { role?: UserRole; search?: string }): Promise<SystemUser[]> => {
  const params: Record<string, string> = {};
  if (filters?.role) params.role = filters.role;
  if (filters?.search) params.search = filters.search;

  const response = await apiClient.get<UsersResponse>('/users/v1/', { params });
  return response.data?.data?.users || [];
};

/**
 * GET /api/users/v1/:id
 * Fetch a single user's profile
 */
export const getUserById = async (id: string): Promise<SystemUser> => {
  const response = await apiClient.get<SingleUserResponse>(`/users/v1/${id}`);
  return response.data.data.user;
};

/**
 * PUT /api/users/v1/:id/role
 * Update a user's role (USER <-> ADMIN)
 */
export const updateUserRole = async (id: string, role: UserRole, department?: AdminDepartment | null, isMainAdmin = false): Promise<SystemUser> => {
  const response = await apiClient.put<UpdateRoleResponse>(`/users/v1/${id}/role`, { role, department, isMainAdmin });
  return response.data.data.user;
};

export const updateUserStatus = async (id: string, status: UserStatus): Promise<SystemUser> => {
  const response = await apiClient.patch<UpdateRoleResponse>(`/users/v1/${id}/status`, { status });
  return response.data.data.user;
};

/**
 * DELETE /api/users/v1/:id
 * Delete / deactivate a user account
 */
export const deleteUser = async (id: string): Promise<void> => {
  await apiClient.delete(`/users/v1/${id}`);
};
