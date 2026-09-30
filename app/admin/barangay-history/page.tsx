"use client";

import { useState, useEffect, useCallback } from "react";
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
  IncidentRecord,
  BarangayItem,
  DashboardAnalytics,
  IncidentStatus,
  SeverityLevel,
} from "@/lib/types/barangay-history";
import { getBarangays } from "@/lib/services/barangayService";
import { getDashboardAnalytics } from "@/lib/services/analyticsService";
import { getIncidentHistory } from "@/lib/services/incidentHistoryService";
import { useAdminGuard } from "@/app/hooks/useAdminGuard";

export default function BarangayHistoryPage() {
  const router = useRouter();
  const isAuthorized = useAdminGuard();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [barangays, setBarangays] = useState<BarangayItem[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Filter States
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangayId, setSelectedBarangayId] = useState<string>("ALL");
  const [selectedType, setSelectedType] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");
  const [selectedPeriod, setSelectedPeriod] = useState<string>("ALL");

  const loadAllData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsData, barangaysData, incidentsData] = await Promise.all([
        getDashboardAnalytics(),
        getBarangays(),
        getIncidentHistory(),
      ]);
      setAnalytics(analyticsData);
      setBarangays(barangaysData);
      setIncidents(incidentsData);
    } catch (error) {
      console.error("Failed to load barangay analytics and history", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  if (!isAuthorized) return null;

  // Filter calculations
  const filteredIncidents = incidents.filter((inc) => {
    // 1. Barangay Filter
    const matchesBarangay =
      selectedBarangayId === "ALL" ||
      inc.barangayId === selectedBarangayId ||
      inc.barangay?.barangayId === selectedBarangayId;

    // 2. Type Filter
    const matchesType =
      selectedType === "ALL" ||
      inc.type?.typeName?.toUpperCase() === selectedType.toUpperCase();

    // 3. Status Filter
    const matchesStatus =
      selectedStatus === "ALL" ||
      inc.status.toUpperCase() === selectedStatus.toUpperCase();

    // 4. Period Filter
    let matchesPeriod = true;
    if (selectedPeriod === "THIS_MONTH") {
      const now = new Date();
      const incDate = new Date(inc.reportedAt);
      matchesPeriod =
        incDate.getMonth() === now.getMonth() &&
        incDate.getFullYear() === now.getFullYear();
    } else if (selectedPeriod === "LAST_30_DAYS") {
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      matchesPeriod = new Date(inc.reportedAt).getTime() >= thirtyDaysAgo;
    }

    // 5. Search Query
    const matchesSearch =
      searchQuery.trim() === "" ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.description &&
        inc.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.barangay?.name &&
        inc.barangay.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.type?.typeName &&
        inc.type.typeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.reporter?.name &&
        inc.reporter.name.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      matchesBarangay &&
      matchesType &&
      matchesStatus &&
      matchesPeriod &&
      matchesSearch
    );
  });

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

  const renderStatusBadge = (status: IncidentStatus) => {
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
              Administrative area frequencies, emergency category share & monthly resolution performance
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
                {analytics?.incidentsByBarangay?.topArea?.name || "None"}
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
                {analytics?.incidentsByType?.topType?.typeName || "None"}
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

          {/* Card 3: Verified reports submitted this month and now resolved or closed. */}
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 p-5 rounded-2xl border border-emerald-200 shadow-2xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-emerald-800 text-xs font-bold uppercase tracking-wider mb-2">
                <span>3. Verified Reports Resolved</span>
                <span className="p-1.5 rounded-lg bg-emerald-100 text-emerald-700">
                  <CheckCircle2 size={16} />
                </span>
              </div>
              <div className="text-4xl font-black text-emerald-800 tracking-tight">
                {analytics?.resolvedSummary?.resolvedThisMonth ?? 0}
              </div>
              <p className="text-xs text-emerald-800/80 mt-1 font-medium">
                Out of {analytics?.resolvedSummary?.totalReportedThisMonth ?? 0} verified reports submitted in {analytics?.resolvedSummary?.month}/{analytics?.resolvedSummary?.year}. Rejected reports are excluded.
              </p>
            </div>

            <div className="mt-4 pt-3 border-t border-emerald-200/60 flex items-center justify-between text-xs">
              <span className="text-emerald-800 font-semibold">Monthly Resolution Rate:</span>
              <span className="text-base font-extrabold text-emerald-900">
                {analytics?.resolvedSummary?.resolutionRate ?? 0}%
              </span>
            </div>
          </div>
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
                    <div
                      key={area.barangayId}
                      onClick={() =>
                        setSelectedBarangayId(isSelected ? "ALL" : area.barangayId)
                      }
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
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
                    </div>
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
                    <div
                      key={type.typeName}
                      onClick={() =>
                        setSelectedType(isSelected ? "ALL" : type.typeName)
                      }
                      className={`p-3 rounded-xl border cursor-pointer transition-all ${
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* SECTION 3: INTERACTIVE FILTER BAR                            */}
        {/* ============================================================ */}
        <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2.5">
            {/* Search Input */}
            <div className="relative md:col-span-2">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search incident title, description, or reporter..."
                className="w-full bg-gray-50 border border-gray-200 rounded-xl pl-9 pr-3.5 py-2 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            {/* Barangay Selector (13 Fixed Barangays) */}
            <select
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
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">All Statuses</option>
              <option value="RESOLVED">Resolved Only</option>
              <option value="ACTIVE">Active Only</option>
              <option value="OPEN">Open Only</option>
              <option value="CLOSED">Closed Only</option>
            </select>

            {/* Period Filter */}
            <div className="flex gap-2">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="ALL">All Time</option>
                <option value="THIS_MONTH">This Month</option>
                <option value="LAST_30_DAYS">Last 30 Days</option>
              </select>

              <button
                onClick={loadAllData}
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
                Showing {filteredIncidents.length} of {incidents.length} recorded incidents
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="py-20 text-center text-gray-400 text-xs flex flex-col items-center gap-2">
              <RefreshCw size={26} className="animate-spin text-purple-600" />
              Loading Barangay incident records...
            </div>
          ) : filteredIncidents.length === 0 ? (
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
                          <span>Barangay {inc.barangay?.name || "Poblacion"}</span>
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
                          <span className="text-gray-400 text-[11px]">None</span>
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
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
