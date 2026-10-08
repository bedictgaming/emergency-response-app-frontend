"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Shield,
  User,
  Search,
  RefreshCw,
  Crown,
  UserCheck,
  Mail,
  Calendar,
  Loader2,
  AlertTriangle,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import AdminHeader from "@/app/component/admin/AdminHeader";
import { AdminDepartment, getAllUsers, updateUserRole, updateUserStatus, SystemUser, UserRole } from "@/lib/services/userService";
import { useAdminGuard } from "@/app/hooks/useAdminGuard";
import { ContinuousPagination } from "@/app/component/ui/continuous-pagination";

export default function AdminUsersPage() {
  const isAuthorized = useAdminGuard("MAIN");
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"" | UserRole>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const [userPage, setUserPage] = useState(1);
  const USERS_PER_PAGE = 3;

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 3500);
  };

  const loadUsers = useCallback(async () => {
    try {
      const data = await getAllUsers({
        ...(roleFilter && { role: roleFilter }),
        ...(searchQuery.trim() && { search: searchQuery.trim() }),
      });
      setUsers(data);
    } catch (err) {
      console.error("Failed to load users:", err);
      showToast("Failed to load user list. Check connection.", "error");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [roleFilter, searchQuery]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setUserPage(1);
  }, [searchQuery, roleFilter]);

  const userTotalPages = Math.max(1, Math.ceil(users.length / USERS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (userPage - 1) * USERS_PER_PAGE;
    return users.slice(start, start + USERS_PER_PAGE);
  }, [users, userPage, USERS_PER_PAGE]);

  // Clamp page when the total shrinks
  useEffect(() => {
    if (userPage > userTotalPages) setUserPage(1);
  }, [userPage, userTotalPages]);

  if (!isAuthorized) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadUsers();
  };

  const handleRoleChange = async (user: SystemUser, newRole: UserRole) => {
    setActionLoading(user.id);
    try {
      await updateUserRole(user.id, newRole, ['ADMIN', 'DISPATCHER'].includes(newRole) ? (user.department || 'MAIN') : null, newRole === 'ADMIN' && Boolean(user.isMainAdmin));
      showToast(`${user.name || user.email} is now ${newRole}.`);
      await loadUsers();
    } catch (err) {
      console.error("Role update failed:", err);
      showToast("Failed to update role. Please try again.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleStatusToggle = async (user: SystemUser) => {
    const nextStatus = user.status === 'INACTIVE' ? 'ACTIVE' : 'INACTIVE';
    setActionLoading(user.id);
    try {
      await updateUserStatus(user.id, nextStatus);
      showToast(`${user.name || user.email} is now ${nextStatus.toLowerCase()}.`);
      await loadUsers();
    } catch {
      showToast('Failed to update account status.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDepartmentChange = async (user: SystemUser, department: AdminDepartment) => {
    setActionLoading(user.id);
    try {
      await updateUserRole(user.id, user.role, department, department === 'MAIN' && user.role === 'ADMIN' && Boolean(user.isMainAdmin));
      showToast(`${user.name || user.email} is assigned to ${department}.`);
      await loadUsers();
    } catch {
      showToast('Failed to update department.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMainAdminChange = async (user: SystemUser, enabled: boolean) => {
    setActionLoading(user.id);
    try {
      await updateUserRole(user.id, 'ADMIN', 'MAIN', enabled);
      showToast(`${user.name || user.email} main-admin access ${enabled ? 'enabled' : 'removed'}.`);
      await loadUsers();
    } catch {
      showToast('Failed to update main-admin access.', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const userCount = users.filter((u) => u.role === "USER").length;
  const responderCount = users.filter((u) => u.responder).length;

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  return (
    <div className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 pb-10 font-sans">
      <AdminHeader
        title="User & Personnel Management"
        subtitle="System Administration — All Accounts"
        departmentIcon={<Users className="text-purple-600" size={28} />}
        badgeBorderClass="border-purple-500"
        showBackButton={true}
      />

      {/* Toast */}
      {toastMsg && (
        <div
          className={`fixed top-5 right-5 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white transition-all ${
            toastMsg.type === "success" ? "bg-emerald-600" : "bg-red-600"
          }`}
        >
          {toastMsg.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {toastMsg.text}
        </div>
      )}

      <main className="max-w-6xl mx-auto px-6 mt-8">
        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center">
              <Users size={22} className="text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{users.length}</div>
              <div className="text-xs font-medium text-gray-500">Total Accounts</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center">
              <Shield size={22} className="text-rose-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-rose-600">{adminCount}</div>
              <div className="text-xs font-medium text-gray-500">Administrators</div>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <UserCheck size={22} className="text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">{responderCount}</div>
              <div className="text-xs font-medium text-gray-500">Field Responders</div>
            </div>
          </div>
        </div>

        {/* Filters & Search */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 mb-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              id="admin-users-search"
              name="admin-users-search"
              aria-label="Search user accounts"
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 h-9 rounded-xl bg-gray-50 border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-400 transition-all"
            />
          </div>
          <div className="relative">
            <select
              id="admin-users-role-filter"
              name="admin-users-role-filter"
              aria-label="Filter users by role"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as "" | UserRole)}
              className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-gray-50 border border-gray-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-500/20 text-gray-700"
            >
              <option value="">All Roles</option>
              <option value="USER">Citizen</option>
              <option value="DISPATCHER">Dispatcher</option>
              <option value="RESPONDER">Responder</option>
              <option value="ADMIN">Admin</option>
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          <button
            onClick={handleRefresh}
            className="h-9 px-3 flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-gray-50 border border-gray-200 rounded-xl hover:bg-gray-100 transition-all"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-blue-600" : ""} />
            Refresh
          </button>
        </div>

        {/* User Table */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          {isLoading ? (
            <div className="py-16 flex items-center justify-center gap-3 text-gray-400">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading user accounts...</span>
            </div>
          ) : users.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              No users found matching your search.
            </div>
          ) : (
            <div role="region" aria-label="User accounts table — scroll horizontally for all controls" tabIndex={0} className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      User
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Role
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">
                      Unit / Assignment
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Reports
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                      Joined
                    </th>
                    <th className="text-right px-5 py-3.5 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginatedUsers.map((user) => {
                    const isActing = actionLoading === user.id;
                    return (
                      <tr key={user.id} className="hover:bg-gray-50/50 transition-colors">
                        {/* User Info */}
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0 ${
                                user.role === "ADMIN" ? "bg-gradient-to-br from-purple-500 to-rose-600" : "bg-gradient-to-br from-blue-400 to-cyan-500"
                              }`}
                            >
                              {(user.name || user.email || "U").charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-900 text-sm truncate">
                                {user.name || "—"}
                              </p>
                              <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
                                <Mail size={10} />
                                {user.email || "No email"}
                              </p>
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="px-5 py-4">
                          {user.role === "ADMIN" ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <Crown size={11} />
                              ADMIN
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <User size={11} />
                              CITIZEN
                            </span>
                          )}
                        </td>

                        {/* Unit */}
                        <td className="px-5 py-4 hidden md:table-cell">
                          {user.responder ? (
                            <div>
                              <p className="text-xs font-bold text-gray-700">
                                {user.responder.unit.unitName}
                              </p>
                              <p className="text-[11px] text-gray-400">
                                {user.responder.rank || "Field Responder"} •{" "}
                                <span
                                  className={
                                    user.responder.status === "AVAILABLE"
                                      ? "text-emerald-600"
                                      : user.responder.status === "DEPLOYED"
                                      ? "text-amber-600"
                                      : "text-gray-400"
                                  }
                                >
                                  {user.responder.status}
                                </span>
                              </p>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>

                        {/* Report Count */}
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-sm font-semibold text-gray-700">
                            {user._count?.reportedIncidents ?? 0}
                          </span>
                          <span className="text-xs text-gray-400 ml-1">reports</span>
                        </td>

                        {/* Joined */}
                        <td className="px-5 py-4 hidden lg:table-cell">
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Calendar size={11} />
                            {formatDate(user.createdAt)}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4">
                          <div className="flex items-center justify-end gap-2">
                            <select
                              id={`admin-user-role-${user.id}`}
                              name={`admin-user-role-${user.id}`}
                              value={user.role}
                              onChange={(event) => handleRoleChange(user, event.target.value as UserRole)}
                              disabled={isActing}
                              aria-label={`Role for ${user.name || user.email}`}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 bg-white disabled:opacity-50"
                            >
                              <option value="USER">Citizen</option>
                              <option value="DISPATCHER">Dispatcher</option>
                              <option value="RESPONDER">Responder</option>
                              <option value="ADMIN">Admin</option>
                            </select>
                            {['ADMIN', 'DISPATCHER'].includes(user.role) && (
                              <select
                                id={`admin-user-department-${user.id}`}
                                name={`admin-user-department-${user.id}`}
                                value={user.department || ''}
                                onChange={(event) => handleDepartmentChange(user, event.target.value as AdminDepartment)}
                                disabled={isActing}
                                aria-label={`Department for ${user.name || user.email}`}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 bg-white disabled:opacity-50"
                              >
                                <option value="" disabled>Department</option>
                                <option value="MAIN">Main</option>
                                <option value="FIRE">Fire</option>
                                <option value="MEDICAL">Medical</option>
                                <option value="POLICE">Police</option>
                                <option value="DRRMO">DRRMO</option>
                              </select>
                            )}
                            {user.role === 'ADMIN' && user.department === 'MAIN' && (
                              <label className="flex items-center gap-1 text-[11px] font-semibold text-gray-600">
                                <input
                                  id={`admin-user-main-admin-${user.id}`}
                                  name={`admin-user-main-admin-${user.id}`}
                                  type="checkbox"
                                  checked={Boolean(user.isMainAdmin)}
                                  onChange={(event) => handleMainAdminChange(user, event.target.checked)}
                                  disabled={isActing}
                                />
                                Main admin
                              </label>
                            )}
                            <button
                              onClick={() => handleStatusToggle(user)}
                              disabled={isActing}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {user.status === 'INACTIVE' ? 'Activate' : 'Deactivate'}
                            </button>

                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!isLoading && userTotalPages > 1 && (
            <div className="px-5 py-4 border-t border-gray-100 flex justify-center">
              <ContinuousPagination
                totalPages={userTotalPages}
                value={userPage}
                onChange={setUserPage}
              />
            </div>
          )}

          {/* Footer count */}
          {!isLoading && users.length > 0 && (
            <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-400 flex justify-between items-center">
              <span>
                Showing <strong className="text-gray-700">{(userPage - 1) * USERS_PER_PAGE + 1}–{Math.min(userPage * USERS_PER_PAGE, users.length)}</strong> of <strong className="text-gray-700">{users.length}</strong> accounts — {adminCount} Admins, {userCount} Citizens
              </span>
              <span>Live data</span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
