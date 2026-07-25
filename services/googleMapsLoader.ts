// Carrega o script do Google Maps JavaScript API uma única vez e decide,
// no boot do app, se o provedor de mapas/geocodificação será 'google' ou
// 'mapbox' (fallback automático caso o Google falhe/demore para carregar).
import { GOOGLE_MAPS_API_KEY } from '../constants';

export type MapProvider = 'google' | 'mapbox';

declare global {
    interface Window {
        __chegojaGmapsCallback__?: () => void;
    }
}

let providerPromise: Promise<MapProvider> | null = null;

export function initMapProvider(apiKey: string, timeoutMs = 8000): Promise<MapProvider> {
    if (providerPromise) return providerPromise;

    providerPromise = new Promise<MapProvider>((resolve) => {
        if (!apiKey) {
            resolve('mapbox');
            return;
        }

        if (typeof window !== 'undefined' && (window as any).google?.maps?.places) {
            resolve('google');
            return;
        }

        const timeout = setTimeout(() => {
            console.warn('[googleMapsLoader] Timeout ao carregar Google Maps, usando Mapbox como fallback.');
            resolve('mapbox');
        }, timeoutMs);

        window.__chegojaGmapsCallback__ = () => {
            clearTimeout(timeout);
            resolve('google');
        };

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=pt-BR&region=BR&loading=async&callback=__chegojaGmapsCallback__`;
        script.onerror = () => {
            clearTimeout(timeout);
            console.warn('[googleMapsLoader] Erro ao carregar script do Google Maps, usando Mapbox como fallback.');
            resolve('mapbox');
        };
        document.head.appendChild(script);
    });

    return providerPromise;
}

// Acesso defensivo para código que roda antes do boot chamar initMapProvider
// diretamente (não deveria acontecer normalmente, mas evita crash).
export function getMapProviderPromise(): Promise<MapProvider> {
    if (!providerPromise) {
        console.warn('[googleMapsLoader] getMapProviderPromise chamado antes de initMapProvider.');
        return initMapProvider(GOOGLE_MAPS_API_KEY);
    }
    return providerPromise;
}
