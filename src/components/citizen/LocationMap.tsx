import { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polygon, Polyline, Circle, useMapEvents, useMap } from 'react-leaflet';
import { divIcon, type TileLayer as LeafletTileLayer } from 'leaflet';
import { Ban, Crosshair, MapPinCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MarkerLabel } from '@/components/ui/mapcn-marker-label';
import type { NearbyMapPin } from '@/lib/services/nearbyDetectionService';
import {
    CORDOVA_CENTER,
    CORDOVA_BOUNDS,
    CORDOVA_BOUNDARY,
    CORDOVA_INVERTED_MASK,
    isPointInCordova,
    isWithinCordovaMapBounds,
} from '../../lib/cordovaBoundary';

// Static markup only: never interpolate report text into Leaflet HTML.
const defaultIcon = divIcon({
    className: 'incident-location-pin',
    html: '<svg width="36" height="44" viewBox="0 0 36 44" aria-hidden="true"><path d="M18 42S2 26 2 18a16 16 0 1 1 32 0c0 8-16 24-16 24Z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="18" cy="18" r="6" fill="#fff"/></svg>',
    iconSize: [36, 44],
    iconAnchor: [18, 42],
    popupAnchor: [0, -36],
});

// A distance reference, not GPS accuracy, incident extent or duplicate authority.
export const INCIDENT_REFERENCE_RADIUS_METERS = 100;

interface LocationMapProps {
    latitude: number | null;
    longitude: number | null;
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
    navigable?: boolean;
    zoom?: number;
    height?: string;
    nearbyPins?: NearbyMapPin[];
    nearbyLabel?: string;
    onNearbyReport?: (id: string) => void;
    reviewIncidentIds?: string[];
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
    onOutOfScopeClick,
    nearbyLabel,
}: {
    position: [number, number] | null;
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
    onOutOfScopeClick?: () => void;
    nearbyLabel?: string;
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

    if (!position) return null;

    return (
        <Marker position={position} icon={defaultIcon} alt="Emergency location pin" title="Emergency location pin">
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
            {nearbyLabel && <Tooltip permanent direction="top" offset={[0, -42]} className="nearby-map-tooltip"><MarkerLabel>{nearbyLabel}</MarkerLabel></Tooltip>}
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
    // Viewing controls never grant permission to select/edit the recorded pin.
    // This also lets the GPS-locked form zoom and pan without changing its fix.
    navigable = true,
    zoom = 16,
    height = '300px',
    nearbyPins = [], nearbyLabel, onNearbyReport, reviewIncidentIds
}: LocationMapProps) {
    const [scopeWarning, setScopeWarning] = useState(false);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const tileLayerRef = useRef<LeafletTileLayer | null>(null);
    const [tilesFailed, setTilesFailed] = useState(false);

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
            {tilesFailed && (
                <div role="status" className="absolute inset-x-2 top-2 z-[1000] rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                    Base map tiles could not load. The pin and radius still show the recorded coordinates.
                    <button type="button" className="ml-2 min-h-11 underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-red-600" onClick={() => { setTilesFailed(false); tileLayerRef.current?.redraw(); }}>Retry map tiles</button>
                </div>
            )}
            {/* Out-of-Scope Warning Toast */}
            {scopeWarning && (
                <div role="alert" className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xl">
                    <Ban className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>The map outline is approximate. The server will verify this pin before submission.</span>
                </div>
            )}

            {/* Scope Badge in Map Corner */}
            <div className="absolute bottom-7 left-2 z-[999] pointer-events-none rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-red-600 bg-red-100" aria-hidden="true" />{hasValidCoords ? '100 m reference radius' : 'No valid location pin'}</span>
            </div>

            <MapContainer
                center={[initialLat, initialLng]}
                zoom={zoom}
                minZoom={12}
                maxZoom={18}
                maxBounds={CORDOVA_BOUNDS}
                maxBoundsViscosity={1.0}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={false}
                dragging={navigable}
                zoomControl={navigable}
                keyboard={navigable}
                doubleClickZoom={navigable}
                touchZoom={navigable}
                boxZoom={navigable}
            >
                <TileLayer
                    ref={tileLayerRef}
                    eventHandlers={{ tileerror: () => setTilesFailed(true) }}
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

                {hasValidCoords && (
                    <Circle
                        center={[initialLat, initialLng]}
                        radius={INCIDENT_REFERENCE_RADIUS_METERS}
                        className="incident-reference-radius"
                        interactive={false}
                        pathOptions={{ color: '#dc2626', weight: 2, fillColor: '#dc2626', fillOpacity: 0.12 }}
                    />
                )}
                <LocationMarker
                    position={hasValidCoords ? [initialLat, initialLng] : null}
                    onLocationChange={onLocationChange}
                    interactive={interactive}
                    onOutOfScopeClick={triggerOutOfScopeWarning}
                    nearbyLabel={nearbyLabel}
                />
                {nearbyPins.map(pin => <Marker key={pin.incidentId} position={[pin.latitude, pin.longitude]} icon={defaultIcon} title="Nearby submitted report">
                    <Tooltip permanent direction="top" offset={[0, -42]} className="nearby-map-tooltip"><MarkerLabel>Nearby report · {pin.distanceMeters} m</MarkerLabel></Tooltip>
                    <Popup>{reviewIncidentIds === undefined || reviewIncidentIds.includes(pin.incidentId)
                      ? <button type="button" className="min-h-11 px-3 text-sm font-semibold underline" onClick={() => onNearbyReport?.(pin.incidentId)}>Review nearby report</button>
                      : <span>Nearby submitted report — not awaiting your intake review.</span>}</Popup>
                </Marker>)}
            </MapContainer>
        </div>
    );
}
