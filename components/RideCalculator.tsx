import React, { useState, useEffect, useRef } from 'react';
import { AppSettings, UserProfile } from '../types';
import { fetchAppSettings } from '../services/supabaseClient';

interface RideCalculatorProps {
    currentUser: UserProfile;
    onClose: () => void;
}

export const RideCalculator: React.FC<RideCalculatorProps> = ({ currentUser, onClose }) => {
    const [origin, setOrigin] = useState('');
    const [destination, setDestination] = useState('');
    const [vehicleType, setVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [settings, setSettings] = useState<AppSettings | null>(null);

    const [result, setResult] = useState<{
        distanceKm: number;
        durationMin: number;
        price: number;
    } | null>(null);

    const [loading, setLoading] = useState(false);

    // Refs for Autocomplete
    const originInputRef = useRef<HTMLInputElement>(null);
    const destInputRef = useRef<HTMLInputElement>(null);
    const mapRef = useRef<HTMLDivElement>(null);

    // Google Maps Objects
    const mapInstance = useRef<any>(null);
    const directionsRenderer = useRef<any>(null);

    // Load Settings
    useEffect(() => {
        fetchAppSettings().then(setSettings);
        if (currentUser.role === 'driver' && currentUser.vehicle_type) {
            setVehicleType(currentUser.vehicle_type);
        }
    }, [currentUser]);

    // Initialize Autocomplete & Map
    useEffect(() => {
        if (!window.google || !window.google.maps) return;

        // Init Map if not already
        if (mapRef.current && !mapInstance.current) {
            mapInstance.current = new window.google.maps.Map(mapRef.current, {
                center: { lat: -3.8014, lng: -38.5323 }, // Default center (Fortaleza/CE approx)
                zoom: 12,
                disableDefaultUI: true,
                zoomControl: true,
            });
            directionsRenderer.current = new window.google.maps.DirectionsRenderer();
            directionsRenderer.current.setMap(mapInstance.current);
        }

        // Init Autocomplete for Origin
        if (originInputRef.current) {
            const originAutocomplete = new window.google.maps.places.Autocomplete(originInputRef.current, {
                fields: ["formatted_address", "geometry", "name"],
                strictBounds: false,
            });
            originAutocomplete.addListener("place_changed", () => {
                const place = originAutocomplete.getPlace();
                if (place.formatted_address) {
                    setOrigin(place.formatted_address);
                } else if (place.name) {
                    setOrigin(place.name);
                }
            });
        }

        // Init Autocomplete for Destination
        if (destInputRef.current) {
            const destAutocomplete = new window.google.maps.places.Autocomplete(destInputRef.current, {
                fields: ["formatted_address", "geometry", "name"],
                strictBounds: false,
            });
            destAutocomplete.addListener("place_changed", () => {
                const place = destAutocomplete.getPlace();
                if (place.formatted_address) {
                    setDestination(place.formatted_address);
                } else if (place.name) {
                    setDestination(place.name);
                }
            });
        }

    }, []);

    // Auto-fill Origin with Current Location
    useEffect(() => {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude } = position.coords;

                const runGeocode = () => {
                    if (window.google && window.google.maps) {
                        const geocoder = new window.google.maps.Geocoder();
                        geocoder.geocode({ location: { lat: latitude, lng: longitude } }, (results: any, status: any) => {
                            if (status === 'OK' && results && results[0]) {
                                setOrigin(results[0].formatted_address);
                                // Also center map
                                if (mapInstance.current) {
                                    mapInstance.current.setCenter({ lat: latitude, lng: longitude });
                                    mapInstance.current.setZoom(15);

                                    // Add a marker for current location
                                    new window.google.maps.Marker({
                                        position: { lat: latitude, lng: longitude },
                                        map: mapInstance.current,
                                        title: "Sua Localização",
                                        icon: {
                                            path: window.google.maps.SymbolPath.CIRCLE,
                                            scale: 7,
                                            fillColor: "#4285F4",
                                            fillOpacity: 1,
                                            strokeWeight: 2,
                                            strokeColor: "white",
                                        }
                                    });
                                }
                            }
                        });
                    } else {
                        setTimeout(runGeocode, 500);
                    }
                };
                runGeocode();
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
            if (!window.google || !window.google.maps) {
                alert("Google Maps ainda não foi carregado. Tente novamente em instantes.");
                setLoading(false);
                return;
            }

            const directionsService = new window.google.maps.DirectionsService();

            directionsService.route(
                {
                    origin: origin,
                    destination: destination,
                    travelMode: window.google.maps.TravelMode.DRIVING,
                    unitSystem: window.google.maps.UnitSystem.METRIC
                },
                (result: any, status: any) => {
                    if (status === window.google.maps.DirectionsStatus.OK && result) {
                        // Render Route on Map
                        if (directionsRenderer.current) {
                            directionsRenderer.current.setDirections(result);
                        }

                        const leg = result.routes[0].legs[0];
                        const distanceMeters = leg.distance.value;
                        const durationSeconds = leg.duration.value;

                        const distanceKm = distanceMeters / 1000;
                        const durationMin = durationSeconds / 60;

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

                    } else {
                        console.error("Directions request failed due to " + status);
                        alert("Não foi possível traçar a rota. Verifique os endereços.");
                    }
                    setLoading(false);
                }
            );

        } catch (error) {
            console.error("Erro ao calcular:", error);
            alert("Erro inesperado ao calcular rota.");
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
                            <span className="material-icons absolute left-3 top-3 text-green-600">my_location</span>
                            <input
                                ref={originInputRef}
                                type="text"
                                placeholder="Ponto de Partida (Ex: Centro)"
                                value={origin}
                                onChange={e => setOrigin(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
                            />
                        </div>

                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-red-500">location_on</span>
                            <input
                                ref={destInputRef}
                                type="text"
                                placeholder="Destino (Ex: Shopping)"
                                value={destination}
                                onChange={e => setDestination(e.target.value)}
                                className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-whatsapp-green focus:ring-1 focus:ring-whatsapp-green transition"
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
