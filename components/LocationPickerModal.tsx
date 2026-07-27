import React, { useEffect, useRef, useState } from 'react';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { geocodeReverse, GeocodeResult } from '../services/placesService';
import { getMapProviderPromise } from '../services/googleMapsLoader';
import {
    createMap, destroyMap, addNavigationControl, onMapClick, addMarker, removeMarker, panTo, setZoom,
    MapHandle, MarkerHandle,
} from '../services/mapAdapter';

interface LocationPickerModalProps {
    onLocationSelect: (location: { lat: number; lng: number; address?: string }) => void;
    onClose: () => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({ onLocationSelect, onClose }) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<MapHandle | null>(null);
    const markerRef = useRef<MarkerHandle | null>(null);
    const [searchText, setSearchText] = useState('');
    const [proximity, setProximity] = useState<[number, number] | undefined>(undefined);
    const [selectedLocation, setSelectedLocation] = useState<{ lat: number; lng: number; address?: string } | null>(null);
    const [error, setError] = useState<string>('');

    const placeMarker = (handle: MapHandle, location: { lat: number; lng: number }, address?: string) => {
        if (markerRef.current) {
            removeMarker(markerRef.current);
        }
        markerRef.current = addMarker(handle, { lat: location.lat, lng: location.lng, color: '#00a884' });
        setSelectedLocation({ ...location, address });
    };

    useEffect(() => {
        if (!mapRef.current || mapInstanceRef.current) return;
        let cancelled = false;

        getMapProviderPromise().then((provider) => {
            if (cancelled || !mapRef.current || mapInstanceRef.current) return;

            try {
                const initialPos = { lat: -5.1775, lng: -40.665 }; // Crateús/CE, cidade real de operação (GPS recentraliza ao carregar)
                const handle = createMap(provider, mapRef.current, {
                    center: initialPos,
                    zoom: 13,
                    style: 'dark',
                });
                addNavigationControl(handle);
                mapInstanceRef.current = handle;

                if (navigator.geolocation) {
                    navigator.geolocation.getCurrentPosition((position) => {
                        const pos: [number, number] = [position.coords.longitude, position.coords.latitude];
                        setProximity(pos);
                        panTo(handle, { lat: position.coords.latitude, lng: position.coords.longitude });
                        setZoom(handle, 15);
                    }, (err) => {
                        console.warn("Geolocation failed", err);
                    });
                }

                onMapClick(handle, async ({ lat, lng }) => {
                    placeMarker(handle, { lat, lng });
                    const address = await geocodeReverse(lng, lat);
                    setSelectedLocation({ lat, lng, address: address || undefined });
                });
            } catch (e) {
                console.error("Map initialization error", e);
                setError("Erro ao carregar o mapa. Verifique sua conexão.");
            }
        });

        return () => {
            cancelled = true;
            if (mapInstanceRef.current) {
                destroyMap(mapInstanceRef.current);
                mapInstanceRef.current = null;
            }
        };
    }, []);

    const handleSelectPlace = (place: GeocodeResult) => {
        setSearchText(place.address);
        const handle = mapInstanceRef.current;
        if (!handle) return;
        panTo(handle, { lat: place.lat, lng: place.lng });
        setZoom(handle, 17);
        placeMarker(handle, { lat: place.lat, lng: place.lng }, place.address);
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-fade-in">
            <div className="bg-whatsapp-panel p-4 flex items-center gap-2 shadow-md z-10">
                <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
                    <span className="material-icons">arrow_back</span>
                </button>
                <div className="flex-1 bg-[#2a3942] rounded-lg flex items-center px-4 py-2">
                    <span className="material-icons text-gray-400 mr-2">search</span>
                    <AddressAutocompleteInput
                        value={searchText}
                        onChangeText={setSearchText}
                        onSelectPlace={handleSelectPlace}
                        placeholder="Buscar local..."
                        proximity={proximity}
                        inputClassName="bg-transparent border-none outline-none text-white w-full placeholder-gray-400"
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
