import type { AuthUser } from '@/lib/services/authService';

export type AdminDepartment = 'MAIN' | 'FIRE' | 'POLICE' | 'MEDICAL' | 'DRRMO';

export const ADMIN_ROLES = new Set(['ADMIN', 'DISPATCHER']);

export function getAdminDepartment(department?: string | null): AdminDepartment | null {
  return ['MAIN', 'FIRE', 'POLICE', 'MEDICAL', 'DRRMO'].includes(department || '')
    ? department as AdminDepartment
    : null;
}

export function getDepartmentDashboardUrl(department: AdminDepartment): string {
  switch (department) {
    case 'FIRE': return '/admin/fire-dashboard';
    case 'POLICE': return '/admin/police-dashboard';
    case 'MEDICAL': return '/admin/medical-dashboard';
    case 'DRRMO': return '/admin/drrmo-dashboard';
    case 'MAIN':
    default: return '/admin/main-dashboard';
  }
}

export function accountHome(user: AuthUser): string {
  if (ADMIN_ROLES.has(user.role)) {
    const department = getAdminDepartment(user.department);
    return department ? getDepartmentDashboardUrl(department) : '/';
  }
  if (user.role === 'RESPONDER') return '/responder/tasks';
  return '/dashboard';
}

export function hasPermission(user: AuthUser | null | undefined, permission: string): boolean {
  return Boolean(user?.permissions?.includes(permission));
}
