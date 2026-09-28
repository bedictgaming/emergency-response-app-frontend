/* eslint-disable @next/next/no-img-element */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/button';
import { Shield, LogOut, Flame, Heart, AlertTriangle, MapPin, Layers3 } from 'lucide-react';
import { EmergencyReportForm } from './EmergencyReportForm';
import { EmergencyReportsList } from './EmergencyReportList';
import { HelpAndStatus } from './HelpAndStatus';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Card, CardContent } from './ui/card';
import { useGeolocation } from '../hooks/useGeolocation';
import type { User, EmergencyReport, EmergencyCategory, ResponseService } from '../types';
import { getMe, logout as logoutApi } from '@/lib/services/authService';
import { uploadIncidentPhoto } from '@/lib/services/uploadService';
import {
    createIncident,
    checkNearbyIncident,
    getIncidents,
    Incident,
} from '@/lib/services/incidentService';
import { getAdminDepartment, getDepartmentDashboardUrl } from '../hooks/useAdminGuard';
import { useEmergencyEvents } from '../hooks/useEmergencyEvents';
import { isDefinitiveAuthFailure, markSessionEnded } from '@/lib/apiClient';

const DAILY_REPORT_LIMIT = 2;
const manilaDateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
});

const mapIncidentToReport = (inc: Incident): EmergencyReport => {
    const typeName = inc.type?.typeName?.toLowerCase() || '';
    let category: EmergencyCategory = 'other';
    if (typeName.includes('fire')) category = 'fire';
    else if (typeName.includes('med')) category = 'medical';
    else if (typeName.includes('pol') || typeName.includes('sec')) category = 'police';
    else if (typeName.includes('haz') || typeName.includes('flood')) category = 'hazard';

    let status: 'pending' | 'in-progress' | 'resolved' = 'pending';
    if (inc.status === 'ACTIVE' || inc.status === 'RESPONDING') status = 'in-progress';
    else if (inc.status === 'RESOLVED' || inc.status === 'CLOSED') status = 'resolved';

    let desc = inc.description || '';
    let contact = '';
    const match = desc.match(/\[Contact:\s*([^\]]+)\]/);
    if (match) {
        contact = match[1];
        desc = desc.replace(match[0], '').trim();
    }

    return {
        id: inc.incidentId,
        category,
        requestedServices: inc.requestedServices,
        description: desc || inc.title,
        reporterName: inc.reporter?.name || 'Citizen Reporter',
        contactNumber: contact,
        location: inc.location?.address || inc.location?.locationName || 'Cordova',
        latitude: inc.latitude ? Number(inc.latitude) : undefined,
        longitude: inc.longitude ? Number(inc.longitude) : undefined,
        timestamp: inc.reportedAt,
        status,
        userId: inc.reportedBy,
        photoUrl: inc.attachments?.[0]?.fileUrl,
    };
};

const CITIZEN_REPORTS_PER_PAGE = 3;

export function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [reports, setReports] = useState<EmergencyReport[]>([]);
    const [reportPage, setReportPage] = useState(1);
    const [reportToFocus, setReportToFocus] = useState<string | null>(null);
    const [reportsLoaded, setReportsLoaded] = useState(false);
    const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState<EmergencyCategory | null>(null);
    const [isSubmittingReport, setIsSubmittingReport] = useState(false);
    const [submitError, setSubmitError] = useState<string>('');
    const [duplicateReportBlocked, setDuplicateReportBlocked] = useState(false);
    const submitErrorRef = useRef<HTMLDivElement>(null);
    const [reportsLoadError, setReportsLoadError] = useState(false);
    const reportsRequestInFlight = useRef(false);
    const { latitude, longitude, accuracy, error: locationError, loading: locationLoading, refreshLocation } = useGeolocation();
    const [manilaToday, setManilaToday] = useState(() => manilaDateFormatter.format(new Date()));

    useEffect(() => {
        if (submitError) submitErrorRef.current?.focus();
    }, [submitError]);

    useEffect(() => {
        // Reset the informational quota at Manila midnight without polling the API.
        const dayMs = 86_400_000;
        const manilaOffsetMs = 8 * 60 * 60 * 1000;
        const untilNextMidnight = () => dayMs - ((Date.now() + manilaOffsetMs) % dayMs) + 100;
        let timeout: number;
        const updateDay = () => {
            setManilaToday(manilaDateFormatter.format(new Date()));
            timeout = window.setTimeout(updateDay, untilNextMidnight());
        };
        timeout = window.setTimeout(updateDay, untilNextMidnight());
        return () => window.clearTimeout(timeout);
    }, []);

    const reportsToday = useMemo(() => {
        return reports.filter(report => manilaDateFormatter.format(new Date(report.timestamp)) === manilaToday);
    }, [reports, manilaToday]);
    const dailyReportCount = reportsToday.length;
    const remainingReportsToday = Math.max(0, DAILY_REPORT_LIMIT - dailyReportCount);
    const hasReachedDailyLimit = dailyReportCount >= DAILY_REPORT_LIMIT;
    const latestReport = useMemo(() => reports.reduce<EmergencyReport | null>((latest, report) => {
        if (!latest || new Date(report.timestamp).getTime() > new Date(latest.timestamp).getTime()) return report;
        return latest;
    }, null), [reports]);
    const userId = user?.id;

    const reportTotalPages = Math.max(1, Math.ceil(reports.length / CITIZEN_REPORTS_PER_PAGE));
    const paginatedReports = useMemo(() => {
        const start = (reportPage - 1) * CITIZEN_REPORTS_PER_PAGE;
        return reports.slice(start, start + CITIZEN_REPORTS_PER_PAGE);
    }, [reports, reportPage]);
    // Reset to page 1 when the total shrinks below the current page
    useEffect(() => {
        if (reportPage > reportTotalPages) setReportPage(1);
    }, [reportPage, reportTotalPages]);

    useEffect(() => {
        if (!reportToFocus || !paginatedReports.some(report => report.id === reportToFocus)) return;
        const reportCard = document.getElementById(`citizen-report-${reportToFocus}`);
        if (!reportCard) return;
        reportCard.focus({ preventScroll: true });
        reportCard.scrollIntoView({ block: 'start' });
        setReportToFocus(null);
    }, [paginatedReports, reportToFocus]);

    const viewLatestReport = useCallback(() => {
        if (!latestReport) return;
        const index = reports.findIndex(report => report.id === latestReport.id);
        if (index < 0) return;
        setReportPage(Math.floor(index / CITIZEN_REPORTS_PER_PAGE) + 1);
        setReportToFocus(latestReport.id);
    }, [latestReport, reports]);

    const fetchUserReports = useCallback(async (userId: string) => {
        // Stop visibility/focus polling immediately after this browser session
        // is logged out (including logout from another tab).
        // Password sessions may use a browser token; Google OAuth uses only an
        // HttpOnly cookie. The verified user record is present for both flows.
        if (typeof window !== 'undefined' && !localStorage.getItem('user')) return;
        if (reportsRequestInFlight.current) return;
        reportsRequestInFlight.current = true;
        try {
            const data = await getIncidents({ reportedBy: userId, includeAttachments: true, limit: 50 });
            setReports(data.map(mapIncidentToReport));
            setReportsLoaded(true);
            setReportsLoadError(false);
        } catch (err) {
            // A stopped API or temporary network outage is expected to be
            // recoverable. Keep the last reports and show a retry control
            // instead of producing a repeated Next.js console overlay.
            if (!isDefinitiveAuthFailure(err)) setReportsLoadError(true);
        } finally {
            reportsRequestInFlight.current = false;
        }
    }, []);

    useEffect(() => {
        // Fast local check: prevent admins from accessing citizen dashboard
        try {
            const raw = localStorage.getItem('user');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (['ADMIN', 'DISPATCHER'].includes(parsed?.role)) {
                    const dept = getAdminDepartment(parsed.department);
                    router.replace(dept ? getDepartmentDashboardUrl(dept) : '/');
                    return;
                }
                if (parsed?.role === 'RESPONDER') {
                    router.replace('/responder/tasks');
                    return;
                }
            }
        } catch {}

        // Verify user session with backend on page load
        const initUser = async () => {
            try {
                const backendUser = await getMe();
                // Block administrators and dispatchers from the citizen portal
                if (['ADMIN', 'DISPATCHER'].includes(backendUser.role)) {
                    const dept = getAdminDepartment(backendUser.department);
                    router.replace(dept ? getDepartmentDashboardUrl(dept) : '/');
                    return;
                }
                if (backendUser.role === 'RESPONDER') {
                    router.replace('/responder/tasks');
                    return;
                }
                const user = {
                    id: backendUser.id,
                    email: backendUser.email,
                    name: backendUser.name,
                    role: backendUser.role || 'USER',
                };
                setUser(user as User);
                localStorage.setItem('user', JSON.stringify(user));
                // Load past incidents reported by this user
                fetchUserReports(user.id);
            } catch (error) {
                if (isDefinitiveAuthFailure(error)) {
                    localStorage.removeItem('user');
                    localStorage.removeItem('accessToken');
                    localStorage.removeItem('refreshToken');
                    router.push('/');
                    return;
                }
                // Preserve the last verified session during temporary network/database outages.
                try {
                    const cached = JSON.parse(localStorage.getItem('user') || 'null') as User | null;
                    if (cached && !['ADMIN', 'DISPATCHER', 'RESPONDER'].includes(cached.role)) {
                        setUser(cached);
                        void fetchUserReports(cached.id);
                    }
                } catch {}
            }
        };

        initUser();
    }, [fetchUserReports, router]);

    useEffect(() => {
        const handleSessionChange = (event: StorageEvent) => {
            if (event.key === 'emergency-logout-epoch' && event.newValue) {
                setUser(null);
                setReports([]);
                setReportsLoaded(false);
                router.replace('/');
            }
        };
        window.addEventListener('storage', handleSessionChange);
        return () => window.removeEventListener('storage', handleSessionChange);
    }, [router]);

    const refreshUserReports = useCallback(() => {
        if (userId) void fetchUserReports(userId);
    }, [fetchUserReports, userId]);

    // Server-sent events deliver live changes. A slower visibility-aware poll
    // remains as recovery if the stream is interrupted by a poor connection.
    useEmergencyEvents(refreshUserReports, Boolean(user?.id));

    useEffect(() => {
        if (!userId) return;
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') void fetchUserReports(userId);
        };
        const interval = window.setInterval(refreshWhenVisible, 30_000);
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [fetchUserReports, userId]);

    const handleLogout = async () => {
        // Clearing component state first tears down its polling effects while
        // the authenticated logout request is still allowed to complete.
        setUser(null);
        setReports([]);
        setReportsLoaded(false);
        localStorage.removeItem('user');
        try {
            await logoutApi();
        } catch {
            // Ignore errors — always clear locally and redirect
        }
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        markSessionEnded();
        router.push('/');
    };

    const handleReportSubmit = async (report: Omit<EmergencyReport, 'id' | 'timestamp' | 'status' | 'userId'> & { photoFile?: File | null; barangayName?: string; requestedServices?: ResponseService[] }) => {
        if (!user || isSubmittingReport) return;
        if (!navigator.onLine) {
            setSubmitError('You are offline. Reconnect before submitting this emergency report.');
            return;
        }
        setIsSubmittingReport(true);
        setSubmitError('');
        setDuplicateReportBlocked(false);

        try {
            let resolvedBarangayName = report.barangayName;
            // Check first so an already-reported nearby emergency does not
            // waste time or bandwidth uploading another proof photo. The
            // create endpoint repeats this check atomically for race safety.
            if (report.latitude !== undefined && report.longitude !== undefined && report.barangayName) {
                try {
                    const nearby = await checkNearbyIncident({
                        category: report.category,
                        requestedServices: report.requestedServices,
                        barangayName: report.barangayName,
                        latitude: report.latitude,
                        longitude: report.longitude,
                    });
                    if (nearby.locationAccepted === false) {
                        setSubmitError(
                            nearby.message || 'Move the emergency pin within Cordova before submitting the report.',
                        );
                        return;
                    }
                    resolvedBarangayName = nearby.barangayName || resolvedBarangayName;
                    if (nearby.duplicate) {
                        setDuplicateReportBlocked(true);
                        setSubmitError(nearby.message || 'A similar active emergency has already been reported nearby. Your report was not submitted.');
                        return;
                    }
                } catch (preflightError: unknown) {
                    const status = (preflightError as { response?: { status?: number } })?.response?.status;
                    // Network/5xx/429 preflight failures cannot bypass the
                    // authoritative duplicate check in create. An invalid
                    // session or location must still stop before upload.
                    if (status && status < 500 && status !== 429) throw preflightError;
                }
            }

            // 1. If a photo was attached, upload it directly to Cloudinary
            if (!report.photoFile) {
                setSubmitError('A proof photo is required for citizen emergency reports.');
                setIsSubmittingReport(false);
                return;
            }
            let uploadedProof;
            if (report.photoFile) {
                try {
                    const uploadResult = await uploadIncidentPhoto(report.photoFile);
                    uploadedProof = uploadResult;
                } catch (uploadErr: unknown) {
                    const errMsg = uploadErr instanceof Error ? uploadErr.message : 'Photo upload failed';
                    setSubmitError(`Photo upload failed: ${errMsg}`);
                    setIsSubmittingReport(false);
                    return;
                }
            }

            // 2. Submit the incident to backend PostgreSQL
            const categoryUpper = (report.category || 'EMERGENCY').toUpperCase();
            await createIncident({
                title: `${categoryUpper} Emergency: ${report.location.slice(0, 40)}`,
                description: report.description,
                category: report.category,
                requestedServices: report.requestedServices,
                locationName: report.location,
                barangayName: resolvedBarangayName,
                address: report.location,
                latitude: report.latitude,
                longitude: report.longitude,
                reporterPhone: report.contactNumber,
                proofAttachment: uploadedProof ? {
                    publicId: uploadedProof.publicId,
                    fileName: uploadedProof.fileName,
                } : undefined,
            });

            // 3. Reload incidents from backend
            if (user?.id) {
                await fetchUserReports(user.id);
            }

            setIsReportDialogOpen(false);
            setSelectedCategory(null);
        } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number; data?: { message?: string; errorCode?: string } } };
            const status = axiosErr?.response?.status;
            const responseMessage = axiosErr?.response?.data?.message;
            const duplicateConflict = status === 409 && axiosErr?.response?.data?.errorCode === 'DUPLICATE_ACTIVE_INCIDENT';

            // A conflict is an expected workflow response (for example, an
            // existing active report or reused proof photo). Present it in the
            // form instead of logging an error that opens Next's dev overlay.
            if ([400, 409, 422, 429].includes(status ?? 0)) {
                setDuplicateReportBlocked(duplicateConflict);
                setSubmitError(responseMessage || 'The report conflicts with a recent change. Review your reports before retrying.');
                if ((status === 409 || status === 429) && user?.id) await fetchUserReports(user.id);
                return;
            }

            const msg = responseMessage || (err instanceof Error
                ? err.message
                : 'Failed to submit incident report. Please try again.');
            setSubmitError(msg);
            console.warn('Incident submission failed:', { status, message: msg });
        } finally {
            setIsSubmittingReport(false);
        }
    };

    const handleQuickReport = (category: EmergencyCategory) => {
        if (hasReachedDailyLimit) return;
        setSubmitError('');
        setDuplicateReportBlocked(false);
        setSelectedCategory(category);
        setIsReportDialogOpen(true);
    };

    const handleReportDialogChange = (open: boolean) => {
        setIsReportDialogOpen(open);
        if (!open) {
            setSelectedCategory(null);
            setSubmitError('');
            setDuplicateReportBlocked(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] dark:bg-slate-950">
            {/* Header */}
            <header className="sticky top-0 z-10 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center">
                                <img
                                    src="/emergency-icon.png"
                                    alt="Emergency Response"
                                    fetchPriority="low"
                                    className="h-10 w-10 rounded-xl object-contain"
                                />
                            </div>
                            <div>
                                <h1 className="text-base font-bold tracking-tight text-slate-950 sm:text-lg dark:text-white">Emergency Response</h1>
                                <p className="text-xs text-slate-600 dark:text-slate-400">Community reporting</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            <div className="text-right hidden sm:block">
                                <p className="text-sm font-medium text-slate-950 dark:text-white">{user?.name}</p>
                                <p className="text-xs text-slate-600 dark:text-slate-400">{user?.email}</p>
                            </div>
                            <Button onClick={handleLogout} variant="outline" size="sm" className="h-11 rounded-lg border-slate-300 bg-white px-4 font-semibold text-slate-900 shadow-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900">
                                <LogOut className="w-4 h-4 mr-2" />
                                Logout
                            </Button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 lg:px-8 lg:py-9">
                {reportsLoadError && (
                    <div role="alert" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                        <p>{reportsLoaded
                            ? 'Reports could not be refreshed. Check your connection; previously loaded reports remain visible.'
                            : 'Your reports could not be loaded. Check your connection and try again.'}</p>
                        <Button type="button" variant="outline" size="sm" onClick={refreshUserReports}>Retry reports</Button>
                    </div>
                )}
                {/* GPS Location Display */}
                <Card className="gps-location-card mb-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-none dark:border-slate-800 dark:bg-slate-900">
                    <CardContent className="p-4 sm:p-5">
                        <div className="flex items-center gap-3">
                            <div data-testid="gps-icon-tile" className="theme-inverse-surface flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                                <MapPin className="h-5 w-5 text-current" aria-hidden="true" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-slate-950 sm:text-base dark:text-white">Device location estimate</p>
                                {latitude !== null && longitude !== null ? (
                                    <>
                                    <p className="text-xs text-gray-600 dark:text-slate-300">
                                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                                        {accuracy !== null && ` · accurate to about ${Math.max(1, Math.round(accuracy))} m`}
                                    </p>
                                    {locationError && (
                                        <div className="mt-1 flex flex-wrap items-center gap-2">
                                            <p className="text-xs text-red-600 dark:text-red-400">Last fix only. {locationError}</p>
                                            <Button variant="outline" size="sm" onClick={refreshLocation} className="h-6 border-red-200 px-2 py-0 text-xs text-red-600 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800">Retry</Button>
                                        </div>
                                    )}
                                    {locationLoading && !locationError && <p className="text-xs text-amber-700 dark:text-amber-300">Refreshing GPS estimate; confirm the incident pin manually.</p>}
                                    </>
                                ) : locationError ? (
                                    <div className="flex items-center gap-2">
                                        <p className="text-xs text-red-600 dark:text-red-400">{locationError}</p>
                                        <Button variant="outline" size="sm" onClick={refreshLocation} className="h-6 border-red-200 px-2 py-0 text-xs text-red-600 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-slate-800">Retry</Button>
                                    </div>
                                ) : (
                                    <p className="text-xs text-gray-600 dark:text-slate-300">Detecting location...</p>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <HelpAndStatus
                    variant="summary"
                    className="mb-6 xl:hidden"
                    reportsLoaded={reportsLoaded}
                    reportsLoadError={reportsLoadError}
                    dailyReportCount={dailyReportCount}
                    remainingReportsToday={remainingReportsToday}
                    latestReport={latestReport}
                    onViewReport={viewLatestReport}
                />

                <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="min-w-0">
                {/* Emergency category shortcuts */}
                <div className="mb-8">
                    <div className="mb-5">
                        <h2 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Choose emergency type</h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Select the response service you need. You can request multiple services in the report form.</p>
                    </div>

                    <div className={`grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4 ${hasReachedDailyLimit ? 'select-none opacity-50' : ''}`}>
                        {/* Fire */}
                        <button
                            type="button"
                            disabled={hasReachedDailyLimit}
                            aria-label="Report a fire emergency"
                            aria-haspopup="dialog"
                            className="motion-choice motion-press group min-h-36 cursor-pointer rounded-2xl border border-slate-200 bg-white transition-colors duration-200 hover:border-red-300 hover:bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-900 dark:hover:bg-red-950/20"
                            onClick={() => handleQuickReport('fire')}
                        >
                            <CardContent className="flex flex-col items-center justify-center gap-3 p-5 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-600 text-white">
                                    <Flame className="h-7 w-7" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-950 dark:text-white">Fire</h3>
                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Fire response</p>
                                </div>
                            </CardContent>
                        </button>

                        {/* Medical */}
                        <button
                            type="button"
                            disabled={hasReachedDailyLimit}
                            aria-label="Report a medical emergency"
                            aria-haspopup="dialog"
                            className="motion-choice motion-press group min-h-36 cursor-pointer rounded-2xl border border-slate-200 bg-white transition-colors duration-200 hover:border-red-300 hover:bg-red-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:hover:border-red-900 dark:hover:bg-red-950/20"
                            onClick={() => handleQuickReport('medical')}
                        >
                            <CardContent className="flex flex-col items-center justify-center gap-3 p-5 text-center">
                                <div data-testid="medical-icon-tile" className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-50 text-red-600 ring-1 ring-inset ring-red-200 dark:bg-red-950/40 dark:text-red-100 dark:ring-red-900">
                                    <Heart className="h-7 w-7 text-current" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-950 dark:text-white">Medical</h3>
                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Medical response</p>
                                </div>
                            </CardContent>
                        </button>

                        {/* Police */}
                        <button
                            type="button"
                            disabled={hasReachedDailyLimit}
                            aria-label="Report a police emergency"
                            aria-haspopup="dialog"
                            className="motion-choice motion-press group min-h-36 cursor-pointer rounded-2xl border border-slate-200 bg-white transition-colors duration-200 hover:border-slate-400 hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                            onClick={() => handleQuickReport('police')}
                        >
                            <CardContent className="flex flex-col items-center justify-center gap-3 p-5 text-center">
                                <div data-testid="police-icon-tile" className="theme-inverse-surface flex h-14 w-14 items-center justify-center rounded-xl">
                                    <Shield className="h-7 w-7 text-current" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-950 dark:text-white">Police</h3>
                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Police response</p>
                                </div>
                            </CardContent>
                        </button>

                        {/* Hazard */}
                        <button
                            type="button"
                            disabled={hasReachedDailyLimit}
                            aria-label="Report a hazard emergency"
                            aria-haspopup="dialog"
                            className="motion-choice motion-press group min-h-36 cursor-pointer rounded-2xl border border-slate-200 bg-white transition-colors duration-200 hover:border-amber-300 hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed dark:border-slate-800 dark:bg-slate-900 dark:hover:border-amber-800 dark:hover:bg-amber-950/20"
                            onClick={() => handleQuickReport('hazard')}
                        >
                            <CardContent className="flex flex-col items-center justify-center gap-3 p-5 text-center">
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900">
                                    <AlertTriangle className="h-7 w-7" aria-hidden="true" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-950 dark:text-white">Hazard</h3>
                                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">Hazard response</p>
                                </div>
                            </CardContent>
                        </button>
                    </div>

                    <button
                        type="button"
                        disabled={hasReachedDailyLimit}
                        aria-label="Report an emergency that needs other or multiple services"
                        aria-haspopup="dialog"
                        className="motion-choice motion-press mt-3 flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 text-left transition-colors hover:border-slate-400 hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
                        onClick={() => handleQuickReport('other')}
                    >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                            <Layers3 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span>
                            <span className="block text-sm font-bold text-slate-950 dark:text-white">Other or multiple services</span>
                            <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-400">Request help from two or more response services.</span>
                        </span>
                    </button>
                </div>

                <HelpAndStatus
                    variant="details"
                    className="mb-8 xl:hidden"
                    reportsLoaded={reportsLoaded}
                    reportsLoadError={reportsLoadError}
                    dailyReportCount={dailyReportCount}
                    remainingReportsToday={remainingReportsToday}
                    latestReport={latestReport}
                    onViewReport={viewLatestReport}
                />

                {/* Reports List */}
                {!reportsLoaded ? (
                    <section aria-label="Your reports" className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                        <h2 className="text-xl font-bold text-slate-950 dark:text-white">Your reports</h2>
                        {reportsLoadError ? (
                            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Report history is unavailable. Use Retry reports above to check again.</p>
                        ) : (
                            <div role="status" aria-label="Loading reports" className="mt-4 space-y-3">
                                <div className="h-5 w-3/4 animate-pulse rounded bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" />
                                <div className="h-5 w-1/2 animate-pulse rounded bg-slate-200 motion-reduce:animate-none dark:bg-slate-800" />
                            </div>
                        )}
                    </section>
                ) : (
                    <EmergencyReportsList
                        reports={paginatedReports}
                        page={reportPage}
                        totalPages={reportTotalPages}
                        totalReports={reports.length}
                        onPageChange={setReportPage}
                    />
                )}
                </div>
                <HelpAndStatus
                    variant="full"
                    className="hidden xl:block"
                    reportsLoaded={reportsLoaded}
                    reportsLoadError={reportsLoadError}
                    dailyReportCount={dailyReportCount}
                    remainingReportsToday={remainingReportsToday}
                    latestReport={latestReport}
                    onViewReport={viewLatestReport}
                />
                </div>
            </main>

            {/* Figma-style report modal */}
            <Dialog open={isReportDialogOpen} onOpenChange={handleReportDialogChange}>
                <DialogContent
                    style={{ height: '455px', maxHeight: 'calc(100dvh - 2rem)', maxWidth: '488px' }}
                    className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-0 shadow-2xl"
                >
                    <DialogHeader>
                        <DialogTitle>Report Emergency</DialogTitle>
                        <DialogDescription>Fill out the form to report an emergency.</DialogDescription>
                    </DialogHeader>

                    {submitError && (
                        <div ref={submitErrorRef} role="alert" tabIndex={-1} className="mb-5 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800 outline-none focus-visible:ring-2 focus-visible:ring-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-100">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <div className="min-w-0">
                                <p className="font-medium">{submitError}</p>
                                {duplicateReportBlocked && (
                                    <a href="tel:911" className="mt-2 inline-flex min-h-11 items-center rounded-md font-semibold underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600">
                                        Separate or worsening emergency? Call 911
                                    </a>
                                )}
                            </div>
                        </div>
                    )}

                    {isSubmittingReport && (
                        <div role="status" className="mb-5 flex items-center justify-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
                            <svg className="h-5 w-5 animate-spin text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            <span className="text-sm font-medium text-foreground">Checking and submitting your report…</span>
                        </div>
                    )}

                    <EmergencyReportForm
                        submitting={isSubmittingReport}
                        onSubmit={handleReportSubmit}
                        onCancel={() => handleReportDialogChange(false)}
                        defaultName={user?.name || ''}
                        defaultCategory={selectedCategory}
                        latitude={locationError || locationLoading ? null : latitude}
                        longitude={locationError || locationLoading ? null : longitude}
                    />
                </DialogContent>
            </Dialog>
        </div>
    );
}
