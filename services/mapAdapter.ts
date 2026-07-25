// Camada de abstração entre os componentes de mapa do app e o SDK real
// (Google Maps JS API ou Mapbox GL JS). Cada componente continua com sua
// própria estrutura de useRef/useEffect, só troca chamadas diretas de
// `mapboxgl.X(...)` pelas funções deste arquivo.
import mapboxgl from 'mapbox-gl';

export type MapProvider = 'google' | 'mapbox';

export interface MapHandle {
    provider: MapProvider;
    raw: google.maps.Map | mapboxgl.Map;
    container: HTMLElement;
}

export interface MarkerHandle {
    provider: MapProvider;
    raw: mapboxgl.Marker | GoogleOverlayMarker;
}

// Aceita tanto {lat,lng} quanto [lng,lat] (convenção já usada no resto do
// app, igual ao GeoJSON/Mapbox) para reduzir conversões nos call sites.
type LatLngLike = { lat: number; lng: number } | [number, number];

function toLatLngObj(p: LatLngLike): { lat: number; lng: number } {
    return Array.isArray(p) ? { lat: p[1], lng: p[0] } : p;
}

// Estado por-mapa que o Google não gerencia por id como o Mapbox
// (addSource/addLayer/getLayer) — guardamos a rota aqui.
const googleMapState = new WeakMap<MapHandle, {
    polyline?: google.maps.Polyline;
}>();

function getGoogleState(handle: MapHandle) {
    let state = googleMapState.get(handle);
    if (!state) {
        state = {};
        googleMapState.set(handle, state);
    }
    return state;
}

// ============================================================================
// Marcador customizado para o Google usando OverlayView (não exige Map ID,
// ao contrário de AdvancedMarkerElement). Suporta elemento HTML arbitrário
// (os mesmos ícones SVG já usados hoje) + rotação via CSS transform.
// ============================================================================
class GoogleOverlayMarker {
    element: HTMLElement;
    position: google.maps.LatLng;
    rotation: number;
    infoWindow: google.maps.InfoWindow | null = null;
    onClick?: () => void;
    private overlay: google.maps.OverlayView;

    constructor(map: google.maps.Map, opts: {
        lat: number; lng: number; element: HTMLElement; rotation?: number;
        popupHtml?: string; popupOpen?: boolean; onClick?: () => void;
    }) {
        this.element = opts.element;
        this.position = new google.maps.LatLng(opts.lat, opts.lng);
        this.rotation = opts.rotation || 0;
        this.onClick = opts.onClick;

        this.element.style.position = 'absolute';
        this.element.style.cursor = 'pointer';
        this.applyTransform();

        if (opts.popupHtml) {
            this.infoWindow = new google.maps.InfoWindow({ content: opts.popupHtml });
        }

        const self = this;
        const OverlayCtor = class extends google.maps.OverlayView {
            onAdd() {
                this.getPanes()!.overlayMouseTarget.appendChild(self.element);
                self.element.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (self.infoWindow) {
                        self.infoWindow.setPosition(self.position);
                        self.infoWindow.open(this.getMap() as google.maps.Map);
                    }
                    self.onClick?.();
                });
            }
            draw() {
                const projection = this.getProjection();
                if (!projection) return;
                const point = projection.fromLatLngToDivPixel(self.position);
                if (!point) return;
                self.element.style.left = `${point.x}px`;
                self.element.style.top = `${point.y}px`;
            }
            onRemove() {
                self.element.parentNode?.removeChild(self.element);
            }
        };

        this.overlay = new OverlayCtor();
        this.overlay.setMap(map);

        if (opts.popupOpen && this.infoWindow) {
            this.infoWindow.setPosition(this.position);
            this.infoWindow.open(map);
        }
    }

    private applyTransform() {
        this.element.style.transform = `translate(-50%, -50%) rotate(${this.rotation}deg)`;
        this.element.style.transformOrigin = 'center center';
    }

    setPosition(lat: number, lng: number) {
        this.position = new google.maps.LatLng(lat, lng);
        (this.overlay as any).draw?.();
    }

    setRotation(deg: number) {
        this.rotation = deg;
        this.applyTransform();
    }

    getPosition() {
        return { lat: this.position.lat(), lng: this.position.lng() };
    }

    remove() {
        this.overlay.setMap(null);
    }
}

// ============================================================================
// Mapa
// ============================================================================
const DARK_STYLE: google.maps.MapTypeStyle[] = [
    { elementType: 'geometry', stylers: [{ color: '#212121' }] },
    { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
    { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
    { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#757575' }] },
    { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
    { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181818' }] },
    { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c2c' }] },
    { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
    { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c3c' }] },
    { featureType: 'transit', elementType: 'geometry', stylers: [{ color: '#2f2f2f' }] },
    { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#000000' }] },
    { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

export function createMap(provider: MapProvider, container: HTMLElement, opts: {
    center: { lat: number; lng: number };
    zoom: number;
    pitch?: number;
    bearing?: number;
    style?: 'streets' | 'dark';
}): MapHandle {
    if (provider === 'google') {
        const map = new google.maps.Map(container, {
            center: opts.center,
            zoom: opts.zoom,
            tilt: opts.pitch || 0,
            heading: opts.bearing || 0,
            disableDefaultUI: true,
            zoomControl: false,
            gestureHandling: 'greedy',
            styles: opts.style === 'dark' ? DARK_STYLE : undefined,
        });

        // Se o container é criado fora da área visível (ex: abaixo da dobra
        // numa página com scroll, dentro de um card ainda não rolado até a
        // vista), o Google Maps não carrega os tiles corretamente e nunca se
        // recupera sozinho — precisa de um evento 'resize' explícito depois
        // que o container fica visível. O Mapbox não tem esse problema.
        if (typeof IntersectionObserver !== 'undefined') {
            const observer = new IntersectionObserver((entries) => {
                if (entries.some(e => e.isIntersecting)) {
                    google.maps.event.trigger(map, 'resize');
                    map.setCenter(opts.center);
                    observer.disconnect();
                }
            });
            observer.observe(container);
        }

        return { provider, raw: map, container };
    }

    const map = new mapboxgl.Map({
        container,
        style: opts.style === 'dark' ? 'mapbox://styles/mapbox/dark-v11' : 'mapbox://styles/mapbox/streets-v12',
        center: [opts.center.lng, opts.center.lat],
        zoom: opts.zoom,
        pitch: opts.pitch || 0,
        bearing: opts.bearing || 0,
    });
    return { provider, raw: map, container };
}

export function destroyMap(handle: MapHandle): void {
    try {
        if (handle.provider === 'mapbox') {
            (handle.raw as mapboxgl.Map).remove();
        }
        // google.maps.Map não tem um destroy explícito; o garbage collector
        // recolhe quando o container é removido do DOM pelo React.
    } catch (e) {
        console.warn('[mapAdapter] destroyMap falhou', e);
    }
}

export function resizeMap(handle: MapHandle): void {
    try {
        if (handle.provider === 'mapbox') {
            (handle.raw as mapboxgl.Map).resize();
        } else {
            google.maps.event.trigger(handle.raw as google.maps.Map, 'resize');
        }
    } catch (e) {
        console.warn('[mapAdapter] resizeMap falhou', e);
    }
}

export function addNavigationControl(handle: MapHandle): void {
    if (handle.provider === 'mapbox') {
        (handle.raw as mapboxgl.Map).addControl(new mapboxgl.NavigationControl(), 'top-right');
    } else {
        (handle.raw as google.maps.Map).setOptions({ zoomControl: true, zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_TOP } });
    }
}

export function onMapReady(handle: MapHandle, cb: () => void): void {
    if (handle.provider === 'mapbox') {
        const map = handle.raw as mapboxgl.Map;
        try {
            if (map.isStyleLoaded()) cb(); else map.once('load', cb);
        } catch {
            map.once('load', cb);
        }
    } else {
        cb();
    }
}

export function onMapClick(handle: MapHandle, cb: (pos: { lat: number; lng: number }) => void): () => void {
    if (handle.provider === 'mapbox') {
        const map = handle.raw as mapboxgl.Map;
        const listener = (e: mapboxgl.MapMouseEvent) => cb({ lat: e.lngLat.lat, lng: e.lngLat.lng });
        map.on('click', listener);
        return () => map.off('click', listener);
    }
    const map = handle.raw as google.maps.Map;
    const listener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) cb({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    });
    return () => listener.remove();
}

export function onDragStart(handle: MapHandle, cb: () => void): () => void {
    if (handle.provider === 'mapbox') {
        const map = handle.raw as mapboxgl.Map;
        map.on('dragstart', cb);
        return () => map.off('dragstart', cb);
    }
    const map = handle.raw as google.maps.Map;
    const listener = map.addListener('dragstart', cb);
    return () => listener.remove();
}

// ============================================================================
// Marcadores
// ============================================================================
export function addMarker(handle: MapHandle, opts: {
    lat: number; lng: number; element?: HTMLElement; color?: string; rotation?: number;
    popupHtml?: string; popupOpen?: boolean; onClick?: () => void;
}): MarkerHandle {
    if (handle.provider === 'google') {
        const element = opts.element || buildDotElement(opts.color || '#00a884');
        const overlayMarker = new GoogleOverlayMarker(handle.raw as google.maps.Map, {
            lat: opts.lat, lng: opts.lng, element, rotation: opts.rotation,
            popupHtml: opts.popupHtml, popupOpen: opts.popupOpen, onClick: opts.onClick,
        });
        return { provider: 'google', raw: overlayMarker };
    }

    const marker = new mapboxgl.Marker({
        element: opts.element,
        color: opts.element ? undefined : (opts.color || '#00a884'),
        rotationAlignment: 'map',
    }).setLngLat([opts.lng, opts.lat]);

    if (typeof opts.rotation === 'number') marker.setRotation(opts.rotation);
    if (opts.popupHtml) marker.setPopup(new mapboxgl.Popup({ offset: 20 }).setHTML(opts.popupHtml));
    marker.addTo(handle.raw as mapboxgl.Map);
    if (opts.popupOpen) marker.togglePopup();
    if (opts.onClick) marker.getElement().addEventListener('click', opts.onClick);

    return { provider: 'mapbox', raw: marker };
}

function buildDotElement(color: string): HTMLElement {
    const el = document.createElement('div');
    el.style.width = '18px';
    el.style.height = '18px';
    el.style.borderRadius = '50%';
    el.style.background = color;
    el.style.border = '3px solid white';
    el.style.boxShadow = '0 0 4px rgba(0,0,0,0.4)';
    return el;
}

export function updateMarker(markerHandle: MarkerHandle, opts: { lat?: number; lng?: number; rotation?: number }): void {
    if (markerHandle.provider === 'google') {
        const m = markerHandle.raw as GoogleOverlayMarker;
        if (opts.lat !== undefined && opts.lng !== undefined) m.setPosition(opts.lat, opts.lng);
        if (opts.rotation !== undefined) m.setRotation(opts.rotation);
        return;
    }
    const m = markerHandle.raw as mapboxgl.Marker;
    if (opts.lat !== undefined && opts.lng !== undefined) m.setLngLat([opts.lng, opts.lat]);
    if (opts.rotation !== undefined) m.setRotation(opts.rotation);
}

export function getMarkerPosition(markerHandle: MarkerHandle): { lat: number; lng: number } {
    if (markerHandle.provider === 'google') {
        return (markerHandle.raw as GoogleOverlayMarker).getPosition();
    }
    const ll = (markerHandle.raw as mapboxgl.Marker).getLngLat();
    return { lat: ll.lat, lng: ll.lng };
}

export function getMarkerElement(markerHandle: MarkerHandle): HTMLElement | null {
    if (markerHandle.provider === 'google') {
        return (markerHandle.raw as GoogleOverlayMarker).element;
    }
    return (markerHandle.raw as mapboxgl.Marker).getElement();
}

export function removeMarker(markerHandle: MarkerHandle | null | undefined): void {
    if (!markerHandle) return;
    try {
        markerHandle.raw.remove();
    } catch (e) {
        console.warn('[mapAdapter] removeMarker falhou', e);
    }
}

// ============================================================================
// Rota (linha)
// ============================================================================
const ROUTE_SOURCE_ID = 'chegoja-route';
const ROUTE_LAYER_ID = 'chegoja-route-line';

export function drawRoute(handle: MapHandle, coordinates: [number, number][], style: { color: string; width: number; opacity?: number }): void {
    if (handle.provider === 'google') {
        try {
            const state = getGoogleState(handle);
            const path = coordinates.map(([lng, lat]) => ({ lat, lng }));
            if (state.polyline) {
                state.polyline.setPath(path);
            } else {
                state.polyline = new google.maps.Polyline({
                    path,
                    map: handle.raw as google.maps.Map,
                    strokeColor: style.color,
                    strokeWeight: style.width,
                    strokeOpacity: style.opacity ?? 0.9,
                });
            }
        } catch (e) {
            console.warn('[mapAdapter] drawRoute (Google) falhou', e);
        }
        return;
    }

    const map = handle.raw as mapboxgl.Map;
    try {
        if (!map.isStyleLoaded()) {
            map.once('load', () => drawRoute(handle, coordinates, style));
            return;
        }
        const geojson: GeoJSON.Feature = { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } };
        if (map.getSource(ROUTE_SOURCE_ID)) {
            (map.getSource(ROUTE_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
        } else {
            map.addSource(ROUTE_SOURCE_ID, { type: 'geojson', data: geojson });
            map.addLayer({
                id: ROUTE_LAYER_ID,
                type: 'line',
                source: ROUTE_SOURCE_ID,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: { 'line-color': style.color, 'line-width': style.width, 'line-opacity': style.opacity ?? 0.9 },
            });
        }
    } catch (e) {
        console.warn('[mapAdapter] drawRoute (Mapbox) falhou', e);
    }
}

export function clearRoute(handle: MapHandle): void {
    if (handle.provider === 'google') {
        try {
            const state = getGoogleState(handle);
            state.polyline?.setMap(null);
            state.polyline = undefined;
        } catch (e) {
            console.warn('[mapAdapter] clearRoute (Google) falhou', e);
        }
        return;
    }

    const map = handle.raw as mapboxgl.Map;
    try {
        if (!map.isStyleLoaded()) return;
        if (map.getLayer(ROUTE_LAYER_ID)) map.removeLayer(ROUTE_LAYER_ID);
        if (map.getSource(ROUTE_SOURCE_ID)) map.removeSource(ROUTE_SOURCE_ID);
    } catch (e) {
        console.warn('[mapAdapter] clearRoute (Mapbox) falhou', e);
    }
}

// ============================================================================
// Heatmap
// ============================================================================
const HEATMAP_SOURCE_ID = 'chegoja-heatmap';
const HEATMAP_LAYER_ID = 'chegoja-heatmap-layer';

export function addHeatmap(handle: MapHandle, points: { lat: number; lng: number }[], opts?: { radius?: number; opacity?: number }): void {
    if (handle.provider === 'google') {
        // O Google descontinuou o HeatmapLayer (deprecated maio/2025, removido
        // maio/2026) e não oferece substituto nativo — recomendam bibliotecas
        // de terceiros (ex: deck.gl). Como é uma camada decorativa (indica
        // áreas de maior demanda), optamos por não renderizar no provedor
        // Google em vez de adicionar uma dependência nova só para isso.
        // No Mapbox (fallback) o heatmap continua funcionando normalmente.
        return;
    }

    const map = handle.raw as mapboxgl.Map;
    try {
        if (!map.isStyleLoaded()) {
            map.once('load', () => addHeatmap(handle, points, opts));
            return;
        }
        const geojson: GeoJSON.FeatureCollection = {
            type: 'FeatureCollection',
            features: points.map(p => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p.lng, p.lat] } })),
        };
        if (map.getSource(HEATMAP_SOURCE_ID)) {
            (map.getSource(HEATMAP_SOURCE_ID) as mapboxgl.GeoJSONSource).setData(geojson);
        } else {
            map.addSource(HEATMAP_SOURCE_ID, { type: 'geojson', data: geojson });
            map.addLayer({
                id: HEATMAP_LAYER_ID,
                type: 'heatmap',
                source: HEATMAP_SOURCE_ID,
                paint: {
                    'heatmap-radius': opts?.radius ?? 25,
                    'heatmap-opacity': opts?.opacity ?? 0.45,
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
        console.warn('[mapAdapter] addHeatmap (Mapbox) falhou', e);
    }
}

export function removeHeatmap(handle: MapHandle | null | undefined): void {
    if (!handle) return;
    if (handle.provider === 'google') {
        // Ver comentário em addHeatmap — nada a remover no Google.
        return;
    }

    const map = handle.raw as mapboxgl.Map;
    try {
        if (!map.isStyleLoaded()) return;
        if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
        if (map.getSource(HEATMAP_SOURCE_ID)) map.removeSource(HEATMAP_SOURCE_ID);
    } catch (e) {
        console.warn('[mapAdapter] removeHeatmap (Mapbox) falhou', e);
    }
}

// ============================================================================
// Câmera
// ============================================================================
export function fitBounds(handle: MapHandle, coordinates: LatLngLike[], paddingPx: number): void {
    if (!coordinates.length) return;
    const points = coordinates.map(toLatLngObj);

    if (handle.provider === 'google') {
        try {
            const bounds = new google.maps.LatLngBounds();
            points.forEach(p => bounds.extend(p));
            (handle.raw as google.maps.Map).fitBounds(bounds, paddingPx);
        } catch (e) {
            console.warn('[mapAdapter] fitBounds (Google) falhou', e);
        }
        return;
    }

    try {
        const bounds = points.reduce(
            (b, p) => b.extend([p.lng, p.lat]),
            new mapboxgl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat])
        );
        (handle.raw as mapboxgl.Map).fitBounds(bounds, { padding: paddingPx });
    } catch (e) {
        console.warn('[mapAdapter] fitBounds (Mapbox) falhou', e);
    }
}

export function panTo(handle: MapHandle, pos: { lat: number; lng: number }): void {
    if (handle.provider === 'google') {
        (handle.raw as google.maps.Map).panTo(pos);
    } else {
        (handle.raw as mapboxgl.Map).setCenter([pos.lng, pos.lat]);
    }
}

export function setZoom(handle: MapHandle, zoom: number): void {
    if (handle.provider === 'google') {
        (handle.raw as google.maps.Map).setZoom(zoom);
    } else {
        (handle.raw as mapboxgl.Map).setZoom(zoom);
    }
}

// Transição de câmera. No Google não existe equivalente ao `duration` do
// Mapbox (easeTo anima suavemente); a câmera do Google "pula" direto para a
// posição final. Trade-off aceito — ver plano de implementação.
export function easeTo(handle: MapHandle, opts: { lat: number; lng: number; zoom?: number; pitch?: number; bearing?: number; durationMs?: number }): void {
    if (handle.provider === 'google') {
        const map = handle.raw as google.maps.Map;
        map.panTo({ lat: opts.lat, lng: opts.lng });
        if (opts.zoom !== undefined) map.setZoom(opts.zoom);
        if (opts.pitch !== undefined) map.setTilt(opts.pitch);
        if (opts.bearing !== undefined) map.setHeading(opts.bearing);
        return;
    }

    (handle.raw as mapboxgl.Map).easeTo({
        center: [opts.lng, opts.lat],
        zoom: opts.zoom,
        pitch: opts.pitch,
        bearing: opts.bearing,
        duration: opts.durationMs ?? 500,
    });
}
