
import React, { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { fetchRideHeatmapData } from '../services/supabaseClient';
import { getDirectionsWithSteps, DirectionsStep } from '../services/mapboxService';
import { UserProfile, AppSettings, DriverStatus } from '../types';

interface AppMapProps {
    drivers?: UserProfile[];
    userLocation?: { lat: number, lng: number };
    onMarkerClick?: (driver: UserProfile) => void;
    settings?: AppSettings | null;
    routeOrigin?: { lat: number, lng: number };
    routeDestination?: { lat: number, lng: number };
    showRoute?: boolean;
    navigationMode?: boolean;
    onRouteInfo?: (info: { distance: string; duration: string }) => void;
    onRouteStep?: (info: { instruction: string; distance: string; maneuver?: string }) => void;
    speak?: boolean;
    followCamera?: boolean;
    onSpeed?: (kmh: number) => void;
    userVehicleType?: 'car' | 'motorcycle';
}

const CAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#25D366" stroke="#111b21" stroke-width="0.5" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/></svg>';
const MOTO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" height="40" viewBox="0 0 24 24" width="40"><path d="M0 0h24v24H0z" fill="none"/><path fill="#FFA500" stroke="#111b21" stroke-width="0.5" d="M19 7c0-1.1-.9-2-2-2h-3l-1.4-1.4C12.2 3.2 11.7 3 11.2 3H8C6.9 3 6 3.9 6 5v2H4c-1.1 0-2 .9-2 2v4h2c0 1.66 1.34 3 3 3s3-1.34 3-3h4c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-4l-3-3zM7 14c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>';
const USER_ARROW_SVG = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path d="M12,2L4.5,20.29L5.21,21L12,18L18.79,21L19.5,20.29L12,2Z" fill="${color}" stroke="#ffffff" stroke-width="1"/></svg>`;
const START_PIN_SVG = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="20" cy="20" r="16" fill="#111B21" stroke="#25D366" stroke-width="4"/><circle cx="20" cy="20" r="5" fill="white"/></svg>';
const END_PIN_SVG = '<svg width="32" height="32" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="32" height="32" rx="8" fill="#111B21" stroke="#FF4444" stroke-width="4"/><path d="M14 10V30M14 12C14 12 17 10 20 10C23 10 26 14 29 14V22C29 22 26 18 23 18C20 18 17 22 14 22" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEXT_STEP_SVG = '<svg width="34" height="34" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22C55E"/><stop offset="1" stop-color="#16A34A"/></linearGradient></defs><path d="M24 4c-7 0-12 5.5-12 12 0 9 12 20 12 20s12-11 12-20c0-6.5-5-12-12-12z" fill="url(#g)" stroke="#ffffff" stroke-width="2"/><circle cx="24" cy="16" r="5" fill="#fff"/></svg>';

const ROUTE_SOURCE_ID = 'appmap-route';
const ROUTE_LAYER_ID = 'appmap-route-line';
const HEATMAP_SOURCE_ID = 'appmap-heatmap';
const HEATMAP_LAYER_ID = 'appmap-heatmap-layer';

function svgDataUrl(svg: string) {
    return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

export const AppMap: React.FC<AppMapProps> = ({
    drivers = [],
    userLocation,
    onMarkerClick,
    settings,
    routeOrigin,
    routeDestination,
    showRoute = false,
    navigationMode = false,
    onRouteInfo,
    onRouteStep,
    speak = true,
    followCamera = true,
    onSpeed,
    userVehicleType
}) => {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<mapboxgl.Map | null>(null);
    const mapLoaded = useRef(false);
    const markers = useRef<Map<string, mapboxgl.Marker>>(new Map());
    const driverPositions = useRef<Map<string, { lat: number; lng: number }>>(new Map());
    const driverHeadings = useRef<Map<string, number>>(new Map());
    const animationFrames = useRef<Map<string, number>>(new Map());
    const [heading, setHeading] = useState(0);

    const userMarker = useRef<mapboxgl.Marker | null>(null);
    const gpsWatchId = useRef<number | null>(null);
    const lastGpsPos = useRef<{ lat: number; lng: number } | null>(null);
    const startMarker = useRef<mapboxgl.Marker | null>(null);
    const endMarker = useRef<mapboxgl.Marker | null>(null);
    const nextStepMarker = useRef<mapboxgl.Marker | null>(null);
    const lastRouteKey = useRef<string>('');
    const lastPosKey = useRef<string>('');
    const [isFollowing, setIsFollowing] = useState(true);
    const routeSteps = useRef<DirectionsStep[]>([]);
    const [stepIndex, setStepIndex] = useState(0);
    const lastSpokenIndex = useRef<number>(-1);
    const lastOrigin = useRef<{ lat: number; lng: number } | null>(null);
    const lastDestination = useRef<{ lat: number; lng: number } | null>(null);

    const computeBearingUtil = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const toRad = (deg: number) => deg * Math.PI / 180;
        const dLon = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const y = Math.sin(dLon) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
        return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    };

    const distMeters = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
        const toRad = (d: number) => d * Math.PI / 180;
        const R = 6371000;
        const dLat = toRad(b.lat - a.lat);
        const dLon = toRad(b.lng - a.lng);
        const lat1 = toRad(a.lat);
        const lat2 = toRad(b.lat);
        const sinDLat = Math.sin(dLat / 2);
        const sinDLon = Math.sin(dLon / 2);
        const aHarv = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
        const c = 2 * Math.atan2(Math.sqrt(aHarv), Math.sqrt(1 - aHarv));
        return R * c;
    };

    const buildIconMarker = (svg: string, size = 40) => {
        const el = document.createElement('div');
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.innerHTML = svg;
        return el;
    };

    // Init map (once)
    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        const center = userLocation || { lat: -3.7319, lng: -38.5267 };
        const map = new mapboxgl.Map({
            container: mapRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [center.lng, center.lat],
            zoom: 15,
            pitch: navigationMode ? 65 : 0,
            bearing: heading,
        });
        mapInstance.current = map;

        map.on('load', () => { mapLoaded.current = true; });

        const stopFollowing = () => setIsFollowing(false);
        map.on('dragstart', stopFollowing);

        return () => {
            map.remove();
            mapInstance.current = null;
            mapLoaded.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Driver markers with animated position + rotation
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        const currentIds = new Set(drivers.map(d => d.id));

        markers.current.forEach((marker, id) => {
            if (!currentIds.has(id)) {
                marker.remove();
                markers.current.delete(id);
                driverPositions.current.delete(id);
                driverHeadings.current.delete(id);
                const frame = animationFrames.current.get(id);
                if (frame) cancelAnimationFrame(frame);
                animationFrames.current.delete(id);
            }
        });

        drivers.forEach(driver => {
            if (driver.lat && driver.lng) {
                const newPos = { lat: driver.lat, lng: driver.lng };
                const prevPos = driverPositions.current.get(driver.id);
                let marker = markers.current.get(driver.id);

                if (prevPos) {
                    const dist = Math.abs(newPos.lat - prevPos.lat) + Math.abs(newPos.lng - prevPos.lng);
                    if (dist > 0.00005) {
                        driverHeadings.current.set(driver.id, computeBearingUtil(prevPos, newPos));
                    }
                }
                driverPositions.current.set(driver.id, newPos);
                const bearing = driverHeadings.current.get(driver.id) || 0;

                const iconUrl = driver.vehicle_type === 'motorcycle'
                    ? (settings?.moto_icon_url || null)
                    : (settings?.car_icon_url || null);
                const fallbackSvg = driver.vehicle_type === 'motorcycle' ? MOTO_SVG : CAR_SVG;

                if (marker) {
                    marker.setRotation(bearing);
                    marker.getElement().style.opacity = driver.status === DriverStatus.BUSY ? '0.6' : '1';
                    animateMarkerTo(marker, newPos, driver.id);
                } else {
                    const el = iconUrl
                        ? (() => { const img = document.createElement('img'); img.src = iconUrl; img.style.width = '40px'; img.style.height = '40px'; return img; })()
                        : buildIconMarker(fallbackSvg);
                    el.style.cursor = 'pointer';
                    el.style.opacity = driver.status === DriverStatus.BUSY ? '0.6' : '1';

                    marker = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
                        .setLngLat([newPos.lng, newPos.lat])
                        .setRotation(bearing)
                        .addTo(map);
                    el.addEventListener('click', () => onMarkerClick && onMarkerClick(driver));
                    markers.current.set(driver.id, marker);
                }
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [drivers, settings]);

    const animateMarkerTo = (marker: mapboxgl.Marker, targetPos: { lat: number; lng: number }, driverId: string) => {
        const prevFrame = animationFrames.current.get(driverId);
        if (prevFrame) cancelAnimationFrame(prevFrame);

        const start = marker.getLngLat();
        const startLat = start.lat;
        const startLng = start.lng;
        const duration = 600;
        const startTime = performance.now();

        const step = (now: number) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = 1 - Math.pow(1 - t, 3);
            const lat = startLat + (targetPos.lat - startLat) * ease;
            const lng = startLng + (targetPos.lng - startLng) * ease;
            marker.setLngLat([lng, lat]);
            if (t < 1) {
                animationFrames.current.set(driverId, requestAnimationFrame(step));
            } else {
                animationFrames.current.delete(driverId);
            }
        };
        animationFrames.current.set(driverId, requestAnimationFrame(step));
    };

    // Heatmap
    useEffect(() => {
        const map = mapInstance.current;
        const showHeatmap = navigationMode || !!userVehicleType;

        const removeHeatmap = () => {
            if (!map) return;
            try {
                // map.getStyle()/getLayer()/getSource() lançam exceção (em vez de retornar
                // falsy) se o mapa foi destruído ou o estilo ainda está carregando, por isso
                // tudo fica dentro do try.
                if (!map.isStyleLoaded()) return;
                if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
                if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
            } catch (e) {
                // Mapa pode já ter sido destruído (.remove()) durante o desmonte do componente
                console.warn('removeHeatmap: mapa indisponível', e);
            }
        };

        if (!showHeatmap || !map) {
            if (map) removeHeatmap();
            return;
        }

        const loadHeatmap = async () => {
            const points = await fetchRideHeatmapData();
            if (!points || points.length === 0 || !map) return;

            const geojson: GeoJSON.FeatureCollection = {
                type: 'FeatureCollection',
                features: points.map(p => ({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
                })),
            };

            const apply = () => {
                try {
                    // Mapa pode ter sido destruído enquanto aguardávamos os dados
                    if (!map.isStyleLoaded()) return;
                    if (map.getSource(HEATMAP_SOURCE_ID)) {
                        (map.getSource(HEATMAP_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
                    } else {
                        map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });
                        map.addLayer({
                            id: HEATMAP_LAYER_ID,
                            type: 'heatmap',
                            source: HEATMAP_SOURCE_ID,
                            paint: {
                                'heatmap-radius': navigationMode ? 30 : 25,
                                'heatmap-opacity': navigationMode ? 0.7 : 0.45,
                                'heatmap-color': [
                                    'interpolate', ['linear'], ['heatmap-density'],
                                    0, 'rgba(0,255,255,0)',
                                    0.5, 'rgba(255,255,0,1)',
                                    1, 'rgba(255,0,0,1)',
                                ],
                            },
                        });
                    }
                } catch (e) {
                    console.warn('loadHeatmap: mapa indisponível', e);
                }
            };

            try {
                if (map.isStyleLoaded()) apply(); else map.once('load', apply);
            } catch (e) {
                console.warn('loadHeatmap: mapa indisponível', e);
            }
        };

        loadHeatmap();
        return () => removeHeatmap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigationMode, userVehicleType]);

    // Route + turn-by-turn
    useEffect(() => {
        const map = mapInstance.current;
        if (!map) return;

        if (showRoute && routeOrigin && routeDestination) {
            const shouldRecalc =
                !lastOrigin.current ||
                distMeters(routeOrigin, lastOrigin.current) > 80 ||
                !lastDestination.current ||
                distMeters(routeDestination, lastDestination.current) > 20;

            if (!startMarker.current) {
                startMarker.current = new mapboxgl.Marker({ element: buildIconMarker(START_PIN_SVG, 32) })
                    .setLngLat([routeOrigin.lng, routeOrigin.lat]).addTo(map);
            } else {
                startMarker.current.setLngLat([routeOrigin.lng, routeOrigin.lat]);
            }

            if (!endMarker.current) {
                endMarker.current = new mapboxgl.Marker({ element: buildIconMarker(END_PIN_SVG, 32) })
                    .setLngLat([routeDestination.lng, routeDestination.lat]).addTo(map);
            } else {
                endMarker.current.setLngLat([routeDestination.lng, routeDestination.lat]);
            }

            if (!shouldRecalc) return;
            lastOrigin.current = { ...routeOrigin };
            lastDestination.current = { ...routeDestination };

            const distApprox = Math.abs(routeOrigin.lat - routeDestination.lat) + Math.abs(routeOrigin.lng - routeDestination.lng);
            if (distApprox < 0.0001) {
                onRouteInfo && onRouteInfo({ distance: 'No local', duration: '0 min' });
                return;
            }

            (async () => {
                const route = await getDirectionsWithSteps(
                    [routeOrigin.lng, routeOrigin.lat],
                    [routeDestination.lng, routeDestination.lat]
                );
                if (!route) return;

                const applyRoute = () => {
                    const geojson: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: route.geometry };
                    if (map.getSource(ROUTE_SOURCE_ID)) {
                        (map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
                    } else {
                        map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
                        map.addLayer({
                            id: ROUTE_LAYER_ID,
                            type: 'line',
                            source: ROUTE_SOURCE_ID,
                            layout: { 'line-join': 'round', 'line-cap': 'round' },
                            paint: { 'line-color': '#25D366', 'line-width': 6, 'line-opacity': 0.9 },
                        });
                    }

                    if (!navigationMode) {
                        const bounds = route.boundsCoordinates.reduce(
                            (b, c) => b.extend(c as [number, number]),
                            new mapboxgl.LngLatBounds(route.boundsCoordinates[0], route.boundsCoordinates[0])
                        );
                        map.fitBounds(bounds, { padding: 60 });
                    }
                };
                if (map.isStyleLoaded()) applyRoute(); else map.once('load', applyRoute);

                const durationMin = Math.round(route.durationSeconds / 60);
                const distanceKm = (route.distanceMeters / 1000).toFixed(1);
                onRouteInfo && onRouteInfo({ distance: `${distanceKm} km`, duration: `${durationMin} min` });

                if (route.steps.length) {
                    routeSteps.current = route.steps;
                    setStepIndex(0);
                    const s = route.steps[0];
                    onRouteStep && onRouteStep({ instruction: s.instruction, distance: formatMeters(s.distanceMeters), maneuver: s.maneuverType });
                    if (speak && lastSpokenIndex.current !== 0 && typeof window !== 'undefined' && (window as any).speechSynthesis) {
                        (window as any).speechSynthesis.speak(new SpeechSynthesisUtterance(s.instruction));
                        lastSpokenIndex.current = 0;
                    }
                    placeNextStepMarker(s.endLocation);
                }
            })();
        } else {
            if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
            if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
            startMarker.current?.remove(); startMarker.current = null;
            endMarker.current?.remove(); endMarker.current = null;
            nextStepMarker.current?.remove(); nextStepMarker.current = null;
            lastRouteKey.current = '';
            routeSteps.current = [];
            setStepIndex(0);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showRoute, routeOrigin, routeDestination]);

    const placeNextStepMarker = (pos: { lat: number; lng: number }) => {
        const map = mapInstance.current;
        if (!map || !pos.lat || !pos.lng) return;
        if (!nextStepMarker.current) {
            const el = buildIconMarker(NEXT_STEP_SVG, 34);
            el.style.animation = 'pulse 1.2s ease-in-out infinite';
            nextStepMarker.current = new mapboxgl.Marker({ element: el }).setLngLat([pos.lng, pos.lat]).addTo(map);
        } else {
            nextStepMarker.current.setLngLat([pos.lng, pos.lat]);
        }
    };

    const formatMeters = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;

    // User location marker + camera follow
    useEffect(() => {
        const map = mapInstance.current;
        if (!map || !userLocation) return;

        const currentPosKey = `${userLocation.lat.toFixed(5)},${userLocation.lng.toFixed(5)},${navigationMode},${heading},${isFollowing}`;
        if (currentPosKey === lastPosKey.current) return;
        lastPosKey.current = currentPosKey;

        if (userMarker.current) {
            userMarker.current.setLngLat([userLocation.lng, userLocation.lat]);
            userMarker.current.setRotation(heading);
        } else {
            const svg = userVehicleType
                ? (userVehicleType === 'motorcycle' ? MOTO_SVG : CAR_SVG)
                : USER_ARROW_SVG('#2563eb');
            const el = buildIconMarker(svg, userVehicleType ? 40 : 28);
            userMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
                .setLngLat([userLocation.lng, userLocation.lat])
                .setRotation(heading)
                .addTo(map);
        }

        if (isFollowing && navigationMode) {
            map.easeTo({ center: [userLocation.lng, userLocation.lat], pitch: 65, zoom: 19, bearing: heading, duration: 500 });
        } else if (isFollowing && !navigationMode) {
            map.easeTo({ center: [userLocation.lng, userLocation.lat], duration: 500 });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userLocation, navigationMode, heading, isFollowing]);

    // GPS watcher for live heading/panning during navigation
    useEffect(() => {
        const map = mapInstance.current;
        if (!navigationMode || !('geolocation' in navigator) || !map) {
            if (gpsWatchId.current !== null) {
                navigator.geolocation.clearWatch(gpsWatchId.current);
                gpsWatchId.current = null;
            }
            return;
        }

        gpsWatchId.current = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, heading: nativeHeading } = position.coords as any;
                const current = { lat: latitude, lng: longitude };

                if (typeof nativeHeading === 'number' && !isNaN(nativeHeading)) {
                    setHeading(Math.round(nativeHeading));
                } else if (lastGpsPos.current) {
                    setHeading(Math.round(computeBearingUtil(lastGpsPos.current, current)));
                }
                lastGpsPos.current = current;

                if (userMarker.current) {
                    userMarker.current.setLngLat([current.lng, current.lat]);
                    userMarker.current.setRotation(heading);
                }

                if (isFollowing) {
                    map.easeTo({ center: [current.lng, current.lat], bearing: heading, pitch: 50, zoom: 18, duration: 400 });
                }

                if (routeSteps.current.length > 0) {
                    const s = routeSteps.current[stepIndex];
                    if (s?.endLocation?.lat) {
                        const d = distMeters(current, s.endLocation);
                        if (d < 35 && stepIndex < routeSteps.current.length - 1) {
                            const nextIndex = stepIndex + 1;
                            setStepIndex(nextIndex);
                            const ns = routeSteps.current[nextIndex];
                            onRouteStep && onRouteStep({ instruction: ns.instruction, distance: formatMeters(ns.distanceMeters), maneuver: ns.maneuverType });
                            if (speak && lastSpokenIndex.current !== nextIndex && (window as any).speechSynthesis) {
                                (window as any).speechSynthesis.speak(new SpeechSynthesisUtterance(ns.instruction));
                                lastSpokenIndex.current = nextIndex;
                            }
                            try { if ((navigator as any).vibrate) (navigator as any).vibrate(20); } catch { }
                            placeNextStepMarker(ns.endLocation);
                        } else if (d < 20 && stepIndex === routeSteps.current.length - 1) {
                            onRouteStep && onRouteStep({ instruction: 'Você chegou', distance: '0 m', maneuver: 'arrive' });
                        }

                        const speedMs = position.coords && typeof position.coords.speed === 'number' ? position.coords.speed : null;
                        if (onSpeed && speedMs !== null) {
                            onSpeed(Math.max(0, Math.round(speedMs * 3.6)));
                        }
                    }
                }
            },
            (err) => console.warn('[GPS] Navigation watcher error', err),
            { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
        );
        return () => {
            if (gpsWatchId.current !== null) {
                navigator.geolocation.clearWatch(gpsWatchId.current);
                gpsWatchId.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [navigationMode, isFollowing, heading]);

    useEffect(() => {
        setIsFollowing(!!followCamera);
    }, [followCamera]);

    // Resize handling
    useEffect(() => {
        if (!mapRef.current || !mapInstance.current) return;
        const observer = new ResizeObserver(() => mapInstance.current?.resize());
        observer.observe(mapRef.current);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="w-full h-full relative">
            <div ref={mapRef} className="w-full h-full" />

            <div className={`absolute top-4 left-4 bg-black/60 backdrop-blur-md text-white text-[10px] px-4 py-2 rounded-full uppercase font-black tracking-widest border border-white/10 transition-all z-10 ${navigationMode ? 'bg-blue-600' : ''}`}>
                {navigationMode ? (isFollowing ? 'Navegação Ativa' : 'Pausado') : 'GPS Ativo'}
            </div>

            {!isFollowing && (
                <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-[30] animate-fade-in-up">
                    <button
                        onClick={() => setIsFollowing(true)}
                        className="bg-white text-blue-600 px-6 py-2 rounded-full shadow-xl font-bold text-xs uppercase tracking-widest border border-gray-100 flex items-center gap-2 active:scale-95 transition hover:bg-gray-50"
                    >
                        <span className="material-icons text-sm">my_location</span>
                        {navigationMode ? 'Retomar' : 'Re-centralizar'}
                    </button>
                </div>
            )}

            {navigationMode && routeDestination && (
                <div className="absolute top-[280px] left-4 z-20">
                    <button
                        onClick={() => {
                            const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation?.lat},${userLocation?.lng}&destination=${routeDestination.lat},${routeDestination.lng}&travelmode=driving`;
                            window.open(url, '_blank');
                        }}
                        className="pointer-events-auto bg-blue-600/90 backdrop-blur-md text-white p-3 rounded-2xl shadow-xl flex items-center gap-2 transition active:scale-95 border border-white/10"
                    >
                        <span className="material-icons text-xl">navigation</span>
                        <div className="flex flex-col items-start pr-1">
                            <span className="text-[10px] uppercase font-black leading-none mb-0.5 tracking-tighter">MAPS</span>
                            <span className="text-[12px] font-bold leading-none uppercase">Externo</span>
                        </div>
                    </button>
                </div>
            )}
        </div>
    );
};
