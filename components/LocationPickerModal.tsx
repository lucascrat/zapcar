import React, { useEffect, useRef, useState } from 'react';

interface LocationPickerModalProps {
    onLocationSelect: (location: { lat: number; lng: number; address?: string }) => void;
    onClose: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({ onLocationSelect, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [map, setMap] = useState<google.maps.Map | null>(null);
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
    const markerRef = useRef<google.maps.Marker | null>(null);
    const [error, setError] = useState<string>('');

    useEffect(() => {
        const initializeMap = () => {
            if (!mapRef.current || !window.google) return;

            try {
                // Initialize Map
                const initialPos = { lat: -3.875, lng: -38.625 }; // Default to Fortaleza/CE or generic
                const mapInstance = new window.google.maps.Map(mapRef.current, {
                    center: initialPos,
                    zoom: 13,
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

                setMap(mapInstance);

                // Try to get current location
                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const pos = {
                            lat: position.coords.latitude,
                            lng: position.coords.longitude,
                        };
                        mapInstance.setCenter(pos);
                        mapInstance.setZoom(15);
                        updateMarker(pos, mapInstance);
                    }, (err) => {
                        console.warn("Geolocation failed", err);
                    });
                }

                // Initialize Places Autocomplete
                if (inputRef.current) {
                    const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current);
                    autocomplete.bindTo('bounds', mapInstance);

                    autocomplete.addListener('place_changed', () => {
                        const place = autocomplete.getPlace();
                        if (!place.geometry || !place.geometry.location) {
                            return;
                        }

                        if (place.geometry.viewport) {
                            mapInstance.fitBounds(place.geometry.viewport);
                        } else {
                            mapInstance.setCenter(place.geometry.location);
                            mapInstance.setZoom(17);
                        }

                        updateMarker(place.geometry.location.toJSON(), mapInstance, place.formatted_address);
                    });
                }

                // Map Click Listener
                mapInstance.addListener('click', (e: google.maps.MapMouseEvent) => {
                    if (e.latLng) {
                        updateMarker(e.latLng.toJSON(), mapInstance);
                    }
                });

            } catch (e) {
                console.error("Map initialization error", e);
                setError("Erro ao carregar o mapa. Verifique sua conexão.");
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
    }, []);

    const updateMarker = (location: { lat: number; lng: number }, mapInstance: google.maps.Map, address?: string) => {
        if (markerRef.current) {
            markerRef.current.setMap(null);
        }

        const newMarker = new window.google.maps.Marker({
            position: location,
            map: mapInstance,
            animation: window.google.maps.Animation.DROP
        });

        markerRef.current = newMarker;
        setSelectedLocation({ ...location, address });
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            <div className="bg-whatsapp-panel p-4 flex items-center gap-2 shadow-md z-10">
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                    <span className="material-icons">arrow_back</span>
                </button>
                <div className="flex-1 bg-[#2a3942] rounded-lg flex items-center px-4 py-2">
                    <span className="material-icons text-gray-400 mr-2">search</span>
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Buscar local..."
                        className="bg-transparent border-none outline-none text-white w-full placeholder-gray-400"
                    />
                </div>
            </div>

            <div className="flex-1 relative">
                <div ref={mapRef} className="w-full h-full" />
                {error && (
                    <div className="absolute top-4 left-4 right-4 bg-red-500/90 text-white p-3 rounded-lg z-20 text-center">
                        {error}
                    </div>
                )}

                {selectedLocation && (
                    <div className="absolute bottom-0 left-0 right-0 p-4 bg-whatsapp-panel border-t border-gray-700 flex items-center justify-between animate-slide-up-mobile">
                        <div className="flex flex-col">
                            <span className="text-white font-medium">Local selecionado</span>
                            <span className="text-gray-400 text-sm">
                                {selectedLocation.address || `${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)}`}
                            </span>
                        </div>
                        <button
                            onClick={() => onLocationSelect(selectedLocation)}
                            className="bg-whatsapp-green text-white px-6 py-3 rounded-full font-bold shadow-lg hover:bg-emerald-600 transition"
                        >
                            Enviar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
