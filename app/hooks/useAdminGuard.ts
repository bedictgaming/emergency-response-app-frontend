"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMe } from "@/lib/services/authService";
import { isDefinitiveAuthFailure } from "@/lib/apiClient";
import {
    ADMIN_ROLES,
    accountHome,
    getAdminDepartment,
    getDepartmentDashboardUrl,
    type AdminDepartment,
} from "@/lib/authorization";

export { getAdminDepartment, getDepartmentDashboardUrl } from "@/lib/authorization";
export type { AdminDepartment } from "@/lib/authorization";

/**
 * useAdminGuard — protects any admin page from citizen access and isolates
 * department administrators to their respective dashboards.
 *
 * @param requiredDepartment Optional department required for this specific dashboard.
 *   - Main Admin ('MAIN') has global access.
 *   - Department admins ('FIRE', 'POLICE', 'MEDICAL', 'DRRMO') are strictly confined
 *     to their respective dashboard and cannot view other departments' admin consoles.
 */
export function useAdminGuard(requiredDepartment?: AdminDepartment): boolean {
    const router = useRouter();
    const [isAuthorized, setIsAuthorized] = useState(false);
    const targetDepartment = requiredDepartment;

    useEffect(() => {
        let active = true;
        void getMe().then((user) => {
            if (!active) return;
            localStorage.setItem("user", JSON.stringify(user));

            if (!ADMIN_ROLES.has(user.role)) {
                router.replace(accountHome(user));
                return;
            }

            // Department-level security check
            const userDept = getAdminDepartment(user.department);
            if (!userDept) {
                localStorage.removeItem("user");
                router.replace("/");
                return;
            }

            if (targetDepartment) {
                // If Main Admin is required (e.g. /admin/main-dashboard or /admin/users),
                // but this user is a specific department admin, redirect them to their own dashboard.
                if (targetDepartment === "MAIN" && !user.isMainAdmin) {
                    router.replace(getDepartmentDashboardUrl(userDept));
                    return;
                }

                // If a specific department is required (e.g. FIRE), but this user belongs
                // to a different specific department (e.g. POLICE), redirect them to their own dashboard.
                if (targetDepartment !== "MAIN" && !user.isMainAdmin && userDept !== targetDepartment) {
                    router.replace(getDepartmentDashboardUrl(userDept));
                    return;
                }
            }

            // All checks passed
            setIsAuthorized(true);
        }).catch((error) => {
            if (!active) return;
            if (isDefinitiveAuthFailure(error)) {
                localStorage.removeItem("user");
                router.replace("/");
            }
        });
        return () => { active = false; };
    }, [router, targetDepartment]);

    return isAuthorized;
}
