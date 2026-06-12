import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import { Icon } from 'leaflet';
import 'leaflet/dist/leaflet.css';

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

function LocationMarker({
    position,
    onLocationChange,
    interactive
}: {
    position: [number, number];
    onLocationChange?: (lat: number, lng: number) => void;
    interactive?: boolean;
}) {
    const [markerPosition, setMarkerPosition] = useState(position);

    useMapEvents({
        click(e) {
            if (interactive && onLocationChange) {
                setMarkerPosition([e.latlng.lat, e.latlng.lng]);
                onLocationChange(e.latlng.lat, e.latlng.lng);
            }
        },
    });

    useEffect(() => {
        setMarkerPosition(position);
    }, [position]);

    return (
        <Marker position={markerPosition} icon={defaultIcon}>
            <Popup>
                {interactive ? (
                    <div className="text-center">
                        <p className="font-semibold text-sm">Emergency Location</p>
                        <p className="text-xs text-gray-600 mt-1">
                            {markerPosition[0].toFixed(6)}, {markerPosition[1].toFixed(6)}
                        </p>
                        <p className="text-xs text-blue-600 mt-2">Click map to adjust pin</p>
                    </div>
                ) : (
                    <div className="text-center">
                        <p className="font-semibold text-sm">Reported Location</p>
                        <p className="text-xs text-gray-600 mt-1">
                            {markerPosition[0].toFixed(6)}, {markerPosition[1].toFixed(6)}
                        </p>
                    </div>
                )}
            </Popup>
        </Marker>
    );
}

export function LocationMap({
    latitude,
    longitude,
    onLocationChange,
    interactive = false,
    zoom = 15,
    height = '300px'
}: LocationMapProps) {
    // Default to a central location if no coordinates provided
    const defaultLat = latitude ?? 37.7749;
    const defaultLng = longitude ?? -122.4194;

    return (
        <div style={{ height, width: '100%' }} className="rounded-lg overflow-hidden border border-gray-300">
            <MapContainer
                center={[defaultLat, defaultLng]}
                zoom={zoom}
                style={{ height: '100%', width: '100%' }}
                scrollWheelZoom={interactive}
                dragging={interactive}
                zoomControl={interactive}
            >
                <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker
                    position={[defaultLat, defaultLng]}
                    onLocationChange={onLocationChange}
                    interactive={interactive}
                />
            </MapContainer>
        </div>
    );
}