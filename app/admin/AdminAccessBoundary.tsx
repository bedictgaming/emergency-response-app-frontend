"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { getMe, getMeFresh } from "@/lib/services/authService";
import { isDefinitiveAuthFailure, markSessionEnded } from "@/lib/apiClient";
import { ADMIN_ROLES, accountHome, getAdminDepartment } from "@/lib/authorization";

/**
 * Protects the complete /admin route tree using the role returned by the API.
 * Local storage is only a cache for display; it is never an authorization source.
 */
export default function AdminAccessBoundary({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [verificationUnavailable, setVerificationUnavailable] = useState(false);
  const [accountSwitched, setAccountSwitched] = useState(false);
  const [switchPending, setSwitchPending] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const hasVerifiedAdmin = useRef(false);
  const verifiedAccount = useRef<string | null>(null);
  const accountSwitchedRef = useRef(false);

  useEffect(() => {
    let active = true;

    const pauseForAccountChange = () => {
      accountSwitchedRef.current = true;
      hasVerifiedAdmin.current = false;
      setAuthorized(false);
      setAccountSwitched(true);
    };

    const verifyAccess = async (blockPage: boolean, retryAfterRefresh = true) => {
      if (accountSwitchedRef.current) return;
      // Only the first visit is blocking. Focus/visibility rechecks happen in
      // the background so returning to the tab does not flash a loading page.
      if (blockPage) setAuthorized(false);
      setVerificationUnavailable(false);
      const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
      const sessionGeneration = localStorage.getItem('emergency-session-generation');
      try {
        const user = await getMe();
        if (!active || accountSwitchedRef.current) return;
        // A response started before logout must not restore the admin view.
        // The logout marker can change while /admin/me is in flight.
        if (localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) {
          hasVerifiedAdmin.current = false;
          setAuthorized(false);
          router.replace("/");
          return;
        }
        // Cookie refresh rotates this marker too. Verify once more with the
        // current session instead of leaving the first visit blocked forever.
        // A real account switch is still checked against verifiedAccount below.
        if (localStorage.getItem('emergency-session-generation') !== sessionGeneration) {
          if (retryAfterRefresh) {
            await verifyAccess(blockPage, false);
          } else {
            setAuthorized(false);
            setVerificationUnavailable(true);
          }
          return;
        }

        const accountIdentity = `${user.id}:${user.role}:${user.department ?? ''}:${user.isMainAdmin === true}`;
        if (verifiedAccount.current && verifiedAccount.current !== accountIdentity) {
          pauseForAccountChange();
          return;
        }

        // Replace any stale or forged client-side role with the database-backed admin user.
        localStorage.setItem("user", JSON.stringify(user));
        if (!ADMIN_ROLES.has(user.role) || !getAdminDepartment(user.department)) {
          hasVerifiedAdmin.current = false;
          setAuthorized(false);
          router.replace(accountHome(user));
          return;
        }

        verifiedAccount.current = accountIdentity;
        hasVerifiedAdmin.current = true;
        setAuthorized(true);
      } catch (error) {
        if (!active || accountSwitchedRef.current) return;
        if (!isDefinitiveAuthFailure(error)) {
          if (hasVerifiedAdmin.current) setAuthorized(true);
          else setVerificationUnavailable(true);
          return;
        }
        hasVerifiedAdmin.current = false;
        setAuthorized(false);
        localStorage.removeItem("user");
        markSessionEnded();
        router.replace("/");
      }
    };

    void verifyAccess(!hasVerifiedAdmin.current);
    const revalidateWhenVisible = () => {
      if (document.visibilityState === "visible") void verifyAccess(false);
    };
    const revalidateOnFocus = () => void verifyAccess(false);
    const handleSessionChange = (event: StorageEvent) => {
      if (event.key === 'emergency-logout-epoch' && event.newValue) {
        hasVerifiedAdmin.current = false;
        setAuthorized(false);
        router.replace("/");
      } else if (event.key === 'user' && verifiedAccount.current) {
        // All tabs in one browser profile share the same HttpOnly cookies.
        // Stop this tab before it can show another account's scoped API data.
        try {
          const nextUser = JSON.parse(event.newValue ?? 'null');
          const nextIdentity = `${nextUser?.id}:${nextUser?.role}:${nextUser?.department ?? ''}:${nextUser?.isMainAdmin === true}`;
          if (nextIdentity !== verifiedAccount.current) pauseForAccountChange();
        } catch {
          pauseForAccountChange();
        }
      } else if (event.key === 'emergency-session-generation' && !accountSwitchedRef.current) {
        void verifyAccess(false);
      }
    };
    window.addEventListener("focus", revalidateOnFocus);
    window.addEventListener("storage", handleSessionChange);
    document.addEventListener("visibilitychange", revalidateWhenVisible);

    return () => {
      active = false;
      window.removeEventListener("focus", revalidateOnFocus);
      window.removeEventListener("storage", handleSessionChange);
      document.removeEventListener("visibilitychange", revalidateWhenVisible);
    };
  }, [router]);

  const openCurrentAccount = async () => {
    if (switchPending) return;
    setSwitchPending(true);
    setSwitchError("");
    const generation = localStorage.getItem('emergency-session-generation');
    const logoutEpoch = localStorage.getItem('emergency-logout-epoch');
    try {
      // Do not reload the old department route: that briefly mounts its admin
      // tree before the page guard can redirect to the new account's home.
      const user = await getMeFresh();
      if (localStorage.getItem('emergency-session-generation') !== generation
        || localStorage.getItem('emergency-logout-epoch') !== logoutEpoch) {
        setSwitchError('The browser account changed again. Please retry.');
        return;
      }
      window.location.replace(accountHome(user));
    } catch (error) {
      if (!isDefinitiveAuthFailure(error)) {
        setSwitchError('Could not verify the current account. Please retry.');
      }
    } finally {
      setSwitchPending(false);
    }
  };

  if (!authorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50" aria-busy="true">
        {accountSwitched ? (
          <div className="max-w-sm px-6 text-center">
            <p className="text-sm font-semibold text-slate-900">Another account signed in to this browser.</p>
            <p className="mt-2 text-sm text-slate-600">This dashboard is paused so it cannot show another department&apos;s reports. Use separate browser profiles to keep both accounts open.</p>
            <button type="button" onClick={() => void openCurrentAccount()} disabled={switchPending} className="mt-4 min-h-11 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{switchPending ? 'Checking account…' : "Open current account's dashboard"}</button>
            {switchError && <p role="alert" className="mt-3 text-sm text-red-700">{switchError}</p>}
          </div>
        ) : verificationUnavailable ? (
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-700">Authorization service is temporarily unavailable.</p>
            <p className="mt-1 text-xs text-slate-500">Your session was kept. Reconnect, then retry.</p>
            <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white">Retry</button>
          </div>
        ) : <LoadingPlaceholder label="Verifying authorized access…" rows={2} className="max-w-sm" />}
      </main>
    );
  }

  return children;
}
