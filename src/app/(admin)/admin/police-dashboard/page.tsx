"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Shield, BarChart2, AlertTriangle, ShieldCheck, 
  MapPin, Phone, RefreshCw, Copy, Check
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import ReporterIdentity from "@/components/admin/ReporterIdentity";
import { ReportContactNumber } from "@/components/shared/ReportContactNumber";
import { FalseReportRetentionNotice } from "@/components/admin/FalseReportRetentionNotice";
import { reportContactHref } from "@/lib/reportContact";
import { IncidentLocationMap } from "@/components/shared/IncidentLocationMap";
import {
    getIncidentPage,
    updateIncidentServiceResponse,
    formatIncidentForDashboard,
    DashboardIncident,
    IncidentDashboardTab,
    incidentReportViewForTab,
    IncidentSummary,
    DEPARTMENT_INCIDENT_PAGE_SIZE,
    incidentServiceStatusesForTab,
} from "@/lib/services/incidentService";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { useDepartmentResponseAuthority } from "@/hooks/useDepartmentResponseAuthority";
import { useEmergencyEvents } from "@/hooks/useEmergencyEvents";
import IncidentPager from "@/components/admin/IncidentPager";
import { CompactEvidencePhoto } from "@/components/shared/SecureEvidencePhoto";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { NearbyReviewQueue } from '@/components/admin/NearbyReviewQueue';
import IncidentReviewQueue from '@/components/admin/IncidentReviewQueue';

export default function PoliceAdminDashboard() {
    const isAuthorized = useAdminGuard("POLICE");
    const canResolveResponse = useDepartmentResponseAuthority("POLICE", isAuthorized);
    const [activeTab, setActiveTab] = useState<Exclude<IncidentDashboardTab, "All" | "Active">>("Responding");
    const selectedView = useRef('Responding:1');
    const [emergencies, setEmergencies] = useState<DashboardIncident[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    useEffect(() => { selectedView.current = `${activeTab}:${page}`; }, [activeTab, page]);
    const [pagination, setPagination] = useState({ pages: 0, total: 0 });
    const [summary, setSummary] = useState<IncidentSummary>({ total: 0, active: 0, responding: 0, resolved: 0 });
    const incidentRequestInFlight = useRef(false);
    const reloadPending = useRef(false);
    const viewChangePending = useRef(false);
    const inFlightView = useRef<string | null>(null);
    const latestLoadIncidents = useRef<() => Promise<void>>(async () => {});

    const handleCopyPhone = (phone: string, id: string) => {
        if (!phone || phone === "Not provided") return;
        navigator.clipboard.writeText(phone);
        setCopiedPhoneId(id);
        setTimeout(() => setCopiedPhoneId(null), 2000);
    };

    const loadIncidents = useCallback(async () => {
        if (!isAuthorized) return;
        const view = `${activeTab}:${page}`;
        if (incidentRequestInFlight.current) {
            reloadPending.current = true;
            if (inFlightView.current !== view) viewChangePending.current = true;
            return;
        }
        incidentRequestInFlight.current = true;
        inFlightView.current = view;
        const accountAtStart = adminAccountSnapshot();
        let succeeded = false;
        try {
            const result = await getIncidentPage({
                department: "POLICE",
                includeAttachments: true,
                reportView: incidentReportViewForTab(activeTab),
                includeReviewFlags: true,
                limit: DEPARTMENT_INCIDENT_PAGE_SIZE,
                page,
                responseService: "POLICE",
                serviceStatuses: incidentServiceStatusesForTab(activeTab),
            });
            if (adminAccountSnapshot() !== accountAtStart || selectedView.current !== view) return;
            setListError(null);
            if (result.pagination.pages > 0 && page > result.pagination.pages) {
                setPage(result.pagination.pages);
                return;
            }
            const data = result.incidents;
            setPagination({ pages: result.pagination.pages, total: result.pagination.total });
            setSummary(result.summary);
            // Filter for Police incidents only
            const policeOnly = data
                .map(item => formatIncidentForDashboard(item, "POLICE"))
                .filter((item) => item.services.includes("Police") && (item.status === 'false report' || item.raw.verificationStatus === "VERIFIED"));
            setEmergencies(policeOnly);
            setLoadError(false);
            succeeded = true;
        } catch (err) {
            if (adminAccountSnapshot() === accountAtStart && selectedView.current === view) {
                setEmergencies([]);
                setListError('Report list could not be refreshed. Retry to load the selected view.');
            }
            if (adminAccountSnapshot() === accountAtStart) {
                console.warn("Failed to load police emergencies:", err);
                setLoadError(true);
            }
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
            incidentRequestInFlight.current = false;
            inFlightView.current = null;
            const shouldReload = reloadPending.current && (succeeded || viewChangePending.current);
            reloadPending.current = false;
            viewChangePending.current = false;
            if (shouldReload) {
                void latestLoadIncidents.current();
            }
        }
    }, [activeTab, isAuthorized, page]);

    useEffect(() => {
        latestLoadIncidents.current = loadIncidents;
    }, [loadIncidents]);

    useEmergencyEvents(loadIncidents, isAuthorized);

    useEffect(() => {
        void loadIncidents();
        const refreshWhenVisible = () => {
            if (document.visibilityState === 'visible') void loadIncidents();
        };
        const timer = window.setInterval(refreshWhenVisible, 30_000);
        window.addEventListener('focus', refreshWhenVisible);
        document.addEventListener('visibilitychange', refreshWhenVisible);
        return () => {
            window.clearInterval(timer);
            window.removeEventListener('focus', refreshWhenVisible);
            document.removeEventListener('visibilitychange', refreshWhenVisible);
        };
    }, [loadIncidents]);

    if (!isAuthorized) return null;

    const handleUpdateStatus = async (id: string, newStatus: 'ACTIVE' | 'RESOLVED' | 'CLOSED') => {
        if (newStatus === 'RESOLVED' && !canResolveResponse) return;
        if (actionLoadingId === id) return;
        setActionLoadingId(id);
        try {
            await updateIncidentServiceResponse(id, "POLICE", newStatus === 'RESOLVED' ? 'RESOLVED' : 'RESPONDING');
            await loadIncidents();
        } catch (err: unknown) {
            await loadIncidents();
            const message = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
            alert(message || "Could not update incident status. Please try again.");
        } finally {
            setActionLoadingId(null);
        }
    };

    const activeCount = summary.active;
    const respondingCount = summary.responding;
    const resolvedCount = summary.resolved;

    const tabs = [
        { name: "Responding" as const, count: respondingCount },
        { name: "Resolved" as const, count: resolvedCount },
        { name: "Cancelled" as const, count: summary.cancelled ?? 0 },
        { name: "False Reports" as const, count: summary.falseReports ?? 0 },
    ];

    const currentTabIncidents = emergencies;

    return (
        <div className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 pb-10 font-sans">
            {/* Header */}
            <AdminHeader
                monitorService="POLICE"
                title="Police Emergency Dashboard"
                subtitle="Police Department - POLICE ADMIN"
                departmentIcon={<Shield className="text-blue-600" size={28} />}
                badgeBorderClass="border-blue-500"
            />

            <main className="max-w-6xl mx-auto px-6 mt-8">
                {loadError && (
                    <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <span>Police emergencies could not be refreshed. Previously loaded reports remain visible.</span>
                        <button type="button" onClick={() => void loadIncidents()} className="shrink-0 font-semibold underline">Try again</button>
                    </div>
                )}
                {/* Top Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between h-32">
                        <div className="text-gray-500 text-sm font-medium">Total Emergencies</div>
                        <div className="flex justify-between items-end">
                            <div className="text-4xl font-bold">{summary.total}</div>
                            <BarChart2 className="text-gray-800" size={28} />
                        </div>
                    </div>

                    <div className="bg-[#ffe4e6] p-5 rounded-xl shadow-sm border border-red-100 flex flex-col justify-between h-32">
                        <div className="text-red-500 text-sm font-medium">Active</div>
                        <div className="flex justify-between items-end">
                            <div className="text-4xl font-bold text-red-500">{activeCount}</div>
                            <AlertTriangle className="text-red-600" size={28} />
                        </div>
                    </div>

                    <div className="bg-[#e0f2fe] p-5 rounded-xl shadow-sm border border-blue-100 flex flex-col justify-between h-32">
                        <div className="text-blue-500 text-sm font-medium">Responding</div>
                        <div className="flex justify-between items-end">
                            <div className="text-4xl font-bold text-blue-500">{respondingCount}</div>
                            <ShieldCheck className="text-blue-500" size={28} />
                        </div>
                    </div>

                    <div className="bg-[#dcfce7] p-5 rounded-xl shadow-sm border border-green-100 flex flex-col justify-between h-32">
                        <div className="text-green-500 text-sm font-medium">Resolved</div>
                        <div className="flex justify-between items-end">
                            <div className="text-4xl font-bold text-green-500">{resolvedCount}</div>
                            <ShieldCheck className="text-green-500" size={28} />
                        </div>
                    </div>
                </div>

                {/* Report Section */}
                <NearbyReviewQueue onChanged={loadIncidents} />
                <IncidentReviewQueue mainAdmin={false} onChanged={loadIncidents} />
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-bold">Police Emergency Reports</h2>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                            Police reports
                        </span>
                    </div>
                    <button
                        onClick={() => { setIsRefreshing(true); loadIncidents(); }}
                        className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer hover:bg-gray-50"
                        title="Force refresh police feed"
                    >
                        <RefreshCw size={13} className={isRefreshing ? "animate-spin text-blue-600" : ""} />
                        <span>Refresh</span>
                    </button>
                </div>

                {/* Tabs */}
                <div aria-label="Report record views" className="mb-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted p-1 sm:grid-cols-4">
                    {tabs.map((tab) => (
                        <button
                            key={tab.name}
                            type="button"
                            aria-pressed={activeTab === tab.name}
                            onClick={() => {
                                if (activeTab === tab.name && page === 1) return;
                                selectedView.current = `${tab.name}:1`;
                                setPage(1);
                                setActiveTab(tab.name);
                                setEmergencies([]);
                                setIsLoading(true);
                                setListError(null);
                            }}
                            className={`min-h-11 min-w-0 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${activeTab === tab.name
                                    ? "bg-foreground text-background"
                                    : "text-foreground hover:bg-background"
                                }`}
                        >
                            {tab.name} ({tab.count})
                        </button>
                    ))}
                </div>

                {/* List */}
                {listError && <div role="alert" className="mb-4 border-y border-border py-4 text-base text-foreground"><p>{listError}</p><button type="button" onClick={() => void loadIncidents()} className="mt-2 min-h-11 rounded-lg border border-border px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-ring">Retry report list</button></div>}
                {activeTab === 'False Reports' && <p className="mb-4 max-w-prose text-base leading-relaxed text-foreground">Whole-confirmed false reports are retained here automatically. No Resolve action is needed. Records remain newest first, with five per page.</p>}
                <div role="region" aria-label="Department report records" className="space-y-4">
                    {currentTabIncidents.map((item) => (
                        <div key={item.id} className="motion-list-item bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white bg-blue-700">
                                            {item.services.length > 1 ? item.services.join(" + ") : item.type}
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${item.status === 'resolved' ? 'bg-gray-400' :
                                                item.status === 'responding' ? 'bg-[#111827]' : 'bg-red-600'
                                            }`}>
                                            {item.status.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-gray-400 ml-1">{item.time}</span>
                                    </div>
                                    <h3 className="font-bold text-[15px] text-gray-900">{item.title}</h3>
                                </div>
                            </div>

                            {/* Incident Description */}
                            {item.description && (
                                <div className="mb-4 p-3 bg-blue-50/50 rounded-lg border border-blue-100">
                                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-wider block mb-1">
                                        Report Description / Emergency Details
                                    </span>
                                    <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">
                                        {item.description}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 mb-4">
                                <ReporterIdentity name={item.reporter} email={item.raw.reporter?.email} />
                                <div className="flex items-center justify-between gap-2 text-gray-600 text-sm flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <Phone size={14} className="text-gray-400 shrink-0" />
                                        <span>Contact: <strong><ReportContactNumber phone={item.phone} /></strong></span>
                                    </div>
                                    {item.phone && item.phone !== "Not provided" && (
                                        <div className="flex items-center gap-1.5">
                                            {reportContactHref(item.phone) && <a
                                                href={reportContactHref(item.phone) ?? undefined}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors shadow-2xs"
                                                title={`Call ${item.reporter} (${item.phone})`}
                                            >
                                                <Phone size={12} className="text-emerald-600" />
                                                <span>Call Contact</span>
                                            </a>}
                                            <button
                                                type="button"
                                                onClick={() => handleCopyPhone(item.phone, item.id)}
                                                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-gray-50 text-gray-700 text-xs font-semibold border border-gray-200 transition-colors cursor-pointer shadow-2xs"
                                                title="Copy phone number"
                                            >
                                                {copiedPhoneId === item.id ? (
                                                    <>
                                                        <Check size={12} className="text-emerald-600" />
                                                        <span className="text-emerald-700 text-[11px] font-bold">Copied</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Copy size={12} className="text-gray-400" />
                                                        <span className="text-[11px]">Copy</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2.5 text-gray-600 text-sm md:col-span-2">
                                    <MapPin size={14} className="text-red-500 shrink-0" />
                                    <span>Location: <strong>{item.location}</strong></span>
                                </div>
                            </div>

                            <FalseReportRetentionNotice incident={item.raw} />
                            <IncidentLocationMap latitude={item.latitude} longitude={item.longitude} operationalIncidentId={item.id} reviewIncident={item.raw} onReviewChanged={loadIncidents} />

                            {/* Photo Attachment */}
                            {item.photoUrl && (
                                <CompactEvidencePhoto sourceUrl={item.photoUrl} alt="Police Incident Evidence" />
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-2">
                                {item.status === 'active' && (
                                    <>
                                        <button
                                            type="button"
                                            disabled={actionLoadingId === item.id}
                                            onClick={() => handleUpdateStatus(item.id, 'ACTIVE')}
                                            className="flex-1 bg-blue-700 hover:bg-blue-800 text-white rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                                        >
                                            Mark as Responding
                                        </button>
                                        {canResolveResponse && <button
                                            type="button"
                                            disabled={actionLoadingId === item.id}
                                            onClick={() => handleUpdateStatus(item.id, 'RESOLVED')}
                                            className="flex-1 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl py-2.5 text-xs font-semibold transition-colors cursor-pointer"
                                        >
                                            Mark as Resolved
                                        </button>}
                                    </>
                                )}
                                {item.status === 'responding' && canResolveResponse && (
                                    <button
                                        type="button"
                                        disabled={actionLoadingId === item.id}
                                        onClick={() => handleUpdateStatus(item.id, 'RESOLVED')}
                                        className="w-full border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl py-2.5 text-xs font-semibold transition-colors cursor-pointer"
                                    >
                                        Mark as Resolved
                                    </button>
                                )}
                                {['active', 'responding'].includes(item.status) && !canResolveResponse && <p className="text-xs text-muted-foreground">Resolution is handled by the assigned department.</p>}
                                {item.status === 'resolved' && (
                                    <div className="w-full text-center py-2 text-xs font-semibold text-emerald-700 bg-emerald-50/60 rounded-xl border border-emerald-200">
                                        ✓ Incident Resolved
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}

                    {currentTabIncidents.length === 0 && !listError && (
                        <div className="text-center text-gray-500 py-10 bg-white rounded-xl shadow-sm border border-gray-200">
                            {isLoading ? <LoadingPlaceholder label="Loading live police emergencies..." layout="panel" /> : activeTab === 'False Reports' ? 'No whole-confirmed false reports in this department.' : `No ${activeTab.toLowerCase()} police emergencies at the moment.`}
                        </div>
                    )}
                </div>
                <IncidentPager page={page} pages={pagination.pages} total={pagination.total} pageSize={DEPARTMENT_INCIDENT_PAGE_SIZE} onPageChange={next => { selectedView.current = `${activeTab}:${next}`; setPage(next); setEmergencies([]); setIsLoading(true); }} hideWhenSinglePage />
            </main>
        </div>
    );
}
