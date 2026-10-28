import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { TileLayer, Marker, Popup, Tooltip, Polygon, Polyline, Circle, CircleMarker, Pane, useMapEvents, useMap } from 'react-leaflet';
import { LifecycleMapContainer as MapContainer } from '@/components/shared/LifecycleMapContainer';
import { divIcon, Popup as LeafletPopup, type Marker as LeafletMarker, type TileLayer as LeafletTileLayer } from 'leaflet';
import { Ban, Crosshair, MapPinCheck } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import { MarkerLabel } from '@/components/ui/mapcn-marker-label';
import type { NearbyMapPin } from '@/lib/services/nearbyDetectionService';
import { formatNearbyReportDistance } from '@/lib/reportDistance';
import { presencePositionsForMap, type CitizenPresenceLayer } from '@/lib/citizenPresenceLocations';
import type { ReportPinReviewControl } from '@/types/report-pin-review';
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
// Fixed, trusted SVG. The tip remains exactly on the saved GPS coordinate.
// The 52px target remains keyboard/touch accessible without moving the pin.
const reviewPin = (flagged: boolean) => divIcon({
    className: `incident-location-pin report-review-pin${flagged ? ' report-review-pin-flagged' : ''}`,
    html: '<svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><path d="M22 48S6 32 6 24a16 16 0 1 1 32 0c0 8-16 24-16 24Z" fill="#dc2626" stroke="#fff" stroke-width="2"/><circle cx="22" cy="24" r="6" fill="#fff"/>'
      + (flagged ? '<circle cx="39" cy="12" r="11" fill="#fef3c7" stroke="#92400e" stroke-width="1.5"/><path d="M35 6v15m0-14c4-3 6 3 10 0v8c-4 3-6-3-10 0" fill="none" stroke="#92400e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' : '') + '</svg>',
    iconSize: [52, 52], iconAnchor: [22, 48], popupAnchor: [0, -42],
});
const reviewPinIcon = reviewPin(false), flaggedReviewPinIcon = reviewPin(true);

// A centred dot marks nearby reports without moving their recorded coordinates.
// The visible 24px dot has a larger 44px keyboard/click/touch target.
const nearbyDotOptions = {
    html: '<svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="12" fill="#fff"/><circle cx="22" cy="22" r="10" fill="#0089ff"/></svg>',
    iconSize: [44, 44] as [number, number],
    iconAnchor: [22, 22] as [number, number],
    popupAnchor: [0, -18] as [number, number],
};
const nearbyDotIcon = divIcon({ ...nearbyDotOptions, className: 'nearby-report-dot' });
const pendingNearbyDotIcon = divIcon({ ...nearbyDotOptions, className: 'nearby-report-dot nearby-report-dot-pending' });
const waitingNearbyDotIcon = divIcon({ ...nearbyDotOptions, className: 'nearby-report-dot nearby-report-dot-waiting' });

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
    nearbyReferenceLabel?: string;
    onNearbyReport?: (id: string) => void;
    reviewIncidentIds?: string[];
    waitingIncidentIds?: string[];
    selectedNearbyReportId?: string | null;
    onNearbyReportClose?: () => void;
    renderNearbyReport?: (id: string) => ReactNode;
    onlinePresence?: CitizenPresenceLayer;
    reportPinReview?: ReportPinReviewControl;
}

function NearbyMapPopup({ pin, onClose, children }: { pin: NearbyMapPin; onClose?: () => void; children: ReactNode }) {
    const map = useMap();
    const popup = useRef<LeafletPopup | null>(null);
    const [content, setContent] = useState<HTMLDivElement | null>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    const escape = useCallback((event: KeyboardEvent) => {
        if (event.key !== 'Escape') return;
        // A native listener on this popup excludes the secure-photo portal:
        // Escape closes the photo first, then closes this report on the next press.
        event.preventDefault(); event.stopPropagation(); popup.current?.close();
    }, []);
    const position = useMemo(() => [pin.latitude, pin.longitude] as [number, number], [pin.latitude, pin.longitude]);
    const [width, setWidth] = useState(() => Math.max(160, Math.min(340, map.getSize().x - 64)));
    useEffect(() => {
        if (popup.current) { popup.current.options.maxWidth = width; popup.current.update(); }
    }, [width]);
    useEffect(() => {
        let active = true;
        const resize = new ResizeObserver(() => {
            if (!active || !map.getContainer().isConnected || !map.getPane('mapPane')) return;
            map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
            setWidth(Math.max(160, Math.min(340, map.getSize().x - 64)));
            popup.current?.update();
        });
        resize.observe(map.getContainer());
        return () => { active = false; resize.disconnect(); };
    }, [map]);
    useEffect(() => {
        // Async report/photo/form changes must update Leaflet's layout too.
        let active = true;
        const resize = new ResizeObserver(() => {
            if (active && popup.current?.getElement()?.isConnected) popup.current.update();
        });
        if (content) resize.observe(content);
        return () => { active = false; resize.disconnect(); };
    }, [content]);
    return <Popup ref={popup} position={position} className="nearby-report-popup" minWidth={160} maxWidth={width} maxHeight={320}
        autoPanPadding={[16, 24]} closeOnClick={false} eventHandlers={{
            add: event => (event.target as LeafletPopup).getElement()?.addEventListener('keydown', escape),
            remove: event => { (event.target as LeafletPopup).getElement()?.removeEventListener('keydown', escape); onCloseRef.current?.(); },
        }}>
        <div ref={setContent}>{children}</div>
    </Popup>;
}

function ObserveMapSize({ reviewOpen }: { reviewOpen: boolean }) {
    const map = useMap();
    const beforeReview = useRef<ReturnType<typeof map.getCenter> | null>(null);
    useLayoutEffect(() => {
        // Capture before Leaflet's popup auto-pan, then restore the viewed area
        // on close. Do not change the zoom, recorded pin or circle geometry.
        if (reviewOpen) beforeReview.current = map.getCenter();
        else if (beforeReview.current) {
            map.panTo(beforeReview.current, { animate: false });
            beforeReview.current = null;
        }
    }, [map, reviewOpen]);
    useEffect(() => {
        // Keep the geographic centre stable while the card changes height;
        // pan:false leaves the pin against the compact viewport's bottom edge.
        let active = true;
        const observer = new ResizeObserver(() => {
            // A resize already queued before disconnect can arrive after the
            // detached Leaflet owner has disposed its panes. Do no stale work.
            if (active && map.getContainer().isConnected && map.getPane('mapPane')) {
                map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
            }
        });
        observer.observe(map.getContainer());
        return () => { active = false; observer.disconnect(); };
    }, [map]);
    return null;
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
    reportPinReview,
}: {
    position: [number, number] | null;
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
    onOutOfScopeClick?: () => void;
    nearbyLabel?: string;
    reportPinReview?: ReportPinReviewControl;
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

    const title = reportPinReview ? reportPinReview.flagStatus === 'CONFIRMED' ? 'Review department-confirmed report at this pin'
      : reportPinReview.flagStatus ? 'Review flagged report at this pin' : 'Review or flag report at this pin' : 'Emergency location pin';
    const openReview = () => { if (reportPinReview && !reportPinReview.busy) reportPinReview.onOpen(); };
    const updateMarker = (marker: LeafletMarker | null) => {
        if (!marker) return;
        marker.options.title = title;
        const element = marker.getElement();
        if (!element) return;
        element.title = title; element.setAttribute('aria-label', title);
        if (reportPinReview) {
            element.setAttribute('aria-haspopup', 'dialog');
            element.setAttribute('aria-busy', String(reportPinReview.busy));
            element.setAttribute('aria-disabled', String(reportPinReview.busy));
            element.setAttribute('data-report-flag-status', reportPinReview.flagStatus ?? 'NONE');
        } else for (const name of ['aria-haspopup', 'aria-busy', 'aria-disabled', 'data-report-flag-status']) element.removeAttribute(name);
    };
    return (
        <Marker position={position} icon={reportPinReview ? reportPinReview.flagStatus ? flaggedReviewPinIcon : reviewPinIcon : defaultIcon} zIndexOffset={500} alt={title} title={title}
            ref={updateMarker}
            eventHandlers={reportPinReview ? { add: event => updateMarker(event.target as LeafletMarker), click: openReview, keydown: event => {
                if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
                    event.originalEvent.preventDefault(); event.originalEvent.stopPropagation(); openReview();
                }
            } } : undefined}>
            {!reportPinReview && <Popup>
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
            </Popup>}
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
    nearbyPins = [], nearbyLabel, nearbyReferenceLabel, onNearbyReport, reviewIncidentIds, waitingIncidentIds,
    selectedNearbyReportId, onNearbyReportClose, renderNearbyReport, onlinePresence, reportPinReview
}: LocationMapProps) {
    const [scopeWarning, setScopeWarning] = useState(false);
    const warningTimerRef = useRef<NodeJS.Timeout | null>(null);
    const tileLayerRef = useRef<LeafletTileLayer | null>(null);
    const [tilesFailed, setTilesFailed] = useState(false);
    const nearbyMarkers = useRef(new Map<string, LeafletMarker>());
    const selectedNearbyPin = nearbyPins.find(pin => pin.incidentId === selectedNearbyReportId && reviewIncidentIds?.includes(pin.incidentId));
    const closeNearbyReport = () => {
        onNearbyReportClose?.();
        if (selectedNearbyReportId) requestAnimationFrame(() => nearbyMarkers.current.get(selectedNearbyReportId)?.getElement()?.focus({ preventScroll: true }));
    };

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

    // Contain Leaflet's high-z-index panes/controls beneath app dialogs,
    // even when reduced motion removes incidental animation stacking contexts.
    return (
        <div
            style={{ height, width: '100%' }}
            className={`relative isolate rounded-xl overflow-hidden border border-slate-300 shadow-sm${selectedNearbyPin && renderNearbyReport ? ' nearby-report-open' : ''}`}
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
                <ObserveMapSize reviewOpen={Boolean(selectedNearbyPin && renderNearbyReport)} />

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
                    reportPinReview={reportPinReview}
                />
                {/* Keep a close GPS dot visible above the tall own-location pin,
                    without moving either position or intercepting map controls. */}
                <Pane name="citizen-presence" style={{ zIndex: 610, pointerEvents: 'none' }}>
                    {hasValidCoords && presencePositionsForMap(onlinePresence, initialLat, initialLng).map((position, index) => <CircleMarker
                        key={`online-${index}`} center={[position.latitude, position.longitude]} radius={10} interactive={false}
                        className="citizen-presence-dot"
                        pathOptions={{ color: '#fff', weight: 2, fillColor: '#0089ff', fillOpacity: 1 }} />)}
                </Pane>
                {hasValidCoords && nearbyReferenceLabel && selectedNearbyPin && renderNearbyReport && <Polyline
                    positions={[[initialLat, initialLng], [selectedNearbyPin.latitude, selectedNearbyPin.longitude]]}
                    className="report-distance-reference"
                    interactive={false} pathOptions={{ color: '#0089ff', weight: 2, dashArray: '5 5' }} />}
                {nearbyPins.map(pin => {
                    const reviewable = reviewIncidentIds?.includes(pin.incidentId) === true;
                    const waiting = reviewable && waitingIncidentIds?.includes(pin.incidentId) === true;
                    const pending = reviewable && !waiting;
                    const openPending = reviewable && onNearbyReport ? () => onNearbyReport(pin.incidentId) : undefined;
                    const distance = formatNearbyReportDistance(pin.distanceMeters) ?? 'Distance unavailable';
                    const distanceLabel = `${distance}${nearbyReferenceLabel ? ` from ${nearbyReferenceLabel}` : ''}`;
                    const title = waiting ? `Review acknowledged nearby report · ${distance}` : pending ? `Review pending nearby report · ${distance}` : 'Nearby submitted report';
                    // Update Leaflet's creation-only title without replacing a
                    // focused dot when its pending/waiting phase changes.
                    return <Marker key={pin.incidentId} position={[pin.latitude, pin.longitude]}
                        ref={marker => {
                            if (marker) {
                                marker.options.title = title;
                                const element = marker.getElement();
                                if (element) {
                                    element.title = title;
                                    element.setAttribute('aria-label', `${title}${nearbyReferenceLabel ? ` from ${nearbyReferenceLabel}` : ''}`);
                                }
                                if (reviewable && renderNearbyReport) element?.setAttribute('aria-expanded', String(selectedNearbyReportId === pin.incidentId));
                                else element?.removeAttribute('aria-expanded');
                                nearbyMarkers.current.set(pin.incidentId, marker);
                            } else nearbyMarkers.current.delete(pin.incidentId);
                        }}
                        icon={waiting ? waitingNearbyDotIcon : pending ? pendingNearbyDotIcon : nearbyDotIcon}
                        zIndexOffset={reviewable ? 1000 : 0}
                        title={title}
                        alt={`${title}${nearbyReferenceLabel ? ` from ${nearbyReferenceLabel}` : ''}`}
                        eventHandlers={openPending ? { click: openPending, keydown: event => {
                            if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
                                event.originalEvent.preventDefault();
                                event.originalEvent.stopPropagation();
                                openPending();
                            }
                        } } : undefined}>
                        {(reviewable || reviewIncidentIds === undefined) && <Tooltip permanent interactive={!!openPending}
                            direction="top" offset={[0, -20]} className="nearby-map-tooltip">
                            <MarkerLabel className={openPending ? 'p-0' : undefined}>{openPending
                                ? <button type="button" className="min-h-11 rounded-md px-2 py-1 focus-visible:outline-2 focus-visible:outline-red-600"
                                    aria-expanded={renderNearbyReport ? selectedNearbyReportId === pin.incidentId : undefined}
                                    title={pin.flaggedForReview ? 'Flagged for review; proximity alone does not confirm a fake report.' : undefined}
                                    onClick={openPending}>{renderNearbyReport ? 'View report' : waiting ? 'Acknowledged · waiting to respond' : 'Pending nearby report'} · {distanceLabel}</button>
                                : <>{pin.flaggedForReview ? 'Flagged for review' : 'Nearby report'} · {distanceLabel}</>}
                            </MarkerLabel>
                        </Tooltip>}
                        {!openPending && <Popup>
                            {pin.flaggedForReview && <p>Flagged for review.</p>}
                            {reviewIncidentIds === undefined && onNearbyReport
                                ? <button type="button" className="min-h-11 px-3 text-sm font-semibold underline" onClick={() => onNearbyReport(pin.incidentId)}>Review nearby report</button>
                                : <span>Nearby submitted report — not awaiting your intake review.</span>}
                        </Popup>}
                    </Marker>;
                })}
                {selectedNearbyPin && renderNearbyReport && <NearbyMapPopup key={selectedNearbyPin.incidentId} pin={selectedNearbyPin} onClose={closeNearbyReport}>
                    {renderNearbyReport(selectedNearbyPin.incidentId)}
                </NearbyMapPopup>}
            </MapContainer>
        </div>
    );
}
