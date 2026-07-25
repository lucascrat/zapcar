// Serviço de geocodificação/rotas com Google Maps como provedor principal.
// Mantém as mesmas assinaturas de services/mapboxService.ts, que é usado
// como fallback por chamada individual caso o Google falhe.
//
// IMPORTANTE: as APIs REST "Web Service" do Google (Places/Geocoding/Directions
// via fetch direto) bloqueiam CORS e não funcionam a partir do navegador — por
// isso usamos os objetos do SDK JavaScript (google.maps.places.PlacesService,
// google.maps.Geocoder, google.maps.DirectionsService), carregados via
// services/googleMapsLoader.ts.
import { getMapProviderPromise } from './googleMapsLoader';
import {
    geocodeForward as mapboxGeocodeForward,
    geocodeReverse as mapboxGeocodeReverse,
    getDirections as mapboxGetDirections,
    getDirectionsWithSteps as mapboxGetDirectionsWithSteps,
} from './mapboxService';

export type {
    GeocodeResult,
    DirectionsResult,
    DirectionsStep,
    DirectionsWithStepsResult,
} from './mapboxService';
import type {
    GeocodeResult,
    DirectionsResult,
    DirectionsStep,
    DirectionsWithStepsResult,
} from './mapboxService';

function stripHtmlTags(html: string): string {
    return html.replace(/<[^>]+>/g, '');
}

let placesServiceInstance: google.maps.places.PlacesService | null = null;
function getPlacesService(): google.maps.places.PlacesService {
    if (!placesServiceInstance) {
        // PlacesService exige um Map ou um elemento DOM para atribuição;
        // um div fora da tela é suficiente, não precisa estar visível.
        const div = document.createElement('div');
        placesServiceInstance = new google.maps.places.PlacesService(div);
    }
    return placesServiceInstance;
}

async function isGoogleReady(): Promise<boolean> {
    const provider = await getMapProviderPromise();
    return provider === 'google' && !!(window as any).google?.maps;
}

// Busca de endereços/lugares (autocomplete). Usa Places Text Search do Google,
// que retorna endereço + coordenadas num único request (igual ao Mapbox hoje),
// com cobertura muito melhor de estabelecimentos/pontos de referência no Brasil.
export async function geocodeForward(query: string, proximity?: [number, number]): Promise<GeocodeResult[]> {
    if (!query || query.trim().length < 3) return [];
    if (!(await isGoogleReady())) return mapboxGeocodeForward(query, proximity);

    try {
        const request: google.maps.places.TextSearchRequest = {
            query,
            region: 'br',
        };
        if (proximity) {
            request.location = new google.maps.LatLng(proximity[1], proximity[0]);
            request.radius = 50000;
        }

        const results = await new Promise<google.maps.places.PlaceResult[]>((resolve, reject) => {
            getPlacesService().textSearch(request, (results, status) => {
                if (status === google.maps.places.PlacesServiceStatus.OK && results) {
                    resolve(results);
                } else if (status === google.maps.places.PlacesServiceStatus.ZERO_RESULTS) {
                    resolve([]);
                } else {
                    reject(new Error(`Places status: ${status}`));
                }
            });
        });

        return results.slice(0, 5).map((r) => ({
            address: r.formatted_address || r.name || '',
            lat: r.geometry?.location?.lat() ?? 0,
            lng: r.geometry?.location?.lng() ?? 0,
        }));
    } catch (e) {
        console.warn('[placesService] geocodeForward (Google) falhou, usando Mapbox:', e);
        return mapboxGeocodeForward(query, proximity);
    }
}

// Geocodificação reversa (coordenadas -> endereço).
export async function geocodeReverse(lng: number, lat: number): Promise<string | null> {
    if (!(await isGoogleReady())) return mapboxGeocodeReverse(lng, lat);

    try {
        const geocoder = new google.maps.Geocoder();
        const address = await new Promise<string | null>((resolve, reject) => {
            geocoder.geocode({ location: { lat, lng } }, (results, status) => {
                if (status === google.maps.GeocoderStatus.OK && results && results[0]) {
                    resolve(results[0].formatted_address);
                } else if (status === google.maps.GeocoderStatus.ZERO_RESULTS) {
                    resolve(null);
                } else {
                    reject(new Error(`Geocoder status: ${status}`));
                }
            });
        });
        return address;
    } catch (e) {
        console.warn('[placesService] geocodeReverse (Google) falhou, usando Mapbox:', e);
        return mapboxGeocodeReverse(lng, lat);
    }
}

// Busca a rota bruta na Directions API do Google (via SDK). Usada por
// getDirections e getDirectionsWithSteps.
async function fetchGoogleDirectionsRaw(
    origin: [number, number],
    destination: [number, number]
): Promise<google.maps.DirectionsRoute | null> {
    const directionsService = new google.maps.DirectionsService();

    const result = await new Promise<google.maps.DirectionsResult | null>((resolve, reject) => {
        directionsService.route(
            {
                origin: { lat: origin[1], lng: origin[0] },
                destination: { lat: destination[1], lng: destination[0] },
                travelMode: google.maps.TravelMode.DRIVING,
                region: 'br',
            },
            (result, status) => {
                if (status === google.maps.DirectionsStatus.OK && result) {
                    resolve(result);
                } else if (status === google.maps.DirectionsStatus.ZERO_RESULTS) {
                    resolve(null);
                } else {
                    reject(new Error(`Directions status: ${status}`));
                }
            }
        );
    });

    return result?.routes?.[0] || null;
}

// Rota entre dois pontos (distância, duração e geometria).
export async function getDirections(
    origin: [number, number],
    destination: [number, number]
): Promise<DirectionsResult | null> {
    if (!(await isGoogleReady())) return mapboxGetDirections(origin, destination);

    try {
        const route = await fetchGoogleDirectionsRaw(origin, destination);
        if (!route) return null;

        const leg = route.legs?.[0];
        const coordinates: [number, number][] = (route.overview_path || []).map((p) => [p.lng(), p.lat()]);

        return {
            geometry: { type: 'LineString', coordinates },
            distanceMeters: leg?.distance?.value || 0,
            durationSeconds: leg?.duration?.value || 0,
        };
    } catch (e) {
        console.warn('[placesService] getDirections (Google) falhou, usando Mapbox:', e);
        return mapboxGetDirections(origin, destination);
    }
}

// Rota com passo-a-passo (turn-by-turn), usada para navegação ativa.
export async function getDirectionsWithSteps(
    origin: [number, number],
    destination: [number, number]
): Promise<DirectionsWithStepsResult | null> {
    if (!(await isGoogleReady())) return mapboxGetDirectionsWithSteps(origin, destination);

    try {
        const route = await fetchGoogleDirectionsRaw(origin, destination);
        if (!route) return null;

        const leg = route.legs?.[0];
        const coordinates: [number, number][] = (route.overview_path || []).map((p) => [p.lng(), p.lat()]);

        const steps: DirectionsStep[] = (leg?.steps || []).map((s) => ({
            instruction: stripHtmlTags(s.instructions || ''),
            distanceMeters: s.distance?.value || 0,
            maneuverType: (s as any).maneuver || 'straight',
            endLocation: { lat: s.end_location.lat(), lng: s.end_location.lng() },
        }));

        return {
            geometry: { type: 'LineString', coordinates },
            distanceMeters: leg?.distance?.value || 0,
            durationSeconds: leg?.duration?.value || 0,
            steps,
            boundsCoordinates: coordinates,
        };
    } catch (e) {
        console.warn('[placesService] getDirectionsWithSteps (Google) falhou, usando Mapbox:', e);
        return mapboxGetDirectionsWithSteps(origin, destination);
    }
}
