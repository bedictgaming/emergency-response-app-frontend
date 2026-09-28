"use client";

import React, { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, MapPin, Users, PieChart, ArrowLeft } from "lucide-react";
import { logout } from "@/lib/services/authService";
import { getAdminDepartment, getDepartmentDashboardUrl } from "@/app/hooks/useAdminGuard";
import BarangayHistoryDrawer from "@/app/component/admin/BarangayHistoryDrawer";
import AdminEmergencyMonitor from "@/app/component/admin/AdminEmergencyMonitor";
import { registerWebPush, unregisterWebPush } from "@/lib/browserPush";
import { markSessionEnded } from "@/lib/apiClient";
import type { ResponseService } from "@/lib/services/incidentService";

interface AdminHeaderProps {
  title: string;
  subtitle: string;
  departmentIcon: React.ReactNode;
  iconBgClass?: string;
  badgeBorderClass?: string;
  showBackButton?: boolean;
  backUrl?: string;
  monitorService?: ResponseService;
}

export default function AdminHeader({
  title,
  subtitle,
  departmentIcon,
  iconBgClass = "bg-white",
  badgeBorderClass = "border-gray-700",
  showBackButton,
  backUrl,
  monitorService,
}: AdminHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [dashboardUrl, setDashboardUrl] = useState("/admin/main-dashboard");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) {
        const u = JSON.parse(raw);
        const dept = getAdminDepartment(u.department);
        setIsMainAdmin(u.isMainAdmin === true);
        setDashboardUrl(dept ? getDepartmentDashboardUrl(dept) : "/");
      }
    } catch {
      // Ignore
    }
    void registerWebPush().catch(() => undefined);
  }, []);

  // Determine if back button should be shown (either explicitly via prop, or automatically when on secondary pages like /admin/analytics)
  const isSecondaryPage =
    pathname?.includes("/admin/analytics") ||
    pathname?.includes("/admin/users") ||
    pathname?.includes("/admin/barangay-history");
  const shouldShowBack = showBackButton ?? isSecondaryPage;

  const handleBack = () => {
    if (backUrl) {
      router.push(backUrl);
    } else {
      router.push(dashboardUrl);
    }
  };

  const handleLogout = () => {
    if (isLoggingOut || typeof window === "undefined") return;
    setIsLoggingOut(true);

    // Start remote cleanup while the admin cookie is still available. Both
    // requests are best effort and must never prevent local logout.
    void unregisterWebPush().catch(() => undefined);
    void logout().catch(() => undefined);

    localStorage.removeItem("user");
    markSessionEnded();

    // A hard replacement also stops mounted guards and live dashboard effects
    // from racing the logout navigation with stale state.
    window.location.replace("/");
  };

  return (
    <>
      <header className="figma-admin-header sticky top-0 z-40 border-b border-white/70 bg-white/90 px-4 py-3 text-slate-900 shadow-sm backdrop-blur-xl sm:px-6">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-3">
        {/* Department Info & Navigation */}
        <div className="flex min-w-0 items-center gap-3.5">
          {shouldShowBack && (
            <button
              type="button"
              onClick={handleBack}
              className="group flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white/80 text-slate-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-md dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
              title="Return to Dashboard"
              aria-label="Back to Dashboard"
            >
              <ArrowLeft size={18} className="transition-transform group-hover:-translate-x-0.5" />
            </button>
          )}

          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 shadow-lg shadow-indigo-500/10 ${badgeBorderClass} ${iconBgClass}`}
          >
            {departmentIcon}
          </div>
          <div className="min-w-0">
            <h1 className="truncate bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-lg font-extrabold tracking-tight text-transparent sm:text-xl">{title}</h1>
            <p className="truncate text-xs font-medium text-slate-500">{subtitle}</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 sm:gap-3 sm:pb-0">
          {/* Real-time Emergency Siren & Incoming Report Monitor */}
          <AdminEmergencyMonitor responseService={monitorService} />

          {/* Barangay History Quick Drawer */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-purple-200 bg-purple-50/90 p-2.5 text-xs font-bold text-purple-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-purple-100 hover:shadow-md dark:border-purple-800 dark:bg-purple-950/60 dark:text-purple-200 dark:hover:bg-purple-900/70"
            title="Open Barangay Incident History Log"
          >
            <MapPin size={16} className="text-purple-400" />
            <span>Barangay History Log</span>
          </button>

          {/* Dedicated Full Analytics Hub Shortcut */}
          <button
            onClick={() => router.push("/admin/analytics")}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/90 p-2.5 text-xs font-semibold text-indigo-700 shadow-sm transition-all hover:-translate-y-0.5 hover:bg-indigo-100 hover:shadow-md dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-200 dark:hover:bg-indigo-900/70 md:flex"
            title="Go to Analytics & Intelligence Hub"
          >
            <PieChart size={15} className="text-indigo-400" />
            <span>Analytics</span>
          </button>

          {/* User Management Shortcut (Main Admin Only) */}
          {isMainAdmin && (
            <button
              onClick={() => router.push("/admin/users")}
              className="hidden shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white/80 p-2.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-md dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-700 dark:hover:text-indigo-300 md:flex"
              title="Go to User & Personnel Management"
            >
              <Users size={15} className="text-purple-400" />
              <span>Users</span>
            </button>
          )}

          {/* Logout */}
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:text-indigo-700 hover:shadow-md dark:border-slate-700 dark:text-slate-200 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
            aria-label={isLoggingOut ? "Logging out" : "Logout"}
          >
            <LogOut size={15} />
            {isLoggingOut ? "Logging out…" : "Logout"}
          </button>
        </div>
        </div>
      </header>

      {/* Slide-over Barangay History Drawer */}
      <BarangayHistoryDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </>
  );
}
