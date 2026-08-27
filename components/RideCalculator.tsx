import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, UserProfile } from '../types';
import { fetchAppSettings } from '../services/supabaseClient';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { geocodeForward, geocodeReverse, getDirections, GeocodeResult } from '../services/placesService';
import { getMapProviderPromise } from '../services/googleMapsLoader';
import {
    createMap, destroyMap, addNavigationControl, addMarker, removeMarker, drawRoute, fitBounds, panTo, setZoom,
    MapHandle, MarkerHandle,
} from '../services/mapAdapter';
import { calculateCategoryPrice } from '../services/pricing';
import { useVehicleCategories } from '../src/contexts/VehicleCategoriesContext';

interface RideCalculatorProps {
    currentUser: UserProfile;
    onClose: () => void;
}

const pinMarker = (svg: string) => {
    const el = document.createElement('div');
    el.innerHTML = svg;
    return el;
};

export const RideCalculator: React.FC<RideCalculatorProps> = ({ currentUser, onClose }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [proximity, setProximity] = useState<[number, number] | undefined>(undefined);
    const [vehicleType, setVehicleType] = useState<string>('car');
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const { categories: vehicleCategories } = useVehicleCategories();

    const [result, setResult] = useState<{
        distanceKm: number;
        durationMin: number;
        price: number;
    } | null>(null);

    const [loading, setLoading] = useState(false);

    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<MapHandle | null>(null);
    const startMarker = useRef<MarkerHandle | null>(null);
    const endMarker = useRef<MarkerHandle | null>(null);
    // Incrementa quando o mapa termina de ser criado (async, pode depender do
    // carregamento do script do Google) — outros efeitos que dependem do
    // mapa já existir usam isso pra rodar de novo assim que ele fica pronto.
    const [mapReadyTick, setMapReadyTick] = useState(0);

    // Load Settings
    useEffect(() => {
        fetchAppSettings().then(setSettings);
        if (currentUser.role === 'driver' && currentUser.vehicle_type) {
            setVehicleType(currentUser.vehicle_type);
        }
    }, [currentUser]);

    // Initialize Map
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;
        let cancelled = false;

        getMapProviderPromise().then((provider) => {
            if (cancelled || !mapRef.current || mapInstance.current) return;
            const handle = createMap(provider, mapRef.current, {
                center: { lat: -5.1775, lng: -40.665 }, // Crateús/CE, cidade real de operação (GPS recentraliza ao carregar)
                zoom: 12,
                style: 'streets',
            });
            addNavigationControl(handle);
            mapInstance.current = handle;
            setMapReadyTick(t => t + 1);
        });

        return () => {
            cancelled = true;
            if (mapInstance.current) {
                destroyMap(mapInstance.current);
                mapInstance.current = null;
            }
        };
    }, []);

    // Auto-fill Origin with Current Location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(async (position) => {
                const { latitude, longitude } = position.coords;
                setProximity([longitude, latitude]);
                setOriginCoords({ lat: latitude, lng: longitude });

                const address = await geocodeReverse(longitude, latitude);
                if (address) {
                    setOrigin(address);
                }
            }, (err) => {
                console.warn("Error getting location for calculator:", err);
            });
        }
    }, []);

    // Centraliza o mapa e coloca o marcador "Sua Localização" assim que
    // tivermos AMBOS a posição do GPS e o mapa pronto (podem ficar prontos
    // em qualquer ordem, já que a criação do mapa agora é assíncrona).
    useEffect(() => {
        const handle = mapInstance.current;
        if (!handle || !originCoords) return;
        panTo(handle, originCoords);
        setZoom(handle, 15);
        addMarker(handle, { lat: originCoords.lat, lng: originCoords.lng, color: '#4285F4', popupHtml: 'Sua Localização' });
    }, [originCoords, mapReadyTick]);

    const handleCalculate = async () => {
        if (!origin || !destination || !settings) return;

        setLoading(true);
        setResult(null);

        try {
            // Resolve coordinates if the user typed freely without picking a suggestion
            let originPoint = originCoords;
            if (!originPoint) {
                const matches = await geocodeForward(origin, proximity);
                if (matches[0]) originPoint = { lat: matches[0].lat, lng: matches[0].lng };
            }

            let destPoint = destCoords;
            if (!destPoint) {
                const matches = await geocodeForward(destination, proximity);
                if (matches[0]) destPoint = { lat: matches[0].lat, lng: matches[0].lng };
            }

            if (!originPoint || !destPoint) {
                alert("Não foi possível localizar os endereços. Verifique e tente novamente.");
                setLoading(false);
                return;
            }

            const route = await getDirections(
                [originPoint.lng, originPoint.lat],
                [destPoint.lng, destPoint.lat]
            );

            if (!route) {
                alert("Não foi possível traçar a rota. Verifique os endereços.");
                setLoading(false);
                return;
            }

            // Render Route + start/end markers on Map
            const handle = mapInstance.current;
            if (handle) {
                removeMarker(startMarker.current);
                removeMarker(endMarker.current);
                startMarker.current = addMarker(handle, {
                    lat: originPoint.lat, lng: originPoint.lng,
                    element: pinMarker('<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>'),
                });
                endMarker.current = addMarker(handle, {
                    lat: destPoint.lat, lng: destPoint.lng,
                    element: pinMarker('<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="8" fill="#111B21" stroke="#FF4444" stroke-width="4"/><path d="M14 10V30M14 12C14 12 17 10 20 10C23 10 26 14 29 14V22C29 22 26 18 23 18C20 18 17 22 14 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'),
                });

                drawRoute(handle, route.geometry.coordinates as [number, number][], { color: '#25D366', width: 6 });
                fitBounds(handle, route.geometry.coordinates as [number, number][], 40);
            }

            const distanceMeters = route.distanceMeters;
            const durationSeconds = route.durationSeconds;
            const distanceKm = distanceMeters / 1000;
            const durationMin = durationSeconds / 60;

            // Preço via services/pricing.ts (fonte única - ver comentário no
            // topo daquele arquivo sobre o bug histórico de tarifa mínima/
            // preço por minuto noturno-madrugada que essa troca corrige).
            const category = vehicleCategories.find(c => c.slug === vehicleType);
            if (!category) {
                alert("Categoria de veículo não encontrada.");
                setLoading(false);
                return;
            }
            const { price: finalPrice } = calculateCategoryPrice(category, distanceKm, durationMin, new Date(), {
                nightStartTime: settings.night_start_time,
                nightEndTime: settings.night_end_time,
                dawnStartTime: settings.dawn_start_time,
                dawnEndTime: settings.dawn_end_time,
            });

            setResult({
                distanceKm,
                durationMin,
                price: finalPrice
            });

        } catch (error) {
            console.error("Erro ao calcular:", error);
            alert("Erro inesperado ao calcular rota.");
        } finally {
            setLoading(false);
        }
    };

    // Helper to format currency
    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 animate-fade-in">
            <div className="w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="bg-whatsapp-green p-4 flex justify-between items-center text-white shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="material-icons">calculate</span>
                        <span className="font-bold text-lg">Simular Corrida</span>
                    </div>
                    <button onClick={onClose} className="hover:bg-white/20 p-1 rounded-full transition">
                        <span className="material-icons">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1 flex flex-col">

                    {/* Vehicle Selector */}
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-4 shrink-0">
                        <button
                            onClick={() => setVehicleType('car')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition ${vehicleType === 'car' ? 'bg-white text-whatsapp-green shadow-sm' : 'text-gray-500'}`}
                        >
                            <span className="material-icons text-sm">directions_car</span> Carro
                        </button>
                        <button
                            onClick={() => setVehicleType('motorcycle')}
                            className={`flex-1 py-2 rounded-md text-sm font-bold flex items-center justify-center gap-2 transition ${vehicleType === 'motorcycle' ? 'bg-white text-whatsapp-green shadow-sm' : 'text-gray-500'}`}
                        >
                            <span className="material-icons text-sm">two_wheeler</span> Moto
                        </button>
                    </div>

                    {/* Inputs */}
                    <div className="space-y-3 mb-4 shrink-0">
                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-green-600 z-10">my_location</span>
                            <AddressAutocompleteInput
                                value={origin}
                                onChangeText={(text) => { setOrigin(text); setOriginCoords(null); }}
                                onSelectPlace={(place: GeocodeResult) => { setOrigin(place.address); setOriginCoords({ lat: place.lat, lng: place.lng }); }}
                                placeholder="Ponto de Partida (Ex: Centro)"
                                proximity={proximity}
                                variant="light"
                                inputClassName="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
                            />
                        </div>

                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-red-500 z-10">location_on</span>
                            <AddressAutocompleteInput
                                value={destination}
                                onChangeText={(text) => { setDestination(text); setDestCoords(null); }}
                                onSelectPlace={(place: GeocodeResult) => { setDestination(place.address); setDestCoords({ lat: place.lat, lng: place.lng }); }}
                                placeholder="Destino (Ex: Shopping)"
                                proximity={proximity}
                                variant="light"
                                inputClassName="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleCalculate}
                        disabled={loading || !origin || !destination}
                        className="w-full bg-whatsapp-green hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-md transition active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {loading ? (
                            <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                        ) : (
                            <>
                                <span className="material-icons">search</span> Calcular Valor
                            </>
                        )}
                    </button>

                    {/* Results & Map Container */}
                    <div className="mt-4 flex-1 flex flex-col min-h-[200px]">
                        {result && (
                            <div className="bg-gray-50 rounded-xl p-3 border border-gray-200 mb-2 shrink-0 animate-fade-in">
                                <div className="flex justify-between items-center">
                                    <div>
                                        <p className="text-gray-500 text-[10px] uppercase tracking-wider">Valor Estimado</p>
                                        <div className="text-2xl font-bold text-whatsapp-green">
                                            {formatCurrency(result.price)}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-bold text-gray-700">{result.distanceKm.toFixed(1)} km</p>
                                        <p className="text-xs text-gray-500">{Math.ceil(result.durationMin)} min</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Interactive Map */}
                        <div
                            ref={mapRef}
                            className="w-full flex-1 rounded-xl overflow-hidden shadow-inner border border-gray-200 bg-gray-100 min-h-[150px]"
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
