"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useState, useEffect, useCallback, useRef } from "react";
import { 
  Heart, BarChart2, AlertTriangle, ShieldCheck, 
  MapPin, Phone, User, ExternalLink, RefreshCw, Copy, Check 
} from "lucide-react";
import AdminHeader from "@/app/component/admin/AdminHeader";
import {
    getIncidentPage,
    updateIncidentServiceResponse,
    formatIncidentForDashboard,
    DashboardIncident,
    IncidentDashboardTab,
    IncidentSummary,
    DEPARTMENT_INCIDENT_PAGE_SIZE,
    incidentServiceStatusesForTab,
} from "@/lib/services/incidentService";
import { useAdminGuard } from "@/app/hooks/useAdminGuard";
import { useDepartmentResponseAuthority } from "@/app/hooks/useDepartmentResponseAuthority";
import { useEmergencyEvents } from "@/app/hooks/useEmergencyEvents";
import IncidentPager from "@/app/component/admin/IncidentPager";
import { CompactEvidencePhoto } from "@/app/component/SecureEvidencePhoto";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import IncidentReviewActions from "@/app/component/admin/IncidentReviewActions";

export default function MedicalAdminDashboard() {
    const isAuthorized = useAdminGuard("MEDICAL");
    const canResolveResponse = useDepartmentResponseAuthority("MEDICAL", isAuthorized);
    const [activeTab, setActiveTab] = useState<Exclude<IncidentDashboardTab, "All" | "Active">>("Responding");
    const [emergencies, setEmergencies] = useState<DashboardIncident[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
    const [copiedPhoneId, setCopiedPhoneId] = useState<string | null>(null);
    const [page, setPage] = useState(1);
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
                department: "MEDICAL",
                includeAttachments: true,
                includeReviewFlags: true,
                limit: DEPARTMENT_INCIDENT_PAGE_SIZE,
                page,
                responseService: "MEDICAL",
                serviceStatuses: incidentServiceStatusesForTab(activeTab),
            });
            if (adminAccountSnapshot() !== accountAtStart) return;
            if (result.pagination.pages > 0 && page > result.pagination.pages) {
                setPage(result.pagination.pages);
                return;
            }
            const data = result.incidents;
            setPagination({ pages: result.pagination.pages, total: result.pagination.total });
            setSummary(result.summary);
            // Filter for Medical incidents only
            const medicalOnly = data
                .map(item => formatIncidentForDashboard(item, "MEDICAL"))
                .filter((item) => item.services.includes("Medical") && item.raw.verificationStatus === "VERIFIED");
            setEmergencies(medicalOnly);
            succeeded = true;
        } catch (err) {
            if (adminAccountSnapshot() === accountAtStart) console.warn("Failed to load medical emergencies:", err);
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
            await updateIncidentServiceResponse(id, "MEDICAL", newStatus === 'RESOLVED' ? 'RESOLVED' : 'RESPONDING');
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
    ];

    const currentTabIncidents = emergencies;

    return (
        <div className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 pb-10 font-sans">
            {/* Header */}
            <AdminHeader
                monitorService="MEDICAL"
                title="Medical Emergency Dashboard"
                subtitle="Emergency Medical Services (EMS) - MEDICAL ADMIN"
                departmentIcon={<Heart className="text-pink-600" size={28} />}
                badgeBorderClass="border-pink-500"
            />

            <main className="max-w-6xl mx-auto px-6 mt-8">
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
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                        <h2 className="text-xl font-bold">Medical Emergency Reports</h2>
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                            Live EMS Dispatch
                        </span>
                    </div>
                    <button
                        onClick={() => { setIsRefreshing(true); loadIncidents(); }}
                        className="text-xs text-gray-600 hover:text-gray-900 flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-2xs cursor-pointer hover:bg-gray-50"
                        title="Force refresh medical feed"
                    >
                        <RefreshCw size={13} className={isRefreshing ? "animate-spin text-rose-600" : ""} />
                        <span>Refresh</span>
                    </button>
                </div>

                {/* Tabs */}
                <div className="bg-gray-200 p-1 rounded-full flex mb-6 max-w-full overflow-x-auto">
                    {tabs.map((tab) => (
                        <button
                            key={tab.name}
                            onClick={() => {
                                setPage(1);
                                setActiveTab(tab.name);
                            }}
                            className={`flex-1 min-w-[120px] py-2.5 text-sm font-medium rounded-full transition-all cursor-pointer ${activeTab === tab.name
                                    ? "bg-white text-black shadow-sm"
                                    : "text-gray-500 hover:text-gray-700"
                                }`}
                        >
                            {tab.name} ({tab.count})
                        </button>
                    ))}
                </div>

                {/* List */}
                <div className="space-y-4">
                    {currentTabIncidents.map((item) => (
                        <div key={item.id} className="motion-list-item bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                                <div className="flex flex-col gap-2.5">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded text-white bg-rose-600">
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
                                {item.hasLocationBtn && (
                                    <button
                                        type="button"
                                        onClick={() => window.open(`https://www.google.com/maps?q=${item.latitude},${item.longitude}`, '_blank')}
                                        className="border border-gray-300 rounded-lg px-3.5 py-1.5 text-xs font-medium hover:bg-gray-50 text-gray-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                                    >
                                        <MapPin size={13} className="text-red-500" />
                                        <span>View Map</span>
                                        <ExternalLink size={12} className="text-gray-400" />
                                    </button>
                                )}
                            </div>

                            {/* Incident Description */}
                            {item.description && (
                                <div className="mb-4 p-3 bg-rose-50/50 rounded-lg border border-rose-100">
                                    <span className="text-[10px] font-bold text-rose-700 uppercase tracking-wider block mb-1">
                                        Report Description / Emergency Details
                                    </span>
                                    <p className="text-sm text-gray-800 font-medium leading-relaxed whitespace-pre-wrap">
                                        {item.description}
                                    </p>
                                </div>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-y-3 gap-x-8 mb-4">
                                <div className="flex items-center gap-2.5 text-gray-600 text-sm">
                                    <User size={14} className="text-gray-400" />
                                    <span>Reporter: <strong>{item.reporter}</strong></span>
                                </div>
                                <div className="flex items-center justify-between gap-2 text-gray-600 text-sm flex-wrap">
                                    <div className="flex items-center gap-2.5">
                                        <Phone size={14} className="text-gray-400 shrink-0" />
                                        <span>Contact: <strong>{item.phone}</strong></span>
                                    </div>
                                    {item.phone && item.phone !== "Not provided" && (
                                        <div className="flex items-center gap-1.5">
                                            <a
                                                href={`tel:${item.phone.replace(/[^0-9+]/g, "")}`}
                                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 transition-colors shadow-2xs"
                                                title={`Call ${item.reporter} (${item.phone})`}
                                            >
                                                <Phone size={12} className="text-emerald-600" />
                                                <span>Call Contact</span>
                                            </a>
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

                            {/* Photo Attachment */}
                            {item.photoUrl && (
                                <CompactEvidencePhoto sourceUrl={item.photoUrl} alt="Medical Incident Evidence" />
                            )}

                            {/* Action Buttons */}
                            <IncidentReviewActions incident={item.raw} onChanged={loadIncidents} />
                            <div className="flex gap-3 pt-2">
                                {item.status === 'active' && (
                                    <>
                                        <button
                                            type="button"
                                            disabled={actionLoadingId === item.id}
                                            onClick={() => handleUpdateStatus(item.id, 'ACTIVE')}
                                            className="flex-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2.5 text-xs font-semibold shadow-sm transition-colors cursor-pointer"
                                        >
                                            Dispatch Ambulance / Mark Responding
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

                    {currentTabIncidents.length === 0 && (
                        <div className="text-center text-gray-500 py-10 bg-white rounded-xl shadow-sm border border-gray-200">
                            {isLoading ? <LoadingPlaceholder label="Loading live medical emergencies..." layout="panel" /> : `No ${activeTab.toLowerCase()} medical emergencies at the moment.`}
                        </div>
                    )}
                </div>
                <IncidentPager page={page} pages={pagination.pages} total={pagination.total} pageSize={DEPARTMENT_INCIDENT_PAGE_SIZE} onPageChange={setPage} hideWhenSinglePage />
            </main>
        </div>
    );
}
