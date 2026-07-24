
import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, AppSettings } from '../types';
import { fetchAppSettings } from '../services/supabaseClient';


interface TaximeterProps {
  currentUser: UserProfile;
  onClose: () => void;
}

export const Taximeter: React.FC<TaximeterProps> = ({ currentUser, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  const [elapsedTime, setElapsedTime] = useState(0); // Seconds
  const [distance, setDistance] = useState(0); // Kilometers
  const [fare, setFare] = useState(0.00);

  const [lastPos, setLastPos] = useState<{ lat: number, lng: number } | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const timerRef = useRef<any>(null);

  // Load Rates
  useEffect(() => {
    fetchAppSettings().then(setSettings);
  }, []);

  // Timer Logic
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // GPS Logic
  useEffect(() => {
    if (isRunning && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed } = position.coords;

          if (lastPos) {
            // Calculate distance using Haversine formula
            const dist = calculateDistance(lastPos.lat, lastPos.lng, latitude, longitude);

            // Only add distance if speed is sufficient (avoid GPS drift when stopped)
            // or distance is significant (> 10m)
            if ((speed && speed > 1) || dist > 0.010) {
              setDistance(prev => prev + dist);
            }
          }
          setLastPos({ lat: latitude, lng: longitude });
        },
        (err) => console.warn("GPS Error", err),
        { enableHighAccuracy: true, maximumAge: 0 }
      );
    } else {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      setLastPos(null);
    }

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [isRunning, lastPos]);

  // Fare Calculation
  useEffect(() => {
    if (!settings) return;

    // Calculate Price based on vehicle type and time
    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    const parseTime = (timeStr?: string) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };

    const nightStart = parseTime(settings.night_start_time || '19:00');
    const nightEnd = parseTime(settings.night_end_time || '23:59');
    const dawnStart = parseTime(settings.dawn_start_time || '00:00');
    const dawnEnd = parseTime(settings.dawn_end_time || '05:00');

    let base = settings.car_base_price;
    let perKm = settings.car_price_km;
    let perMin = settings.car_price_min;
    let startDistLimit = settings.car_start_distance_limit || 0;

    if (currentUser.vehicle_type === 'motorcycle') {
      base = settings.moto_base_price;
      perKm = settings.moto_price_km;
      perMin = settings.moto_price_min;
      startDistLimit = settings.moto_start_distance_limit || 0;
    }

    // Apply Dynamic Pricing
    const isNight = (nightStart < nightEnd)
      ? (currentTime >= nightStart && currentTime <= nightEnd)
      : (currentTime >= nightStart || currentTime <= nightEnd);

    const isDawn = (dawnStart < dawnEnd)
      ? (currentTime >= dawnStart && currentTime <= dawnEnd)
      : (currentTime >= dawnStart || currentTime <= dawnEnd);

    if (isDawn) {
      if (currentUser.vehicle_type === 'car' || !currentUser.vehicle_type) {
        base = settings.dawn_car_base_price ?? base;
        perKm = settings.dawn_car_price_km ?? perKm;
        perMin = settings.dawn_car_price_min ?? perMin;
      } else {
        base = settings.dawn_moto_base_price ?? base;
        perKm = settings.dawn_moto_price_km ?? perKm;
        perMin = settings.dawn_moto_price_min ?? perMin;
      }
    } else if (isNight) {
      if (currentUser.vehicle_type === 'car' || !currentUser.vehicle_type) {
        base = settings.night_car_base_price ?? base;
        perKm = settings.night_car_price_km ?? perKm;
        perMin = settings.night_car_price_min ?? perMin;
      } else {
        base = settings.night_moto_base_price ?? base;
        perKm = settings.night_moto_price_km ?? perKm;
        perMin = settings.night_moto_price_min ?? perMin;
      }
    }

    // Formula: Base + ((Distance - StartLimit) * Rate) + (Min * Rate)
    const timeInMin = elapsedTime / 60;

    // Calcula a distância cobrável (apenas o que excede o limite inicial)
    const chargeableDistance = Math.max(0, distance - startDistLimit);

    const total = base + (chargeableDistance * perKm) + (timeInMin * perMin);

    // Ensure total never drops below base
    setFare(Math.max(base, total));
  }, [elapsedTime, distance, settings, currentUser.vehicle_type]);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const formatTime = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h > 0 ? h + ':' : ''}${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleStop = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setElapsedTime(0);
    setDistance(0);
    setFare(settings ? (currentUser.vehicle_type === 'motorcycle' ? settings.moto_base_price : settings.car_base_price) : 0);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4 text-white">
      <div className="w-full max-w-sm bg-gray-900 rounded-2xl border-4 border-gray-700 overflow-hidden shadow-2xl">
        {/* AdMob Banner Removed */}
        {/* Header */}
        <div className="bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
          <div className="flex items-center gap-2">
            <span className="material-icons text-yellow-500">local_taxi</span>
            <span className="font-bold tracking-wider">TAXÍMETRO</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><span className="material-icons">close</span></button>
        </div>

        {/* Display */}
        <div className="p-8 text-center bg-black font-mono">
          <p className="text-gray-500 text-sm mb-1 uppercase tracking-widest">Valor a Pagar</p>
          <div className="text-6xl font-bold text-green-500 mb-6 drop-shadow-[0_0_10px_rgba(34,197,94,0.5)]">
            R$ {fare.toFixed(2)}
          </div>

          <div className="grid grid-cols-2 gap-4 border-t border-gray-800 pt-6">
            <div>
              <p className="text-gray-500 text-xs uppercase">Distância</p>
              <p className="text-2xl text-blue-400">{distance.toFixed(2)} <span className="text-sm">km</span></p>
            </div>
            <div>
              <p className="text-gray-500 text-xs uppercase">Tempo</p>
              <p className="text-2xl text-yellow-400">{formatTime(elapsedTime)}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="p-4 grid grid-cols-2 gap-3 bg-gray-800">
          {!isRunning ? (
            <button
              onClick={() => setIsRunning(true)}
              className="col-span-2 bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg shadow-lg uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <span className="material-icons">play_arrow</span> Iniciar Corrida
            </button>
          ) : (
            <button
              onClick={handleStop}
              className="col-span-2 bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-lg shadow-lg uppercase tracking-wider flex items-center justify-center gap-2 animate-pulse"
            >
              <span className="material-icons">stop</span> Parar
            </button>
          )}

          <button
            onClick={handleReset}
            disabled={isRunning}
            className="col-span-2 bg-gray-700 hover:bg-gray-600 text-gray-300 font-bold py-2 rounded-lg text-sm uppercase disabled:opacity-50"
          >
            Nova Corrida (Reset)
          </button>
        </div>

        {/* Rates Info */}
        <div className="bg-gray-900 p-2 text-center text-[10px] text-gray-500">
          Tarifa: {currentUser.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'} • Base R$ {
            settings ? (currentUser.vehicle_type === 'motorcycle' ? settings.moto_base_price : settings.car_base_price) : '...'
          }
          {(settings?.car_start_distance_limit && settings.car_start_distance_limit > 0 && currentUser.vehicle_type !== 'motorcycle') &&
            ` • Franquia: ${settings.car_start_distance_limit}km`
          }
          {(settings?.moto_start_distance_limit && settings.moto_start_distance_limit > 0 && currentUser.vehicle_type === 'motorcycle') &&
            ` • Franquia: ${settings.moto_start_distance_limit}km`
          }
        </div>
      </div>
    </div>
  );
};