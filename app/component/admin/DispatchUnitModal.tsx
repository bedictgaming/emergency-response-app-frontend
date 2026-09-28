"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Shield,
  Flame,
  Heart,
  Truck,
  AlertCircle,
  Loader2,
  Send,
} from "lucide-react";
import {
  Unit,
  getUnits,
  dispatchUnitToIncident,
} from "@/lib/services/unitService";

interface DispatchUnitModalProps {
  isOpen: boolean;
  incidentId: string;
  incidentTitle: string;
  incidentType?: string;
  incidentLocation?: string;
  onClose: () => void;
  onUnitDispatched: () => void;
}

export default function DispatchUnitModal({
  isOpen,
  incidentId,
  incidentTitle,
  incidentType = "Emergency",
  incidentLocation,
  onClose,
  onUnitDispatched,
}: DispatchUnitModalProps) {
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>("");
  const [role, setRole] = useState<string>("Primary Response");
  const [filterType, setFilterType] = useState<string>("Recommended");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      setErrorMessage("");
      setSelectedUnitId("");
      getUnits()
        .then((data) => {
          setUnits(data);
          // Pre-select first available recommended unit
          const typeLower = incidentType.toLowerCase();
          const recommended = data.filter((u) => {
            if (u.status !== "AVAILABLE") return false;
            const uType = u.unitType.toLowerCase();
            if (typeLower.includes("fire") && (uType.includes("fire") || uType.includes("tender") || uType.includes("ladder"))) return true;
            if (typeLower.includes("med") && (uType.includes("ambul") || uType.includes("med"))) return true;
            if (typeLower.includes("pol") && (uType.includes("patrol") || uType.includes("motor") || uType.includes("police"))) return true;
            return false;
          });

          if (recommended.length > 0) {
            setSelectedUnitId(recommended[0].unitId);
          } else {
            const firstAvail = data.find((u) => u.status === "AVAILABLE");
            if (firstAvail) setSelectedUnitId(firstAvail.unitId);
          }
        })
        .catch((err) => {
          console.error("Failed to load units:", err);
          setErrorMessage("Could not load unit roster. Please check network connection.");
        })
        .finally(() => setIsLoading(false));
    }
  }, [isOpen, incidentId, incidentType]);

  if (!isOpen) return null;

  const typeLower = incidentType.toLowerCase();

  const filteredUnits = units.filter((u) => {
    if (filterType === "All") return true;
    if (filterType === "Available") return u.status === "AVAILABLE";

    // "Recommended"
    const uType = u.unitType.toLowerCase();
    if (typeLower.includes("fire")) {
      return uType.includes("fire") || uType.includes("tender") || uType.includes("rescue") || uType.includes("ladder");
    }
    if (typeLower.includes("med")) {
      return uType.includes("ambul") || uType.includes("med") || uType.includes("clinic");
    }
    if (typeLower.includes("pol")) {
      return uType.includes("patrol") || uType.includes("motor") || uType.includes("police") || uType.includes("outpost");
    }
    return true;
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnitId) {
      setErrorMessage("Please select a unit to dispatch.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");

    try {
      await dispatchUnitToIncident(incidentId, {
        unitId: selectedUnitId,
        role: role.trim() || "Primary Response",
      });
      onUnitDispatched();
      onClose();
    } catch (err: unknown) {
      console.error("Failed to dispatch unit", err);
      const errObj = err as { response?: { data?: { message?: string } } };
      setErrorMessage(
        errObj.response?.data?.message || "Failed to dispatch unit. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const getUnitIcon = (unitType: string) => {
    const t = unitType.toLowerCase();
    if (t.includes("fire") || t.includes("tender") || t.includes("ladder")) {
      return <Flame className="w-5 h-5 text-red-500" />;
    }
    if (t.includes("ambul") || t.includes("med")) {
      return <Heart className="w-5 h-5 text-pink-500" />;
    }
    if (t.includes("patrol") || t.includes("police")) {
      return <Shield className="w-5 h-5 text-blue-500" />;
    }
    return <Truck className="w-5 h-5 text-amber-500" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="bg-[#0B0F19] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400">
              <Truck size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Dispatch Emergency Unit
              </h3>
              <p className="text-xs text-gray-400">
                Deploy units to incident #{incidentId.slice(0, 8)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Incident Summary Card */}
        <div className="bg-gray-50 border-b border-gray-200 px-6 py-3">
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block">
            Target Incident
          </span>
          <p className="text-xs font-bold text-gray-900 truncate">
            {incidentTitle}
          </p>
          {incidentLocation && (
            <p className="text-[11px] text-gray-500 truncate mt-0.5">
              📍 {incidentLocation}
            </p>
          )}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 flex-1 overflow-y-auto space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700 font-medium">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Unit Filter Tabs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Select Response Unit *
              </label>
              <div className="flex bg-gray-100 p-0.5 rounded-lg text-[11px] font-medium">
                {["Recommended", "Available", "All"].map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setFilterType(tab)}
                    className={`px-2 py-0.5 rounded-md transition-all ${
                      filterType === tab
                        ? "bg-white text-gray-900 shadow-sm font-semibold"
                        : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            {/* Units Selection List */}
            {isLoading ? (
              <div className="py-8 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                <span className="text-xs">Loading response units...</span>
              </div>
            ) : filteredUnits.length === 0 ? (
              <div className="py-6 text-center text-xs text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                No units match this filter.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {filteredUnits.map((unit) => {
                  const isAvailable = unit.status === "AVAILABLE";
                  const isSelected = selectedUnitId === unit.unitId;

                  return (
                    <div
                      key={unit.unitId}
                      onClick={() => {
                        if (isAvailable) setSelectedUnitId(unit.unitId);
                      }}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "border-red-500 bg-red-50/40 shadow-sm ring-1 ring-red-500"
                          : isAvailable
                          ? "border-gray-200 hover:border-gray-300 bg-white"
                          : "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 rounded-lg bg-gray-100 shrink-0">
                          {getUnitIcon(unit.unitType)}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 truncate">
                            {unit.unitName}
                          </p>
                          <span className="text-[11px] text-gray-500">
                            {unit.unitType}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            unit.status === "AVAILABLE"
                              ? "bg-emerald-100 text-emerald-700"
                              : unit.status === "DEPLOYED"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-200 text-gray-600"
                          }`}
                        >
                          {unit.status}
                        </span>

                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-red-600 bg-red-600 text-white"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Operational Role */}
          <div>
            <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
              Dispatch Role / Assignment Note
            </label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {[
                "Primary Response",
                "Water Supply",
                "Patient Transport",
                "Perimeter Control",
              ].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border text-left transition-all ${
                    role === r
                      ? "border-red-500 bg-red-50 text-red-700 font-semibold"
                      : "border-gray-200 hover:bg-gray-50 text-gray-600"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Primary Response, Search & Rescue"
              className="w-full px-3 py-2 text-xs border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedUnitId}
              className="px-5 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-xl shadow-md shadow-red-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>Confirm & Dispatch Unit</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
