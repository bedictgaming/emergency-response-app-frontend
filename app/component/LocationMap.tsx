import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polygon, Polyline, useMapEvents, useMap } from 'react-leaflet';
import { Icon } from 'leaflet';
import { Ban, Crosshair, MapPinCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import {
    CORDOVA_CENTER,
    CORDOVA_BOUNDS,
    CORDOVA_BOUNDARY,
    CORDOVA_INVERTED_MASK,
    isPointInCordova,
    isWithinCordovaMapBounds,
} from '../lib/cordovaBoundary';

// Fix for default marker icon in React-Leaflet
const defaultIcon = new Icon({
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});

interface LocationMapProps {
    latitude: number | null;
    longitude: number | null;
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
    zoom?: number;
    height?: string;
}

function MapEffects() {
    const map = useMap();
    useEffect(() => {
        try {
            const svg = map.getPanes().overlayPane?.querySelector('svg');
            if (svg && !svg.querySelector('#cordova-soft-blur')) {
                const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
                const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
                filter.setAttribute('id', 'cordova-soft-blur');
                filter.setAttribute('x', '-10%');
                filter.setAttribute('y', '-10%');
                filter.setAttribute('width', '120%');
                filter.setAttribute('height', '120%');

                const blur = document.createElementNS('http://www.w3.org/2000/svg', 'feGaussianBlur');
                blur.setAttribute('stdDeviation', '3');
                filter.appendChild(blur);
                defs.appendChild(filter);
                svg.insertBefore(defs, svg.firstChild);
            }
        } catch {
            // Silently ignore SVG injection issues
        }
    }, [map]);
    return null;
}

function RecenterControl({
    onLocationChange,
    onOutOfScopeClick,
}: {
    onLocationChange?: (lat: number, lng: number) => void;
    onOutOfScopeClick?: () => void;
}) {
    const map = useMap();

    const confirmMapCenter = () => {
        const center = map.getCenter();
        if (!isWithinCordovaMapBounds(center.lat, center.lng)) {
            onOutOfScopeClick?.();
            return;
        }
        if (!isPointInCordova(center.lat, center.lng)) onOutOfScopeClick?.();
        onLocationChange?.(center.lat, center.lng);
    };

    return (
        <div className="leaflet-top leaflet-right" style={{ marginTop: '10px', marginRight: '10px', pointerEvents: 'auto' }}>
            <div className="leaflet-control flex flex-col gap-2">
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        map.flyTo(CORDOVA_CENTER, 14, { duration: 0.8 });
                    }}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 cursor-pointer"
                    title="Recenter to Cordova Center"
                >
                    <Crosshair className="h-4 w-4" aria-hidden="true" />
                    Cordova center
                </button>
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        confirmMapCenter();
                    }}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-red-700 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-md transition-colors hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 cursor-pointer"
                    title="Confirm the location currently at the center of the map"
                >
                    <MapPinCheck className="h-4 w-4" aria-hidden="true" />
                    Confirm center
                </button>
            </div>
        </div>
    );
}

function LocationMarker({
    position,
    onLocationChange,
    interactive,
    onOutOfScopeClick
}: {
    position: [number, number];
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
    onOutOfScopeClick?: () => void;
}) {
    useMapEvents({
        click(e) {
            if (interactive && onLocationChange) {
                if (!isWithinCordovaMapBounds(e.latlng.lat, e.latlng.lng)) {
                    onOutOfScopeClick?.();
                    return;
                }
                if (!isPointInCordova(e.latlng.lat, e.latlng.lng)) onOutOfScopeClick?.();
                onLocationChange(e.latlng.lat, e.latlng.lng);
            }
        },
    });

    return (
        <Marker position={position} icon={defaultIcon}>
            <Popup>
                {interactive ? (
                    <div className="text-center p-1">
                        <span className="inline-block px-2 py-0.5 mb-1 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full">
                            Pin selected
                        </span>
                        <p className="font-semibold text-sm text-slate-900">Emergency Location</p>
                        <p className="text-xs text-slate-600 mt-1 font-mono">
                            {position[0].toFixed(6)}, {position[1].toFixed(6)}
                        </p>
                        <p className="text-[11px] text-blue-600 mt-2 font-medium">Click map within Cordova to adjust</p>
                    </div>
                ) : (
                    <div className="text-center p-1">
                        <span className="inline-block px-2 py-0.5 mb-1 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-full">
                            Cordova Incident
                        </span>
                        <p className="font-semibold text-sm text-slate-900">Reported Location</p>
                        <p className="text-xs text-slate-600 mt-1 font-mono">
                            {position[0].toFixed(6)}, {position[1].toFixed(6)}
                        </p>
                    </div>
                )}
            </Popup>
        </Marker>
    );
}

function SyncMapCenter({ latitude, longitude }: { latitude: number; longitude: number }) {
    const map = useMap();

    useEffect(() => {
        // A new array is created on every form render. Depend on coordinates
        // instead so address/GPS UI updates do not snap the map back mid-pan.
        map.setView([latitude, longitude], map.getZoom(), { animate: false });
    }, [map, latitude, longitude]);

    return null;
}

export function LocationMap({
    latitude,
    longitude,
    onLocationChange,
    interactive = false,
    zoom = 14,
    height = '300px'
}: LocationMapProps) {
    const [scopeWarning, setScopeWarning] = useState(false);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => () => {
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    }, []);

    // The map outline is approximate. Keep an in-viewport pin visible even
    // if the server's more permissive barangay geometry accepts it outside
    // this visual boundary.
    const hasValidCoords = latitude !== null && longitude !== null && isWithinCordovaMapBounds(latitude, longitude);
    const initialLat = hasValidCoords ? latitude! : CORDOVA_CENTER[0];
    const initialLng = hasValidCoords ? longitude! : CORDOVA_CENTER[1];

    const triggerOutOfScopeWarning = () => {
        setScopeWarning(true);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningTimerRef.current = setTimeout(() => {
            setScopeWarning(false);
        }, 4500);
    };

    return (
        <div
            style={{ height, width: '100%' }}
            className="relative rounded-xl overflow-hidden border border-slate-300 shadow-sm"
            role="group"
            aria-label={interactive ? 'Choose the emergency location on the Cordova map' : 'Incident location map'}
        >
            {/* Out-of-Scope Warning Toast */}
            {scopeWarning && (
                <div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
                    <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>The map outline is approximate. The server will verify this pin before submission.</span>
                </div>
            )}

            {/* Scope Badge in Map Corner */}
            <div className="absolute bottom-2.5 left-2.5 z-[999] pointer-events-none bg-slate-900/80 backdrop-blur-md text-slate-200 text-[11px] font-medium px-2.5 py-1 rounded-md border border-slate-700/60 shadow-md flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Approximate Cordova outline</span>
            </div>

            <MapContainer
                center={[initialLat, initialLng]}
                zoom={zoom}
                minZoom={12}
                maxZoom={18}
                maxBounds={CORDOVA_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={interactive}
                dragging={interactive}
                zoomControl={interactive}
                keyboard={interactive}
                doubleClickZoom={interactive}
                touchZoom={interactive}
                boxZoom={interactive}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {/* SVG Blur Filter Injection */}
                <MapEffects />

                {/* Inverted Donut Mask: Covers the entire world OUTSIDE Cordova with blurred/frosted dark overlay */}
                <Polygon
                    positions={CORDOVA_INVERTED_MASK}
                    pathOptions={{
                        fillColor: '#020617',
                        fillOpacity: 0.65,
                        stroke: false,
                        className: 'cordova-mask-polygon'
                    }}
                    interactive={false}
                />

                {/* Glowing Boundary Border for Cordova Municipality */}
                <Polyline
                    positions={CORDOVA_BOUNDARY}
                    pathOptions={{
                        color: '#38bdf8',
                        weight: 2.5,
                        opacity: 0.9,
                        dashArray: '6, 6',
                        className: 'cordova-boundary-line'
                    }}
                    interactive={false}
                />

                {/* Recenter button for quick navigation within Cordova */}
                {interactive && (
                    <RecenterControl
                        onLocationChange={onLocationChange}
                        onOutOfScopeClick={triggerOutOfScopeWarning}
                    />
                )}

                <SyncMapCenter latitude={initialLat} longitude={initialLng} />

                <LocationMarker
                    position={[initialLat, initialLng]}
                    onLocationChange={onLocationChange}
                    interactive={interactive}
                    onOutOfScopeClick={triggerOutOfScopeWarning}
                />
            </MapContainer>
        </div>
    );
}
