"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  MapPin,
  Flame,
  Heart,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  Search,
  TrendingUp,
  Activity,
  Calendar,
} from "lucide-react";
import {
  IncidentRecord,
  DashboardAnalytics,
} from "@/lib/types/barangay-history";
import { getDashboardAnalytics } from "@/lib/services/analyticsService";
import { getIncidentHistory } from "@/lib/services/incidentHistoryService";
import MonthlyResolutionCard from "./MonthlyResolutionCard";

interface BarangayHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BarangayHistoryDrawer({
  isOpen,
  onClose,
}: BarangayHistoryDrawerProps) {
  const router = useRouter();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBarangayId, setSelectedBarangayId] = useState<string>("ALL");

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsData, incidentData] = await Promise.all([
        getDashboardAnalytics(),
        getIncidentHistory(),
      ]);
      setAnalytics(analyticsData);
      setIncidents(incidentData);
    } catch (error) {
      console.error("Failed to load barangay history", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, loadData]);

  if (!isOpen) return null;

  const filteredIncidents = incidents.filter((inc) => {
    const matchesBarangay =
      selectedBarangayId === "ALL" ||
      inc.barangayId === selectedBarangayId ||
      inc.barangay?.barangayId === selectedBarangayId;

    const matchesSearch =
      searchQuery.trim() === "" ||
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (inc.barangay?.name &&
        inc.barangay.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (inc.type?.typeName &&
        inc.type.typeName.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesBarangay && matchesSearch;
  });

  const renderTypeIcon = (typeName?: string) => {
    const upper = (typeName || "").toUpperCase();
    if (upper.includes("FIRE")) return <Flame size={15} className="text-red-500" />;
    if (upper.includes("MED") || upper.includes("EMS"))
      return <Heart size={15} className="text-pink-500" />;
    if (upper.includes("POLICE") || upper.includes("SEC"))
      return <Shield size={15} className="text-blue-500" />;
    return <AlertTriangle size={15} className="text-amber-500" />;
  };

  const renderStatusBadge = (status: string) => {
    const s = status.toUpperCase();
    if (s === "RESOLVED" || s === "CLOSED") {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
          <CheckCircle2 size={11} className="text-emerald-600" />
          {status}
        </span>
      );
    }
    if (s === "ACTIVE") {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-100 text-red-700 border border-red-200 flex items-center gap-1 animate-pulse">
          <Activity size={11} className="text-red-600" />
          ACTIVE
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200 flex items-center gap-1">
        <Clock size={11} className="text-amber-600" />
        {status}
      </span>
    );
  };

  const formatTimestamp = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden animate-fadeIn">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-2xl bg-[#f8f9fa] shadow-2xl flex flex-col border-l border-gray-200 transform animate-slideLeft">
          {/* Header */}
          <div className="bg-[#0B0F19] text-white px-6 py-5 flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center">
                <MapPin className="text-purple-400" size={22} />
              </div>
              <div>
                <h2 className="text-lg font-bold">Barangay Incident History Log</h2>
                <p className="text-xs text-gray-400">
                  Area frequency ranking, emergency categories & monthly records
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadData}
                disabled={isLoading}
                title="Refresh Records"
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <RefreshCw size={18} className={isLoading ? "animate-spin text-white" : ""} />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Core Analytics Cards */}
          <div className="p-6 pb-3 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Question 1: Frequent Areas */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Top Hotspot Area</span>
                  <MapPin size={14} className="text-red-500" />
                </div>
                <div className="text-base font-extrabold text-gray-900 truncate">
                  {analytics?.incidentsByBarangay?.topArea?.name || "None"}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  {analytics?.incidentsByBarangay?.topArea
                    ? `${analytics.incidentsByBarangay.topArea.incidentCount} reports (${analytics.incidentsByBarangay.topArea.percentage}%)`
                    : "No records yet"}
                </div>
              </div>

              {/* Question 2: Frequent Emergency Type */}
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex items-center justify-between text-gray-500 text-[11px] font-bold uppercase tracking-wider mb-1">
                  <span>Top Emergency Type</span>
                  <Flame size={14} className="text-amber-500" />
                </div>
                <div className="text-base font-extrabold text-gray-900 truncate">
                  {analytics?.incidentsByType?.topType?.typeName || "None"}
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  {analytics?.incidentsByType?.topType
                    ? `${analytics.incidentsByType.topType.count} cases (${analytics.incidentsByType.topType.percentage}%)`
                    : "No records yet"}
                </div>
              </div>

              <MonthlyResolutionCard summary={analytics?.resolvedSummary} compact />
            </div>

            {/* Barangay Rankings Progress */}
            {analytics?.incidentsByBarangay?.rankings && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-2xs">
                <div className="flex justify-between items-center mb-2.5">
                  <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-purple-600" />
                    Barangay Incident Frequency Ranking
                  </h3>
                  <span className="text-[11px] text-gray-400">
                    Total {analytics.incidentsByBarangay.totalIncidents} incidents
                  </span>
                </div>
                <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                  {analytics.incidentsByBarangay.rankings.slice(0, 5).map((area) => (
                    <div
                      key={area.barangayId}
                      onClick={() =>
                        setSelectedBarangayId(
                          selectedBarangayId === area.barangayId ? "ALL" : area.barangayId
                        )
                      }
                      className={`p-2 rounded-lg cursor-pointer transition-all ${
                        selectedBarangayId === area.barangayId
                          ? "bg-purple-50 border border-purple-200"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-gray-800">{area.name}</span>
                        <span className="text-gray-600 font-bold">
                          {area.incidentCount} reports ({area.percentage}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            area.riskLevel === "HIGH"
                              ? "bg-red-500"
                              : area.riskLevel === "MODERATE"
                              ? "bg-amber-500"
                              : "bg-purple-500"
                          }`}
                          style={{ width: `${Math.max(area.percentage, 4)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search & Full Page Link */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={15}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search incident title, barangay, or type..."
                  className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3.5 py-2 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <button
                onClick={() => {
                  onClose();
                  router.push("/admin/barangay-history");
                }}
                className="bg-[#0B0F19] hover:bg-[#1a233a] text-white px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
              >
                <span>Full Analytics</span>
                <ExternalLink size={13} />
              </button>
            </div>
          </div>

          {/* Incident Feed */}
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-3">
            {isLoading && incidents.length === 0 ? (
              <div className="text-center py-16 text-gray-400 text-xs flex flex-col items-center gap-2">
                <RefreshCw size={22} className="animate-spin text-purple-600" />
                Loading Barangay incident history...
              </div>
            ) : filteredIncidents.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 border border-gray-200 text-center shadow-xs">
                <MapPin size={36} className="text-gray-300 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-gray-800">No Incident Records Found</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto">
                  {selectedBarangayId !== "ALL" || searchQuery
                    ? "No historical records match your selected Barangay filter."
                    : "No incident reports have been logged in the system."}
                </p>
              </div>
            ) : (
              filteredIncidents.map((inc) => (
                <div
                  key={inc.incidentId}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-2xs hover:shadow-sm transition-all"
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1 bg-gray-100 px-2.5 py-0.5 rounded-md text-[11px] font-bold text-gray-800">
                        {renderTypeIcon(inc.type?.typeName)}
                        <span>{inc.type?.typeName || "Incident"}</span>
                      </span>
                      {renderStatusBadge(inc.status)}
                    </div>
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <Calendar size={12} />
                      {formatTimestamp(inc.reportedAt)}
                    </span>
                  </div>

                  <h4 className="text-xs font-bold text-gray-900 mb-1">{inc.title}</h4>
                  {inc.description && (
                    <p className="text-[11px] text-gray-500 line-clamp-2 mb-2.5">
                      {inc.description}
                    </p>
                  )}

                  <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                    <div className="flex items-center gap-1 text-purple-700 font-semibold truncate">
                      <MapPin size={13} className="shrink-0 text-purple-600" />
                      <span>{inc.barangay?.name || inc.location?.locationName || "Unspecified Area"}</span>
                    </div>

                    <span className="text-gray-400">
                      Severity: <strong className="text-gray-700 font-semibold">{inc.severityLevel}</strong>
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
