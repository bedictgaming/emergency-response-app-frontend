"use client";

import { LoadingPlaceholder } from "@/components/ui/loading-placeholder";

import { useState, useEffect, useCallback, useId } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Flame,
  Heart,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  ArrowLeft,
  BarChart3,
  Activity,
  Calendar,
  Layers,
  PieChart,
  Download,
  Building2,
  User,
  Truck,
} from "lucide-react";
import {
  BarangayItem,
  DashboardAnalytics,
  SeverityLevel,
} from "@/lib/types/barangay-history";
import { getBarangays } from "@/lib/services/barangayService";
import { getDashboardAnalytics } from "@/lib/services/analyticsService";
import { useIncidentHistory } from "@/app/hooks/useIncidentHistory";
import HistoryPagination from "@/app/component/admin/HistoryPagination";
import { adminAccountSnapshot } from "@/lib/adminAccountSnapshot";
import { useAdminGuard } from "@/app/hooks/useAdminGuard";
import MonthlyResolutionCard from "@/app/component/admin/MonthlyResolutionCard";

export default function BarangayHistoryPage() {
  const router = useRouter();
  const filterId = useId();
  const isAuthorized = useAdminGuard();
  const [analyticsError, setAnalyticsError] = useState("");
  const [barangays, setBarangays] = useState<BarangayItem[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangayId, setSelectedBarangayId] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("ALL");

  const history = useIncidentHistory({ search: searchQuery, barangayId: selectedBarangayId === "ALL" ? undefined : selectedBarangayId, typeName: selectedType === "ALL" ? undefined : selectedType, status: selectedStatus === "ALL" ? undefined : selectedStatus as import("@/lib/types/barangay-history").IncidentStatus, period: selectedPeriod === "ALL" ? undefined : selectedPeriod as "THIS_MONTH" | "LAST_30_DAYS", includeUnits: true }, isAuthorized);
  const loadAllData = useCallback(async () => {
    const account = adminAccountSnapshot();
    setIsLoading(true);
    try {
      const [analyticsData, barangaysData] = await Promise.all([
        getDashboardAnalytics(),
        getBarangays({ throwOnError: true }),
      ]);
      if (adminAccountSnapshot() !== account) return;
      if (!analyticsData) throw new Error("Analytics unavailable");
      setAnalytics(analyticsData);
      setAnalyticsError("");
      setBarangays(barangaysData);
    } catch (error) {
      void error;
      setAnalyticsError("Analytics unavailable. Previously loaded totals may be out of date.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) void loadAllData();
  }, [loadAllData, isAuthorized]);

  useEffect(() => {
    if (!isAuthorized) return;
    const account = adminAccountSnapshot();
    const logout = localStorage.getItem('emergency-logout-epoch');
    const changed = () => {
      if (adminAccountSnapshot() !== account || localStorage.getItem('emergency-logout-epoch') !== logout) {
        setAnalytics(null); setBarangays([]); router.replace('/');
      }
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }, [isAuthorized, router]);

  if (!isAuthorized) return null;

  // Filter calculations
  const filteredIncidents = history.incidents;

  const renderTypeBadge = (typeName?: string) => {
    const upper = (typeName || "").toUpperCase();
    let bg = "bg-gray-100 text-gray-800 border-gray-200";
    let icon = <Layers size={13} />;

    if (upper.includes("FIRE")) {
      bg = "bg-red-50 text-red-700 border-red-200";
      icon = <Flame size={13} className="text-red-500" />;
    } else if (upper.includes("MED") || upper.includes("EMS")) {
      bg = "bg-pink-50 text-pink-700 border-pink-200";
      icon = <Heart size={13} className="text-pink-500" />;
    } else if (upper.includes("POLICE") || upper.includes("SEC")) {
      bg = "bg-blue-50 text-blue-700 border-blue-200";
      icon = <Shield size={13} className="text-blue-500" />;
    } else if (upper.includes("HAZARD") || upper.includes("FLOOD")) {
      bg = "bg-amber-50 text-amber-700 border-amber-200";
      icon = <AlertTriangle size={13} className="text-amber-500" />;
    }

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${bg}`}
      >
        {icon}
        <span>{typeName || "General"}</span>
      </span>
    );
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "RESOLVED":
      case "CLOSED":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} className="text-emerald-600" />
            {status}
          </span>
        );
      case "ACTIVE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-50 text-red-700 border border-red-200 animate-pulse">
            <Activity size={12} className="text-red-600" />
            ACTIVE
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} className="text-amber-600" />
            {status}
          </span>
        );
    }
  };

  const renderSeverityBadge = (severity: SeverityLevel) => {
    let color = "bg-gray-100 text-gray-700";
    if (severity === "CRITICAL") color = "bg-red-600 text-white";
    if (severity === "HIGH") color = "bg-orange-500 text-white";
    if (severity === "MEDIUM") color = "bg-amber-500 text-white";
    if (severity === "LOW") color = "bg-blue-500 text-white";

    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${color}`}>
        {severity}
      </span>
    );
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 pb-14 font-sans">
      {/* Header */}
      <header className="bg-[#0B0F19] text-white px-6 py-4 flex justify-between items-center shadow-md">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-gray-300 hover:text-white"
            title="Go Back"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="w-11 h-11 bg-purple-600/20 border border-purple-500/40 rounded-xl flex items-center justify-center">
            <BarChart3 className="text-purple-400" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              Barangay Incident History Log & Analytics Hub
            </h1>
            <p className="text-gray-400 text-xs">
              Administrative area frequencies, emergency category share & monthly records
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handlePrint}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-gray-300 hover:text-white transition-all text-xs font-semibold flex items-center gap-1.5"
            title="Export / Print Report"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export Report</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 mt-8 space-y-6">
        {/* ============================================================ */}
        {/* SECTION 1: 3 CORE ANALYTICAL KPI CARDS                       */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Card 1: Frequent Areas Hotspots */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>1. Frequent Emergency Area</span>
                <span className="p-1.5 rounded-lg bg-red-50 text-red-600">
                  <MapPin size={16} />
                </span>
              </div>
              <div className="text-2xl font-black text-gray-900 tracking-tight">
                {analytics?.incidentsByBarangay?.topArea?.name || (analyticsError ? "Unavailable" : "None")}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {analytics?.incidentsByBarangay?.topArea
                  ? `Accounts for ${analytics.incidentsByBarangay.topArea.percentage}% of all emergency calls (${analytics.incidentsByBarangay.topArea.incidentCount} reports)`
                  : "No incident data recorded yet."}
              </p>
            </div>

            {/* Micro Area Ranking */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              {analytics?.incidentsByBarangay?.rankings.slice(0, 3).map((area, idx) => (
                <div key={area.barangayId} className="flex justify-between items-center text-xs">
                  <span className="text-gray-700 font-medium truncate max-w-[160px]">
                    #{idx + 1} Barangay {area.name}
                  </span>
                  <span className="font-bold text-gray-900">
                    {area.incidentCount} ({area.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Card 2: Most Common Emergency Type */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-gray-500 text-xs font-bold uppercase tracking-wider mb-2">
                <span>2. Most Common Emergency</span>
                <span className="p-1.5 rounded-lg bg-amber-50 text-amber-600">
                  <Flame size={16} />
                </span>
              </div>
              <div className="text-2xl font-black text-gray-900 tracking-tight">
                {analytics?.incidentsByType?.topType?.typeName || (analyticsError ? "Unavailable" : "None")}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {analytics?.incidentsByType?.topType
                  ? `Represents ${analytics.incidentsByType.topType.percentage}% of all recorded emergencies (${analytics.incidentsByType.topType.count} cases)`
                  : "No incident data recorded yet."}
              </p>
            </div>

            {/* Micro Type Breakdown */}
            <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
              {analytics?.incidentsByType?.distribution.slice(0, 3).map((type) => (
                <div key={type.typeName} className="flex justify-between items-center text-xs">
                  <div className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: type.color }}
                    />
                    <span className="text-gray-700 font-medium">{type.typeName}</span>
                  </div>
                  <span className="font-bold text-gray-900">
                    {type.count} ({type.percentage}%)
                  </span>
                </div>
              ))}
            </div>
          </div>

          <MonthlyResolutionCard summary={analytics?.resolvedSummary} />
        </div>

        {/* ============================================================ */}
        {/* SECTION 2: 13 BARANGAY HOTSPOTS & TYPE DISTRIBUTION METERS   */}
        {/* ============================================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Barangay Hotspot Ranking across 13 Fixed Barangays */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Building2 size={18} className="text-purple-600" />
                13 Administrative Barangays Hotspot Ranking
              </h3>
              <span className="text-xs text-gray-400 font-medium">
                Click a barangay to filter
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {!analytics?.incidentsByBarangay?.rankings || analytics.incidentsByBarangay.rankings.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">No barangay data available.</p>
              ) : (
                analytics.incidentsByBarangay.rankings.map((area) => {
                  const isSelected = selectedBarangayId === area.barangayId;
                  return (
                    <button type="button" disabled={area.barangayId === "UNSPECIFIED"} aria-pressed={selectedBarangayId === area.barangayId}
                      key={area.barangayId}
                      onClick={() =>
                        setSelectedBarangayId(isSelected ? "ALL" : area.barangayId)
                      }
                      className={`w-full min-h-11 text-left p-3 rounded-xl border focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-all ${
                        isSelected
                          ? "bg-purple-50 border-purple-300 ring-2 ring-purple-500/20"
                          : "bg-gray-50/70 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={13} className="text-purple-600" />
                          <span className="text-gray-900">Barangay {area.name}</span>
                          {area.status === "INACTIVE" && (
                            <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded">Inactive</span>
                          )}
                        </div>
                        <span className="text-gray-700">
                          {area.incidentCount} reports ({area.percentage}%)
                        </span>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            area.riskLevel === "HIGH"
                              ? "bg-red-500"
                              : area.riskLevel === "MODERATE"
                              ? "bg-amber-500"
                              : "bg-purple-600"
                          }`}
                          style={{ width: `${Math.max(area.percentage, 4)}%` }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Emergency Types Distribution */}
          <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-2xs">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <PieChart size={18} className="text-blue-600" />
                Emergency Category Distribution
              </h3>
              <span className="text-xs text-gray-400 font-medium">
                Click a category to filter
              </span>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
              {!analytics?.incidentsByType?.distribution || analytics.incidentsByType.distribution.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">No category data available.</p>
              ) : (
                analytics.incidentsByType.distribution.map((type) => {
                  const isSelected = selectedType.toUpperCase() === type.typeName.toUpperCase();
                  return (
                    <button type="button" aria-pressed={selectedType.toUpperCase() === type.typeName.toUpperCase()}
                      key={type.typeName}
                      onClick={() =>
                        setSelectedType(isSelected ? "ALL" : type.typeName)
                      }
                      className={`w-full min-h-11 text-left p-3 rounded-xl border focus-visible:ring-2 focus-visible:ring-ring cursor-pointer transition-all ${
                        isSelected
                          ? "bg-blue-50 border-blue-300 ring-2 ring-blue-500/20"
                          : "bg-gray-50/70 border-gray-200 hover:bg-gray-100"
                      }`}
                    >
                      <div className="flex justify-between items-center text-xs font-bold mb-1.5">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: type.color }}
                          />
                          <span className="text-gray-900">{type.typeName}</span>
                        </div>
                        <span className="text-gray-700">
                          {type.count} cases ({type.percentage}%)
                        </span>
                      </div>

                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.max(type.percentage, 4)}%`,
                            backgroundColor: type.color,
                          }}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 3: INTERACTIVE FILTER BAR                            */}
        {/* ============================================================ */}
        {analyticsError && <div role="alert" className="rounded-lg border border-border bg-card p-4 text-sm">{analyticsError} <button onClick={() => void loadAllData()} className="min-h-11 underline">Retry analytics</button></div>}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {/* Search Input */}
            <div className="relative md:col-span-2">
              <label htmlFor={`${filterId}-search`} className="sr-only">Search incident history</label>
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                id={`${filterId}-search`}
                name="incidentHistorySearch"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incident title, description, or reporter..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Barangay Selector (13 Fixed Barangays) */}
            <select
              id={`${filterId}-barangay`}
              name="incidentHistoryBarangay"
              aria-label="Filter history by barangay"
              value={selectedBarangayId}
              onChange={(e) => setSelectedBarangayId(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All 13 Barangays</option>
              {barangays.map((b) => (
                <option key={b.barangayId} value={b.barangayId}>
                  Barangay {b.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              id={`${filterId}-status`}
              name="incidentHistoryStatus"
              aria-label="Filter history by status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="RESOLVED">Resolved Only</option>
              <option value="RESPONDING">Responding Only</option>
              <option value="ACTIVE">Active Only</option>
              <option value="OPEN">Open Only</option>
              <option value="CLOSED">Closed Only</option>
            </select>

            {/* Period Filter */}
            <div className="flex gap-2">
              <select
                id={`${filterId}-period`}
                name="incidentHistoryPeriod"
                aria-label="Filter history by reporting period"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Time</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
              </select>

              <button
                onClick={() => { void loadAllData(); history.refresh(); }}
                disabled={isLoading}
                title="Refresh Records"
                className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100 shrink-0"
              >
                <RefreshCw size={16} className={isLoading ? "animate-spin text-purple-600" : ""} />
              </button>
            </div>
          </div>

          {/* Active Filter Chips */}
          {(selectedBarangayId !== "ALL" ||
            selectedType !== "ALL" ||
            selectedStatus !== "ALL" ||
            selectedPeriod !== "ALL" ||
            searchQuery) && (
            <div className="flex items-center gap-2 pt-1 border-t border-gray-100 text-xs flex-wrap">
              <span className="text-gray-400 font-medium">Active Filters:</span>
              {selectedBarangayId !== "ALL" && (
                <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                  Barangay:{" "}
                  {barangays.find((b) => b.barangayId === selectedBarangayId)?.name}
                  <button onClick={() => setSelectedBarangayId("ALL")}>×</button>
                </span>
              )}
              {selectedType !== "ALL" && (
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                  Type: {selectedType}
                  <button onClick={() => setSelectedType("ALL")}>×</button>
                </span>
              )}
              {selectedStatus !== "ALL" && (
                <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                  Status: {selectedStatus}
                  <button onClick={() => setSelectedStatus("ALL")}>×</button>
                </span>
              )}
              {selectedPeriod !== "ALL" && (
                <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md font-bold text-[11px] flex items-center gap-1">
                  Period: {selectedPeriod.replace("_", " ")}
                  <button onClick={() => setSelectedPeriod("ALL")}>×</button>
                </span>
              )}
              <button
                onClick={() => {
                  setSelectedBarangayId("ALL");
                  setSelectedType("ALL");
                  setSelectedStatus("ALL");
                  setSelectedPeriod("ALL");
                  setSearchQuery("");
                }}
                className="text-gray-400 hover:text-gray-700 underline text-[11px] ml-auto"
              >
                Reset all filters
              </button>
            </div>
          )}
        </div>

        {/* ============================================================ */}
        {/* SECTION 4: DETAILED INCIDENT AUDIT TABLE                     */}
        {/* ============================================================ */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-2xs overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <div>
              <h3 className="text-sm font-bold text-gray-900">
                Incident History Audit Log
              </h3>
              <p className="text-xs text-gray-500">
                Showing {filteredIncidents.length} of {history.pagination?.total ?? "…"} matching recorded incidents
              </p>
              <p className="mt-1 text-xs text-muted-foreground">History includes all authorized records; analytics above count verified reports only.</p>
            </div>
          </div>

          {history.error && <div role="alert" className="p-4 text-sm">{history.error} <button onClick={history.refresh} className="min-h-11 underline">Retry history</button></div>}
          {history.loading && filteredIncidents.length === 0 ? (
            <LoadingPlaceholder label="Loading Barangay incident records..." rows={4} />
          ) : history.error && filteredIncidents.length === 0 ? null : filteredIncidents.length === 0 ? (
            <div className="py-16 text-center">
              <MapPin size={40} className="text-gray-300 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-gray-800">No Incident Records Found</h4>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                No incidents match your selected filter criteria. Try resetting your filters to view all records.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                    <th className="py-3.5 px-5">Date / Time</th>
                    <th className="py-3.5 px-5">Barangay</th>
                    <th className="py-3.5 px-5">Incident Title & Details</th>
                    <th className="py-3.5 px-5">Category</th>
                    <th className="py-3.5 px-5">Severity</th>
                    <th className="py-3.5 px-5">Status</th>
                    <th className="py-3.5 px-5">Dispatched Units</th>
                    <th className="py-3.5 px-5">Reporter</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-xs">
                  {filteredIncidents.map((inc) => (
                    <tr
                      key={inc.incidentId}
                      className="hover:bg-purple-50/30 transition-colors"
                    >
                      {/* Date */}
                      <td className="py-4 px-5 text-gray-500 font-medium whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar size={13} className="text-gray-400" />
                          <span>{formatTimestamp(inc.reportedAt)}</span>
                        </div>
                      </td>

                      {/* Barangay */}
                      <td className="py-4 px-5">
                        <div className="font-bold text-purple-900 flex items-center gap-1">
                          <MapPin size={13} className="text-purple-600 shrink-0" />
                          <span>Barangay {inc.barangay?.name || "unavailable"}</span>
                        </div>
                        {inc.location?.locationName && (
                          <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[180px]">
                            {inc.location.locationName}
                          </p>
                        )}
                      </td>

                      {/* Title & Description */}
                      <td className="py-4 px-5 max-w-xs">
                        <p className="font-bold text-gray-900">{inc.title}</p>
                        {inc.verificationStatus && inc.verificationStatus !== "VERIFIED" && <p className="text-xs text-amber-800">Excluded from verified analytics · {inc.verificationStatus.toLowerCase()}</p>}
                        {inc.description && (
                          <p className="text-[11px] text-gray-500 line-clamp-1 mt-0.5">
                            {inc.description}
                          </p>
                        )}
                      </td>

                      {/* Category */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        {renderTypeBadge(inc.type?.typeName)}
                      </td>

                      {/* Severity */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        {renderSeverityBadge(inc.severityLevel)}
                      </td>

                      {/* Status */}
                      <td className="py-4 px-5 whitespace-nowrap">
                        {renderStatusBadge(inc.status)}
                      </td>

                      {/* Dispatched Units */}
                      <td className="py-4 px-5">
                        {inc.incidentUnits && inc.incidentUnits.length > 0 ? (
                          <div className="flex items-center gap-1 text-[11px] text-gray-700 font-semibold">
                            <Truck size={13} className="text-blue-600" />
                            <span>{inc.incidentUnits.map((u) => u.unit.unitName).join(", ")}</span>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-[11px]">{inc.incidentUnits ? "None assigned" : "Not loaded"}</span>
                        )}
                      </td>

                      {/* Reporter */}
                      <td className="py-4 px-5 whitespace-nowrap text-gray-600">
                        <div className="flex items-center gap-1.5">
                          <User size={13} className="text-gray-400" />
                          <span className="font-medium text-gray-800">
                            {inc.reporter?.name || inc.reporter?.email || "Citizen"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-6"><HistoryPagination pagination={history.pagination} loading={history.loading} onPage={history.setPage} /></div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
