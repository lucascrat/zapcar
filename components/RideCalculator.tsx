import React, { useState, useEffect, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import { AppSettings, UserProfile } from '../types';
import { fetchAppSettings } from '../services/supabaseClient';
import { AdBanner } from './AdBanner';
import { AddressAutocompleteInput } from './AddressAutocompleteInput';
import { geocodeForward, geocodeReverse, getDirections, GeocodeResult } from '../services/mapboxService';

interface RideCalculatorProps {
    currentUser: UserProfile;
    onClose: () => void;
}

const ROUTE_SOURCE_ID = 'ride-calc-route';
const ROUTE_LAYER_ID = 'ride-calc-route-line';

export const RideCalculator: React.FC<RideCalculatorProps> = ({ currentUser, onClose }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [originCoords, setOriginCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [destCoords, setDestCoords] = useState<{ lat: number; lng: number } | null>(null);
    const [proximity, setProximity] = useState<[number, number] | undefined>(undefined);
    const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const [result, setResult] = useState<{
        distanceKm: number;
        durationMin: number;
        price: number;
    } | null>(null);

    const [loading, setLoading] = useState(false);

    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<mapboxgl.Map | null>(null);

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

        mapInstance.current = new mapboxgl.Map({
            container: mapRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [-38.5323, -3.8014], // Default center (Fortaleza/CE approx)
            zoom: 12,
        });
        mapInstance.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

        return () => {
            mapInstance.current?.remove();
            mapInstance.current = null;
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

                const map = mapInstance.current;
                if (map) {
                    map.setCenter([longitude, latitude]);
                    map.setZoom(15);

                    const el = document.createElement('div');
                    el.style.width = '18px';
                    el.style.height = '18px';
                    el.style.borderRadius = '50%';
                    el.style.background = '#4285F4';
                    el.style.border = '3px solid white';
                    el.style.boxShadow = '0 0 4px rgba(0,0,0,0.4)';

                    new mapboxgl.Marker({ element: el })
                        .setLngLat([longitude, latitude])
                        .setPopup(new mapboxgl.Popup({ offset: 12 }).setText('Sua Localização'))
                        .addTo(map);
                }
            }, (err) => {
                console.warn("Error getting location for calculator:", err);
            });
        }
    }, []);

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

            // Render Route on Map
            const map = mapInstance.current;
            if (map) {
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
                            paint: { 'line-color': '#00a884', 'line-width': 5 },
                        });
                    }

                    const coords = route.geometry.coordinates as [number, number][];
                    const bounds = coords.reduce(
                        (b, c) => b.extend(c),
                        new mapboxgl.LngLatBounds(coords[0], coords[0])
                    );
                    map.fitBounds(bounds, { padding: 40 });
                };

                if (map.isStyleLoaded()) applyRoute();
                else map.once('load', applyRoute);
            }

            const distanceKm = route.distanceMeters / 1000;
            const durationMin = route.durationSeconds / 60;

            // Calculate Price
            let base = settings.car_base_price;
            let perKm = settings.car_price_km;
            let perMin = settings.car_price_min;
            let startDistLimit = settings.car_start_distance_limit || 0;

            if (vehicleType === 'motorcycle') {
                base = settings.moto_base_price;
                perKm = settings.moto_price_km;
                perMin = settings.moto_price_min;
                startDistLimit = settings.moto_start_distance_limit || 0;
            }

            const chargeableDistance = Math.max(0, distanceKm - startDistLimit);
            const total = base + (chargeableDistance * perKm) + (durationMin * perMin);
            const finalPrice = Math.max(base, total);

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
                {/* AdMob Banner */}
                <AdBanner />

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
