"use client";

import { useState, useEffect } from "react";
import {
  BarChart3,
  TrendingUp,
  MapPin,
  Flame,
  Heart,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Activity,
  RefreshCw,
  Loader2,
  Calendar,
} from "lucide-react";
import AdminHeader from "@/app/component/admin/AdminHeader";
import { getDashboardAnalytics } from "@/lib/services/analyticsService";
import { useAdminGuard } from "@/app/hooks/useAdminGuard";

interface BarangayRanking {
  barangayId: string;
  name: string;
  status: string;
  incidentCount: number;
  activeCount: number;
  resolvedCount: number;
  percentage: number;
  riskLevel: "HIGH" | "MODERATE" | "LOW";
}

interface TypeDistribution {
  typeId: string;
  typeName: string;
  count: number;
  percentage: number;
  color: string;
}

interface ResolvedSummary {
  month: number;
  year: number;
  totalReportedThisMonth: number;
  resolvedThisMonth: number;
  activeThisMonth: number;
  resolutionRate: number;
  totalHistorical: number;
  totalResolvedAllTime: number;
}

interface DashboardAnalytics {
  incidentsByBarangay: {
    totalIncidents: number;
    topArea: BarangayRanking | null;
    rankings: BarangayRanking[];
  };
  incidentsByType: {
    totalIncidents: number;
    topType: TypeDistribution | null;
    distribution: TypeDistribution[];
  };
  resolvedSummary: ResolvedSummary;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function RiskBadge({ level }: { level: string }) {
  if (level === "HIGH")
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">HIGH RISK</span>;
  if (level === "MODERATE")
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200">MODERATE</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">LOW</span>;
}

function TypeIcon({ name }: { name: string }) {
  const n = name.toLowerCase();
  if (n.includes("fire")) return <Flame size={18} className="text-red-500" />;
  if (n.includes("med")) return <Heart size={18} className="text-pink-500" />;
  if (n.includes("pol") || n.includes("sec")) return <Shield size={18} className="text-blue-500" />;
  return <AlertTriangle size={18} className="text-amber-500" />;
}

export default function AnalyticsDashboard() {
  const isAuthorized = useAdminGuard();
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadAnalytics = async () => {
    try {
      const data = await getDashboardAnalytics();
      if (data) {
        setAnalytics(data as DashboardAnalytics);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isAuthorized) return;
    loadAnalytics();
    const interval = setInterval(loadAnalytics, 30000);
    return () => clearInterval(interval);
  }, [isAuthorized]);

  if (!isAuthorized) return null;

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadAnalytics();
  };

  const summary = analytics?.resolvedSummary;
  const byBarangay = analytics?.incidentsByBarangay;
  const byType = analytics?.incidentsByType;

  return (
    <div className="figma-shell min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/40 to-indigo-50/60 pb-12 font-sans">
      <AdminHeader
        title="Analytics & Intelligence Hub"
        subtitle="Emergency Response Performance Dashboard"
        departmentIcon={<BarChart3 className="text-indigo-500" size={28} />}
        badgeBorderClass="border-indigo-400"
        showBackButton={true}
      />

      <main className="max-w-6xl mx-auto px-6 mt-8">
        {/* Page Title Row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Incident Intelligence Dashboard</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {lastUpdated ? `Last updated: ${lastUpdated.toLocaleTimeString()}` : "Loading..."}
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 bg-white border border-gray-200 px-3 py-1.5 rounded-lg shadow-sm hover:bg-gray-50 transition-all"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-indigo-600" : ""} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="py-32 flex flex-col items-center justify-center gap-4 text-gray-400">
            <Loader2 size={32} className="animate-spin text-indigo-500" />
            <p className="text-sm">Loading analytics data...</p>
          </div>
        ) : !analytics ? (
          <div className="py-24 text-center text-gray-400 text-sm">
            Could not load analytics. Please refresh.
          </div>
        ) : (
          <div className="space-y-6">
            {/* ─── Row 1: Key Metrics ─── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
                    <Activity size={18} className="text-indigo-600" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">All Time</span>
                </div>
                <div className="text-3xl font-black text-gray-900">{summary?.totalHistorical ?? 0}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">Total Incidents</div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <CheckCircle2 size={18} className="text-emerald-600" />
                  </div>
                  <span className="text-[10px] font-bold text-emerald-600 uppercase">{summary?.resolutionRate ?? 0}%</span>
                </div>
                <div className="text-3xl font-black text-emerald-600">{summary?.resolvedThisMonth ?? 0}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">
                  Verified reports resolved · submitted this month
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center">
                    <AlertTriangle size={18} className="text-red-500" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Active</span>
                </div>
                <div className="text-3xl font-black text-red-600">{summary?.activeThisMonth ?? 0}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">Ongoing This Month</div>
              </div>

              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center">
                    <TrendingUp size={18} className="text-blue-600" />
                  </div>
                  <span className="text-[10px] font-bold text-gray-400 uppercase">Lifetime</span>
                </div>
                <div className="text-3xl font-black text-blue-600">{summary?.totalResolvedAllTime ?? 0}</div>
                <div className="text-xs font-medium text-gray-500 mt-1">Total Resolved</div>
              </div>
            </div>

            {/* ─── Row 2: Resolution Rate + Month Summary ─── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="font-bold text-gray-900">Monthly Resolution Rate</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    <Calendar size={10} className="inline mr-1" />
                    {MONTH_NAMES[(summary?.month ?? 1) - 1]} {summary?.year}
                  </p>
                </div>
                <span
                  className={`text-2xl font-black ${
                    (summary?.resolutionRate ?? 0) >= 70
                      ? "text-emerald-600"
                      : (summary?.resolutionRate ?? 0) >= 40
                      ? "text-amber-600"
                      : "text-red-600"
                  }`}
                >
                  {summary?.resolutionRate ?? 0}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    (summary?.resolutionRate ?? 0) >= 70
                      ? "bg-gradient-to-r from-emerald-400 to-emerald-600"
                      : (summary?.resolutionRate ?? 0) >= 40
                      ? "bg-gradient-to-r from-amber-400 to-amber-600"
                      : "bg-gradient-to-r from-red-400 to-red-600"
                  }`}
                  style={{ width: `${summary?.resolutionRate ?? 0}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>{summary?.resolvedThisMonth} resolved</span>
                <span>{summary?.totalReportedThisMonth} total reported</span>
              </div>
            </div>

            {/* ─── Row 3: Incident by Type ─── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-5">
                <BarChart3 size={18} className="text-indigo-500" />
                <h3 className="font-bold text-gray-900">Emergency Type Distribution</h3>
                <span className="ml-auto text-xs text-gray-400">
                  {byType?.totalIncidents ?? 0} total incidents
                </span>
              </div>

              <div className="space-y-4">
                {(byType?.distribution ?? []).map((type) => (
                  <div key={type.typeId}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <TypeIcon name={type.typeName} />
                        <span className="text-sm font-semibold text-gray-800">{type.typeName}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-900">{type.count}</span>
                        <span className="text-xs text-gray-400 w-9 text-right">{type.percentage}%</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${type.percentage}%`,
                          backgroundColor: type.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
                {(byType?.distribution ?? []).length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No incident type data yet.</p>
                )}
              </div>
            </div>

            {/* ─── Row 4: Barangay Risk Rankings ─── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <MapPin size={18} className="text-rose-500" />
                <h3 className="font-bold text-gray-900">Barangay Incident Rankings</h3>
                <span className="ml-auto text-xs text-gray-400">
                  {byBarangay?.totalIncidents ?? 0} total incidents across all barangays
                </span>
              </div>

              {(byBarangay?.rankings ?? []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">No barangay data yet.</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {(byBarangay?.rankings ?? []).map((b, idx) => (
                    <div key={b.barangayId} className="px-6 py-4 flex items-center gap-4 hover:bg-gray-50/50 transition-colors">
                      {/* Rank */}
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0 ${
                          idx === 0
                            ? "bg-red-100 text-red-700"
                            : idx === 1
                            ? "bg-orange-100 text-orange-700"
                            : idx === 2
                            ? "bg-amber-100 text-amber-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {idx + 1}
                      </div>

                      {/* Name + Risk */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-gray-800">{b.name}</span>
                          <RiskBadge level={b.riskLevel} />
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-gray-400">
                          <span className="text-red-500 font-medium">{b.activeCount} active</span>
                          <span>•</span>
                          <span className="text-emerald-600 font-medium">{b.resolvedCount} resolved</span>
                        </div>
                      </div>

                      {/* Bar + Count */}
                      <div className="w-32 hidden sm:block">
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              b.riskLevel === "HIGH"
                                ? "bg-red-500"
                                : b.riskLevel === "MODERATE"
                                ? "bg-amber-400"
                                : "bg-emerald-400"
                            }`}
                            style={{ width: `${Math.max(b.percentage, 4)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5 text-right">{b.percentage}%</p>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-lg font-black text-gray-900">{b.incidentCount}</div>
                        <div className="text-[10px] text-gray-400">incidents</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Top area callout */}
              {byBarangay?.topArea && (
                <div className="px-6 py-3.5 bg-red-50 border-t border-red-100 flex items-center gap-2 text-xs text-red-800">
                  <AlertTriangle size={13} className="text-red-500 shrink-0" />
                  <span>
                    <strong>{byBarangay.topArea.name}</strong> has the highest incident concentration with{" "}
                    <strong>{byBarangay.topArea.incidentCount}</strong> total reports ({byBarangay.topArea.percentage}% of all incidents).
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
