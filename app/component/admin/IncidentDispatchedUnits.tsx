"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Truck,
  Navigation,
  CheckCircle2,
  X,
  Plus,
  Loader2,
} from "lucide-react";
import {
  IncidentUnit,
  IncidentUnitStatus,
  getIncidentUnits,
  updateIncidentUnitStatus,
  removeUnitFromIncident,
} from "@/lib/services/unitService";
import DispatchUnitModal from "./DispatchUnitModal";

interface IncidentDispatchedUnitsProps {
  incidentId: string;
  initialUnits?: IncidentUnit[];
  incidentTitle: string;
  incidentType?: string;
  incidentLocation?: string;
  incidentStatus?: string;
  onStatusChange?: () => void;
}

export default function IncidentDispatchedUnits({
  incidentId,
  initialUnits,
  incidentTitle,
  incidentType = "Emergency",
  incidentLocation,
  incidentStatus,
  onStatusChange,
}: IncidentDispatchedUnitsProps) {
  const [dispatchedUnits, setDispatchedUnits] = useState<IncidentUnit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadUnits = useCallback(async () => {
    try {
      const units = await getIncidentUnits(incidentId);
      setDispatchedUnits(units);
    } catch (err) {
      console.warn("Failed to load dispatched units:", err);
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (initialUnits) {
      // The paginated incident API already includes dispatched units. Parent
      // SSE/visibility refreshes update this snapshot; avoid one fetch and
      // one recurring poll per card on the Fire dashboard.
      setDispatchedUnits(initialUnits);
      setIsLoading(false);
      return;
    }
    void loadUnits();
    const interval = setInterval(loadUnits, 10000);
    return () => clearInterval(interval);
  }, [initialUnits, loadUnits]);

  const handleAdvanceStatus = async (item: IncidentUnit) => {
    let nextStatus: IncidentUnitStatus = "EN_ROUTE";
    if (item.status === "DISPATCHED") nextStatus = "EN_ROUTE";
    else if (item.status === "EN_ROUTE") nextStatus = "ON_SCENE";
    else if (item.status === "ON_SCENE") nextStatus = "RETURNED";
    else return;

    setActionLoadingId(item.incidentUnitId);
    try {
      await updateIncidentUnitStatus(item.incidentUnitId, { status: nextStatus });
      await loadUnits();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      console.error("Failed to advance unit status:", err);
      alert("Could not update unit status. Please try again.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRemoveUnit = async (unitId: string) => {
    if (!confirm("Are you sure you want to recall/unassign this unit from the incident?")) return;
    try {
      await removeUnitFromIncident(incidentId, unitId);
      await loadUnits();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      console.error("Failed to remove unit:", err);
      alert("Could not remove unit. Please try again.");
    }
  };

  const getStatusBadge = (status: IncidentUnitStatus) => {
    switch (status) {
      case "DISPATCHED":
        return {
          bg: "bg-amber-100 text-amber-800 border-amber-300",
          label: "DISPATCHED",
          nextAction: "Mark En Route",
          nextIcon: <Navigation size={11} />,
        };
      case "EN_ROUTE":
        return {
          bg: "bg-blue-100 text-blue-800 border-blue-300 animate-pulse",
          label: "EN ROUTE",
          nextAction: "Mark On Scene",
          nextIcon: <CheckCircle2 size={11} />,
        };
      case "ON_SCENE":
        return {
          bg: "bg-emerald-100 text-emerald-800 border-emerald-300",
          label: "ON SCENE",
          nextAction: "Mark Returned",
          nextIcon: <CheckCircle2 size={11} />,
        };
      case "RETURNED":
        return {
          bg: "bg-gray-100 text-gray-600 border-gray-200",
          label: "RETURNED",
          nextAction: null,
          nextIcon: null,
        };
    }
  };

  const isResolved =
    incidentStatus?.toLowerCase() === "resolved" ||
    incidentStatus?.toLowerCase() === "closed";

  return (
    <div className="mt-3.5 mb-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Truck size={15} className="text-slate-600" />
          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
            Assigned Response Units ({dispatchedUnits.length})
          </span>
        </div>

        {!isResolved && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 hover:border-red-600 rounded-lg transition-all shadow-sm active:scale-95"
          >
            <Plus size={12} />
            <span>Dispatch Unit</span>
          </button>
        )}
      </div>

      {isLoading && dispatchedUnits.length === 0 ? (
        <div className="py-2 flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={13} className="animate-spin" />
          <span>Checking units...</span>
        </div>
      ) : dispatchedUnits.length === 0 ? (
        <div className="py-2 text-[11px] text-gray-500 flex items-center justify-between">
          <span>No response units deployed to this incident yet.</span>
          {!isResolved && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="text-red-600 font-bold hover:underline"
            >
              Dispatch now →
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {dispatchedUnits.map((item) => {
            const badge = getStatusBadge(item.status);
            const isActing = actionLoadingId === item.incidentUnitId;

            return (
              <div
                key={item.incidentUnitId}
                className="p-2.5 bg-white rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 shadow-xs"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-7 h-7 rounded-md bg-slate-100 flex items-center justify-center text-slate-700 shrink-0">
                    <Truck size={14} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {item.unit.unitName}
                      </p>
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${badge.bg}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {item.role || "Operational Response"} •{" "}
                      <span className="text-gray-400">
                        {new Date(item.assignedAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  {badge.nextAction && !isResolved && (
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleAdvanceStatus(item)}
                      className="px-2.5 py-1 text-[10px] font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-md flex items-center gap-1 transition-all disabled:opacity-50"
                      title={`Advance to ${badge.nextAction}`}
                    >
                      {isActing ? (
                        <Loader2 size={10} className="animate-spin" />
                      ) : (
                        badge.nextIcon
                      )}
                      <span>{badge.nextAction}</span>
                    </button>
                  )}

                  {!isResolved && (
                    <button
                      type="button"
                      onClick={() => handleRemoveUnit(item.unitId)}
                      className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
                      title="Recall / Unassign Unit"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dispatch Unit Modal */}
      <DispatchUnitModal
        isOpen={isModalOpen}
        incidentId={incidentId}
        incidentTitle={incidentTitle}
        incidentType={incidentType}
        incidentLocation={incidentLocation}
        onClose={() => setIsModalOpen(false)}
        onUnitDispatched={() => {
          loadUnits();
          if (onStatusChange) onStatusChange();
        }}
      />
    </div>
  );
}
