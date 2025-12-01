import React, { useEffect, useRef, useState } from 'react';
import { UserProfile } from '../types';
import { supabase } from '../services/supabaseClient';

interface ClientMapModalProps {
    driver: UserProfile;
    onClose: () => void;
}

export const ClientMapModal: React.FC<ClientMapModalProps> = ({ driver, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(
        driver.lat && driver.lng ? { lat: driver.lat, lng: driver.lng } : null
    );
    const [error, setError] = useState<string>('');
    const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

    useEffect(() => {
        const initializeMap = () => {
            if (!mapRef.current || !window.google || !driverLocation) return;

            try {
                const map = new window.google.maps.Map(mapRef.current, {
                    zoom: 15,
                    center: driverLocation,
                    disableDefaultUI: false,
                    styles: [
                        { "elementType": "geometry", "stylers": [{ "color": "#242f3e" }] },
                        { "elementType": "labels.text.stroke", "stylers": [{ "color": "#242f3e" }] },
                        { "elementType": "labels.text.fill", "stylers": [{ "color": "#746855" }] },
                        { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#38414e" }] },
                        { "featureType": "road", "elementType": "geometry.stroke", "stylers": [{ "color": "#212a37" }] },
                        { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#17263c" }] }
                    ]
                });

                // Create custom icon based on vehicle type
                const iconUrl = driver.vehicle_type === 'motorcycle'
                    ? 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="11" fill="#00a884" stroke="#fff" stroke-width="2"/>
                            <text x="12" y="17" font-size="16" text-anchor="middle" fill="#fff">🏍️</text>
                        </svg>
                    `)
                    : 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="11" fill="#00a884" stroke="#fff" stroke-width="2"/>
                            <text x="12" y="17" font-size="16" text-anchor="middle" fill="#fff">🚗</text>
                        </svg>
                    `);

                const marker = new window.google.maps.Marker({
                    position: driverLocation,
                    map: map,
                    icon: {
                        url: iconUrl,
                        scaledSize: new window.google.maps.Size(48, 48),
                        anchor: new window.google.maps.Point(24, 24)
                    },
                    title: driver.username,
                    animation: window.google.maps.Animation.DROP
                });

                markerRef.current = marker;

                // Info window
                const infoWindow = new window.google.maps.InfoWindow({
                    content: `
                        <div style="color: #000; padding: 8px;">
                            <strong>${driver.username}</strong><br/>
                            <span style="color: #666;">${driver.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}</span>
                        </div>
                    `
                });

                marker.addListener('click', () => {
                    infoWindow.open(map, marker);
                });

            } catch (e) {
                console.error("Map initialization error", e);
                setError("Erro ao inicializar o mapa.");
            }
        };

        if (window.google && window.google.maps) {
            initializeMap();
        } else {
            const handleMapsLoaded = () => {
                initializeMap();
            };
            window.addEventListener('google-maps-loaded', handleMapsLoaded);
            return () => window.removeEventListener('google-maps-loaded', handleMapsLoaded);
        }

    }, [driverLocation, driver]);

    // Real-time location updates
    useEffect(() => {
        const channel = supabase
            .channel(`driver-location-${driver.id}`)
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'users',
                filter: `id=eq.${driver.id}`
            }, (payload: any) => {
                const newData = payload.new;
                if (newData.lat && newData.lng) {
                    const newLocation = { lat: newData.lat, lng: newData.lng };
                    setDriverLocation(newLocation);
                    setLastUpdate(new Date());

                    // Update marker position with animation
                    if (markerRef.current) {
                        markerRef.current.setPosition(newLocation);
                        markerRef.current.setAnimation(window.google.maps.Animation.BOUNCE);
                        setTimeout(() => {
                            markerRef.current?.setAnimation(null);
                        }, 1000);
                    }
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [driver.id]);

    if (!driverLocation) {
        return (
            <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center">
                <div className="bg-whatsapp-panel p-8 rounded-lg text-center">
                    <span className="material-icons text-6xl text-gray-400 mb-4">location_off</span>
                    <p className="text-white text-lg mb-4">Localização do motorista não disponível</p>
                    <button onClick={onClose} className="bg-whatsapp-green text-white px-6 py-3 rounded-full font-bold">
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center justify-between shadow-md z-10">
                <div className="flex flex-col">
                    <h2 className="text-white font-bold text-lg flex items-center gap-2">
                        <span className="material-icons">{driver.vehicle_type === 'motorcycle' ? 'two_wheeler' : 'directions_car'}</span>
                        {driver.username}
                    </h2>
                    <span className="text-gray-400 text-xs">
                        Atualizado há {Math.floor((new Date().getTime() - lastUpdate.getTime()) / 1000)}s
                    </span>
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

                {/* Floating Info */}
                <div className="absolute bottom-6 left-6 right-6 bg-whatsapp-panel/95 backdrop-blur-sm p-4 rounded-xl shadow-lg border border-gray-700">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full bg-whatsapp-green flex items-center justify-center text-2xl">
                                {driver.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'}
                            </div>
                            <div>
                                <p className="text-white font-bold">{driver.username}</p>
                                <p className="text-gray-400 text-sm">
                                    {driver.vehicle_type === 'motorcycle' ? 'Motocicleta' : 'Automóvel'}
                                </p>
                            </div>
                        </div>
                        <a
                            href={`https://www.google.com/maps/search/?api=1&query=${driverLocation.lat},${driverLocation.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-bold hover:bg-blue-700 transition flex items-center gap-1"
                        >
                            <span className="material-icons text-sm">navigation</span>
                            Abrir
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
