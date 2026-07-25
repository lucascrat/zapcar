
import { geocodeForward, getDirections } from './placesService';

interface RouteInfo {
    distanceKm: number;
    durationMins: number;
    startAddress: string;
    endAddress: string;
}

export const GoogleMapsService = {
    // Calculate distance between two text addresses (via Google Places/Directions, com fallback Mapbox)
    calculateRoute: async (origin: string, destination: string): Promise<RouteInfo | null> => {
        try {
            const [originMatches, destMatches] = await Promise.all([
                geocodeForward(origin),
                geocodeForward(destination),
            ]);

            const originPoint = originMatches[0];
            const destPoint = destMatches[0];
            if (!originPoint || !destPoint) {
                console.error("Maps API Error: endereço não encontrado", { origin, destination });
                return null;
            }

            const route = await getDirections(
                [originPoint.lng, originPoint.lat],
                [destPoint.lng, destPoint.lat]
            );
            if (!route) {
                console.error("Maps API Error: rota não encontrada");
                return null;
            }

            return {
                distanceKm: route.distanceMeters / 1000,
                durationMins: Math.ceil(route.durationSeconds / 60),
                startAddress: originPoint.address,
                endAddress: destPoint.address,
            };
        } catch (error) {
            console.error("Maps Fetch Error:", error);
            return null;
        }
    }
};
