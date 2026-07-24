import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { getDirections } from '../services/mapboxService';

interface DriverMapModalProps {
    clientLocation: { lat: number; lng: number };
    driverLocation: { lat: number; lng: number };
    onClose: () => void;
}

const ROUTE_SOURCE_ID = 'driver-route';
const ROUTE_LAYER_ID = 'driver-route-line';

export const DriverMapModal: React.FC<DriverMapModalProps> = ({ clientLocation, driverLocation, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
    const [distance, setDistance] = useState<string>('');
    const [duration, setDuration] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        if (!mapRef.current) return;

        const map = new mapboxgl.Map({
            container: mapRef.current,
            style: 'mapbox://styles/mapbox/dark-v11',
            center: [driverLocation.lng, driverLocation.lat],
            zoom: 13,
        });
        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        mapInstanceRef.current = map;

        new mapboxgl.Marker({ color: '#00a884' })
            .setLngLat([driverLocation.lng, driverLocation.lat])
            .addTo(map);
        new mapboxgl.Marker({ color: '#ef4444' })
            .setLngLat([clientLocation.lng, clientLocation.lat])
            .addTo(map);

        const drawRoute = async () => {
            try {
                const route = await getDirections(
                    [driverLocation.lng, driverLocation.lat],
                    [clientLocation.lng, clientLocation.lat]
                );

                if (!route) {
                    setError('Erro ao traçar rota.');
                    return;
                }

                const distanceKm = route.distanceMeters / 1000;
                const durationMin = Math.round(route.durationSeconds / 60);
                setDistance(`${distanceKm.toFixed(1)} km`);
                setDuration(`${durationMin} min`);

                const applyRoute = () => {
                    if (map.getSource(ROUTE_SOURCE_ID)) {
                        (map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource).setData({
                            type: 'Feature',
                            properties: {},
                            geometry: route.geometry,
                        });
                    } else {
                        map.addSource(ROUTE_SOURCE_ID, {
                            type: 'geojson',
                            data: { type: 'Feature', properties: {}, geometry: route.geometry },
                        });
                        map.addLayer({
                            id: ROUTE_LAYER_ID,
                            type: 'line',
                            source: ROUTE_SOURCE_ID,
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#00a884', 'line-width': 6 },
                        });
                    }

                    const coords = route.geometry.coordinates as [number, number][];
                    const bounds = coords.reduce(
                        (b, c) => b.extend(c),
                        new mapboxgl.LngLatBounds(coords[0], coords[0])
                    );
                    map.fitBounds(bounds, { padding: 60 });
                };

                if (map.isStyleLoaded()) {
                    applyRoute();
                } else {
                    map.once('load', applyRoute);
                }
            } catch (e) {
                console.error("Directions request failed", e);
                setError('Erro ao traçar rota.');
            }
        };

        drawRoute();

        return () => {
            map.remove();
            mapInstanceRef.current = null;
        };
    }, [clientLocation, driverLocation]);

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-lg">Rota até o Cliente</h2>
                    {distance && duration && (
                        <span className="text-whatsapp-green text-sm font-mono">
                            {distance} • {duration}
                        </span>
                    )}
                    {error && (
                        <span className="text-red-500 text-xs">{error}</span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-2 bg-gray-700 rounded-full text-white hover:bg-gray-600 transition"
                >
                    <span className="material-icons">close</span>
                </button>
            </div>

            {/* Map Container */}
            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />

                {/* Floating Action Button to Open in Google Maps App */}
                <a
                    href={`https://www.google.com/maps/dir/?api=1&origin=${driverLocation.lat},${driverLocation.lng}&destination=${clientLocation.lat},${clientLocation.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute bottom-6 right-6 bg-blue-600 text-white p-4 rounded-full shadow-lg flex items-center gap-2 hover:bg-blue-700 transition animate-bounce"
                >
                    <span className="material-icons">navigation</span>
                    <span className="font-bold">Navegar</span>
                </a>
            </div>
        </div>
    );
};
