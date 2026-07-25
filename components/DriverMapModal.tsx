import React, { useEffect, useRef, useState } from 'react';
import { getDirections } from '../services/placesService';
import { getMapProviderPromise } from '../services/googleMapsLoader';
import {
    createMap, destroyMap, addNavigationControl, addMarker, drawRoute, fitBounds,
    MapHandle,
} from '../services/mapAdapter';

interface DriverMapModalProps {
    clientLocation: { lat: number; lng: number };
    driverLocation: { lat: number; lng: number };
    onClose: () => void;
}

const pinMarker = (color: string) => {
    const el = document.createElement('div');
    el.innerHTML = `<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="${color}" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>`;
    return el;
};

export const DriverMapModal: React.FC<DriverMapModalProps> = ({ clientLocation, driverLocation, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<MapHandle | null>(null);
    const [distance, setDistance] = useState<string>('');
    const [duration, setDuration] = useState<string>('');
    const [error, setError] = useState<string>('');

    useEffect(() => {
        if (!mapRef.current) return;
        let cancelled = false;

        getMapProviderPromise().then(async (provider) => {
            if (cancelled || !mapRef.current) return;

            const handle = createMap(provider, mapRef.current, {
                center: driverLocation,
                zoom: 13,
                style: 'dark',
            });
            addNavigationControl(handle);
            mapInstanceRef.current = handle;

            addMarker(handle, { lat: driverLocation.lat, lng: driverLocation.lng, element: pinMarker('#2563EB') });
            addMarker(handle, { lat: clientLocation.lat, lng: clientLocation.lng, element: pinMarker('#25D366') });

            try {
                const route = await getDirections(
                    [driverLocation.lng, driverLocation.lat],
                    [clientLocation.lng, clientLocation.lat]
                );

                if (cancelled) return;
                if (!route) {
                    setError('Erro ao traçar rota.');
                    return;
                }

                const distanceKm = route.distanceMeters / 1000;
                const durationMin = Math.round(route.durationSeconds / 60);
                setDistance(`${distanceKm.toFixed(1)} km`);
                setDuration(`${durationMin} min`);

                drawRoute(handle, route.geometry.coordinates as [number, number][], { color: '#00a884', width: 6 });
                fitBounds(handle, route.geometry.coordinates as [number, number][], 60);
            } catch (e) {
                console.error("Directions request failed", e);
                setError('Erro ao traçar rota.');
            }
        });

        return () => {
            cancelled = true;
            if (mapInstanceRef.current) {
                destroyMap(mapInstanceRef.current);
                mapInstanceRef.current = null;
            }
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
