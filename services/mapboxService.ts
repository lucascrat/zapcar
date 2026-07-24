// Leitura do token do Mapbox (Vercel/Vite)
// Se a variável existir (Produção), usa ela. Se não, usa o valor hardcoded (Desenvolvimento/Demo).
export const MAPBOX_TOKEN = (import.meta as any).env?.VITE_MAPBOX_TOKEN
    || 'pk.eyJ1IjoiaG9sYW5kYWNyYXQiLCJhIjoiY21xN2hmaWxlMDNnZDJxb2pvOHFtYzE2dCJ9.q5pgDjzi32wiGrHBZ6jCUw';

export interface GeocodeResult {
    address: string;
    lng: number;
    lat: number;
}

export interface DirectionsResult {
    geometry: GeoJSON.LineString;
    distanceMeters: number;
    durationSeconds: number;
}

export interface DirectionsStep {
    instruction: string;
    distanceMeters: number;
    maneuverType: string;
    endLocation: { lat: number; lng: number };
}

export interface DirectionsWithStepsResult extends DirectionsResult {
    steps: DirectionsStep[];
    boundsCoordinates: [number, number][];
}

// Busca de endereços (autocomplete)
export async function geocodeForward(query: string, proximity?: [number, number]): Promise<GeocodeResult[]> {
    if (!query || query.trim().length < 3) return [];

    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        country: 'br',
        language: 'pt',
        limit: '5',
    });
    if (proximity) {
        params.set('proximity', `${proximity[0]},${proximity[1]}`);
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return [];

    const data = await response.json();
    return (data.features || []).map((feature: any) => ({
        address: feature.place_name as string,
        lng: feature.center[0] as number,
        lat: feature.center[1] as number,
    }));
}

// Geocodificação reversa (coordenadas -> endereço)
export async function geocodeReverse(lng: number, lat: number): Promise<string | null> {
    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        language: 'pt',
        limit: '1',
    });

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    return data.features?.[0]?.place_name || null;
}

// Rota entre dois pontos (distância, duração e geometria)
export async function getDirections(
    origin: [number, number],
    destination: [number, number]
): Promise<DirectionsResult | null> {
    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        geometries: 'geojson',
        overview: 'full',
    });

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;

    return {
        geometry: route.geometry,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
    };
}

// Rota com passo-a-passo (turn-by-turn), usada para navegação ativa
export async function getDirectionsWithSteps(
    origin: [number, number],
    destination: [number, number]
): Promise<DirectionsWithStepsResult | null> {
    const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        geometries: 'geojson',
        overview: 'full',
        steps: 'true',
        language: 'pt',
    });

    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?${params.toString()}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const data = await response.json();
    const route = data.routes?.[0];
    if (!route) return null;

    const steps: DirectionsStep[] = (route.legs?.[0]?.steps || []).map((s: any) => ({
        instruction: s.maneuver?.instruction || '',
        distanceMeters: s.distance || 0,
        maneuverType: s.maneuver?.type || '',
        endLocation: { lat: s.maneuver?.location?.[1], lng: s.maneuver?.location?.[0] },
    }));

    return {
        geometry: route.geometry,
        distanceMeters: route.distance,
        durationSeconds: route.duration,
        steps,
        boundsCoordinates: route.geometry.coordinates,
    };
}
