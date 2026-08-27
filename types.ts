
// 🛑 PARE! 🛑
// ESTE É UM ARQUIVO TYPESCRIPT (.ts) PARA A APLICAÇÃO REACT.
// ⚠️ NÃO COPIE ESTE CÓDIGO PARA O SUPABASE SQL EDITOR. ⚠️
//
// O CÓDIGO CORRETO PARA O SUPABASE ESTÁ NO ARQUIVO 'supabase_setup.sql' (supa.ts).

export enum UserRole {
  CLIENT = 'client',
  DRIVER = 'driver',
  ADMIN = 'admin'
}

export enum DriverStatus {
  AVAILABLE = 'available',
  BUSY = 'busy',
  OFFLINE = 'offline'
}

export interface UserProfile {
  id: string;
  username: string;
  phone?: string; // Novo campo
  password?: string; // Campo para senha (opcional no objeto, mas existe no banco)
  role: UserRole;
  status: DriverStatus;
  is_approved?: boolean; // Novo campo para aprovação
  subscription_expires_at?: string; // Data de validade da assinatura
  avatar_url?: string;
  created_at?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_color?: string;
  vehicle_type?: string; // Slug da categoria de veículo (chegoja.vehicle_categories.slug) - era 'car'|'motorcycle' fixo, agora dinâmico (ver VehicleCategory)
  lat?: number;
  lng?: number;
  location_updated_at?: string; // Última vez que o GPS foi atualizado (motorista "online de verdade")
  unread_count?: number; // Contador de mensagens não lidas (Frontend Only)
  is_pip_active?: boolean; // Indica se o app nativo está em modo PiP
  wallet_coins?: number; // Moedas do cliente (Bingo/Videos)
  financial_balance?: number; // Saldo do motorista (Ganhos/Cupons)
  pix_key?: string; // Chave PIX do motorista
  whatsapp?: string; // WhatsApp oficial do perfil
  cpf?: string; // CPF do usuário
  address_street?: string; // Rua do endereço
  address_number?: string; // Número do endereço
  address_neighborhood?: string; // Bairro
  address_city?: string; // Cidade
  address_zip?: string; // CEP
  email?: string; // E-mail do usuário
  doc_cnh_url?: string; // Foto da CNH (documentos para análise)
  doc_address_proof_url?: string; // Foto do comprovante de endereço (documentos para análise)
  work_city?: string; // Cidade em que o motorista quer trabalhar
}

export interface Message {
  id: string;
  sender_id: string;
  receiver_id: string;
  content: string;
  media_url?: string;
  media_type: 'text' | 'audio' | 'image' | 'location';
  created_at: string;
  is_read: boolean;
}

export interface ChatContact {
  user: UserProfile;
  lastMessage?: Message;
  unreadCount: number;
}

export interface CallRecord {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: 'completed' | 'missed' | 'rejected';
  timestamp: string;
  duration: number;
  clientName: string;
}

export interface AppSettings {
  id?: string;
  car_base_price: number;
  car_price_km: number;
  car_price_min: number;
  car_start_distance_limit: number;
  moto_base_price: number;
  moto_price_km: number;
  moto_price_min: number;
  moto_start_distance_limit: number;
  car_price_per_minute?: number; // Tarifa por minuto
  moto_price_per_minute?: number; // Tarifa por minuto

  // Dynamic Pricing (Night: 20:00 - 23:59)
  night_car_base_price?: number;
  night_car_price_km?: number;
  night_car_price_min?: number;
  night_moto_base_price?: number;
  night_moto_price_km?: number;
  night_moto_price_min?: number;

  // Dynamic Pricing (Dawn: 00:00 - 05:00)
  dawn_car_base_price?: number;
  dawn_car_price_km?: number;
  dawn_car_price_min?: number;
  dawn_moto_base_price?: number;
  dawn_moto_price_km?: number;
  dawn_moto_price_min?: number;

  // Dynamic Pricing Adjusted Hours
  night_start_time?: string; // HH:mm
  night_end_time?: string;   // HH:mm
  dawn_start_time?: string;  // HH:mm
  dawn_end_time?: string;    // HH:mm

  marquee_text?: string;
  car_icon_url?: string;
  moto_icon_url?: string;
  car_name?: string;
  car_description?: string;
  moto_name?: string;
  moto_description?: string;
  coin_value_brl?: number;

  // Efí Bank Settings
  efi_client_id?: string;
  efi_client_secret?: string;
  efi_pix_key?: string;
  efi_account_code?: string;

  // WhatsApp Settings
  official_whatsapp?: string;
}

// Interfaces do Bingo
export interface BingoSettings {
  id?: string;
  prize_image: string;
  prize_description: string;
  youtube_link: string;
  drawn_numbers: number[]; // Array de números sorteados
  is_active: boolean;
}

export interface BingoCard {
  id: string;
  user_id: string;
  numbers: number[]; // Array de 24 ou 25 números da cartela
  created_at: string;
}

export interface BingoRankingUser {
  username: string;
  user_id: string;
  avatar_url?: string;
  hits: number; // Quantos números acertou
  missing: number; // Quantos faltam
}

// Nova interface para notificações em massa
export interface BroadcastMessage {
  id: string;
  title: string;
  message: string;
  target_role: 'client' | 'driver' | 'all' | 'clients' | 'drivers';
  created_at: string;
}

export interface DriverPlan {
  id: string;
  title: string;
  description: string;
  price: number;
  days: number;
}

// Interfaces para Pagamento Pix Transparente
export interface PayerFormData {
  firstName: string;
  lastName: string;
  email: string;
  cpf: string;
  phone?: string;
  birthDate?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
}

// Interface para pagamento com cartão
export interface CardFormData {
  cardNumber: string;
  cardholderName: string;
  expirationMonth: string;
  expirationYear: string;
  securityCode: string;
  installments: number;
}

export interface Banner {
  id: string;
  image_url: string;
  link_url?: string;
  active: boolean;
  order: number;
  created_at: string;
}

export interface Coupon {
  id: string;
  image_url: string;
  discount_value: number;
  vehicle_type: string | 'all'; // slug de chegoja.vehicle_categories, ou 'all'
  total_quantity: number;
  used_quantity: number;
  is_active: boolean;
  created_at: string;
}

export interface PixPaymentResponse {
  id: string | number;
  status: string;
  point_of_interaction: {
    transaction_data: {
      qr_code: string; // Copia e Cola
      qr_code_base64: string; // Imagem
    }
  }
}

export interface Ride {
  id: string;
  client_id: string;
  driver_id?: string;
  status: 'searching' | 'accepted' | 'en_route' | 'arrived' | 'started' | 'waiting_payment' | 'finished' | 'cancelled';
  payment_status?: 'pending' | 'completed';
  vehicle_type: string; // slug de chegoja.vehicle_categories
  origin_lat: number;
  origin_lng: number;
  origin_address?: string;
  destination_lat?: number;
  destination_lng?: number;
  destination_address?: string;
  estimated_price?: number;
  final_price?: number;
  estimated_time?: number;
  distance_km?: number;
  created_at: string;
  updated_at: string;

  // Dispatch Control
  ignored_drivers?: string[]; // IDs do Supabase
  is_broadcast?: boolean;
  is_direct?: boolean; // Novo campo
  is_delivery?: boolean; // Entrega de pacote (99 Entrega style) em vez de corrida de passageiro
  last_driver_offered_at?: string;

  // Sistema de Notificação Sequencial (ver services/sequentialNotifications.ts)
  current_notified_driver_id?: string; // Motorista da vez a receber a chamada
  notification_sent_at?: string;
  notification_timeout_seconds?: number;
  notification_attempts?: Array<{
    driver_id: string;
    notified_at: string;
    response: 'accepted' | 'rejected' | 'timeout' | 'no_token' | 'too_far';
    responded_at: string;
    distance_km?: number;
  }>;

  // Detalhes extras carregados via join
  driver?: UserProfile;
  client?: UserProfile;
  coupon_id?: string;
  discount_amount?: number;
  payment_method?: 'pix' | 'card' | 'cash' | 'coins';
  coins_used?: number;
}

// Tipo para as abas do Painel Admin
export type AdminTab = 'overview' | 'clients' | 'details' | 'map' | 'history' | 'settings' | 'chat' | 'bingo' | 'approvals' | 'notifications' | 'plans' | 'banners' | 'coupons' | 'central' | 'wallets' | 'store' | 'drivers' | 'rides' | 'taximeter' | 'bot' | 'rewards' | 'support' | 'performance' | 'categories';

// Categoria de veículo cadastrável pelo admin (chegoja.vehicle_categories) -
// substitui o antigo par fixo car/motorcycle. Cada faixa de horário (padrão/
// noite/madrugada) tem tarifa mínima e preço/minuto SEPARADOS de propósito -
// ver services/pricing.ts pro motivo (bug histórico onde esses dois
// significados ficavam misturados no mesmo campo).
export interface VehicleCategory {
  id: string;
  slug: string;
  name: string;
  description?: string;
  icon_url?: string;
  is_active: boolean;
  sort_order: number;

  base_price: number;
  price_km: number;
  price_min_fare: number;
  price_per_minute: number;
  start_distance_limit: number;

  night_base_price?: number | null;
  night_price_km?: number | null;
  night_price_min_fare?: number | null;
  night_price_per_minute?: number | null;

  dawn_base_price?: number | null;
  dawn_price_km?: number | null;
  dawn_price_min_fare?: number | null;
  dawn_price_per_minute?: number | null;

  created_at?: string;
  updated_at?: string;
}

// ── Sistema de Premiação Semanal ──────────────────────────────────────────────
export interface RewardTier {
  id: string;
  title: string;
  description: string;
  min_rides: number;
  prize_value: number;
  image_url?: string;
  badge_emoji: string;
  card_color: string;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

export interface RewardsConfig {
  id: number;
  is_enabled: boolean;
  week_title: string;
  subtitle: string;
  updated_at: string;
}

export interface DriverRankingEntry {
  driver_id: string;
  username: string;
  avatar_url?: string;
  vehicle_type?: string;
  weekly_rides: number;
}

export interface StoreProduct {
  id: string;
  name: string;
  description: string;
  price_brl: number;
  price_coins: number;
  image_url?: string;
  stock: number;
  active: boolean;
  created_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'earning' | 'purchase' | 'discount' | 'payout' | 'bonus';
  amount_coins: number;
  amount_money: number;
  description: string;
  created_at: string;
}

export interface AppPaymentRequest {
  id: string;
  user_id: string;
  amount_money: number;
  amount_coins: number;
  pix_key: string;
  status: 'pending' | 'paid' | 'rejected';
  type: 'driver_payout' | 'client_withdrawal';
  admin_note?: string;
  created_at: string;
  updated_at: string;
  user?: UserProfile; // Joined
}

export interface StoreOrder {
  id: string;
  user_id: string;
  product_id: string;
  status: 'pending' | 'delivered';
  payment_method: 'coins' | 'pix';
  amount_coins: number;
  amount_money: number;
  created_at: string;
  delivered_at?: string;
  // Joins
  product?: StoreProduct;
  user?: UserProfile;
}

// Interface global para comunicação com Android Nativo, Google Maps e Capacitor
declare global {
  interface Window {
    Android?: {
      triggerNativeAlert: () => void;
      triggerNativeMessageSound: () => void;
      stopNativeAlert: () => void;
      showToast: (msg: string) => void;
      bringToFront: () => void;
      enterPipMode: () => void;
      requestPermissions: () => void;
    };
    pushalert?: any;
    google?: typeof google; // Google Maps API
    Capacitor?: {
      isNativePlatform: () => boolean;
      getPlatform: () => string;
      isPluginAvailable: (name: string) => boolean;
      convertFileSrc: (filePath: string) => string;
      Plugins?: Record<string, any>;
    };
  }
}

// Google Maps types declaration
declare namespace google {
  namespace maps {
    class Map {
      constructor(mapDiv: Element, opts?: MapOptions);
      setCenter(latlng: LatLng | LatLngLiteral): void;
      getCenter(): LatLng | undefined;
      setZoom(zoom: number): void;
      getZoom(): number | undefined;
      panTo(latLng: LatLng | LatLngLiteral): void;
      fitBounds(bounds: LatLngBounds | LatLngBoundsLiteral): void;
      addListener(eventName: string, handler: (...args: any[]) => void): MapsEventListener;
    }
    class Marker {
      constructor(opts?: MarkerOptions);
      setPosition(latlng: LatLng | LatLngLiteral): void;
      getPosition(): LatLng | undefined;
      setMap(map: Map | null): void;
      addListener(eventName: string, handler: (...args: any[]) => void): MapsEventListener;
    }
    class LatLng {
      constructor(lat: number, lng: number);
      lat(): number;
      lng(): number;
      toJSON(): LatLngLiteral;
    }
    class LatLngBounds {
      constructor(sw?: LatLng | LatLngLiteral, ne?: LatLng | LatLngLiteral);
      extend(point: LatLng | LatLngLiteral): LatLngBounds;
    }
    class Geocoder {
      geocode(request: GeocoderRequest, callback: (results: GeocoderResult[] | null, status: GeocoderStatus) => void): void;
    }
    class DirectionsService {
      route(request: DirectionsRequest, callback: (result: DirectionsResult | null, status: DirectionsStatus) => void): void;
    }
    class DirectionsRenderer {
      constructor(opts?: DirectionsRendererOptions);
      setMap(map: Map | null): void;
      setDirections(directions: DirectionsResult): void;
    }
    class InfoWindow {
      constructor(opts?: InfoWindowOptions);
      open(map?: Map | null, anchor?: Marker): void;
      close(): void;
      setContent(content: string | Node): void;
    }
    class Circle {
      constructor(opts?: CircleOptions);
      setMap(map: Map | null): void;
      setCenter(center: LatLng | LatLngLiteral): void;
      setRadius(radius: number): void;
    }
    class DistanceMatrixService {
      getDistanceMatrix(request: DistanceMatrixRequest, callback: (response: DistanceMatrixResponse | null, status: DistanceMatrixStatus) => void): void;
    }
    namespace places {
      class Autocomplete {
        constructor(inputField: HTMLInputElement, opts?: AutocompleteOptions);
        addListener(eventName: string, handler: () => void): MapsEventListener;
        getPlace(): PlaceResult;
        setBounds(bounds: LatLngBounds | LatLngBoundsLiteral): void;
        bindTo(key: string, target: any): void;
      }
      class AutocompleteService {
        getPlacePredictions(request: AutocompletionRequest, callback: (predictions: AutocompletePrediction[] | null, status: PlacesServiceStatus) => void): void;
      }
      interface PlaceResult {
        formatted_address?: string;
        geometry?: { location?: LatLng; viewport?: LatLngBounds };
        name?: string;
        place_id?: string;
        address_components?: Array<{ long_name: string; short_name: string; types: string[] }>;
      }
      interface AutocompleteOptions {
        bounds?: LatLngBounds | LatLngBoundsLiteral;
        componentRestrictions?: { country: string | string[] };
        fields?: string[];
        strictBounds?: boolean;
        types?: string[];
      }
      interface AutocompletionRequest {
        input: string;
        bounds?: LatLngBounds | LatLngBoundsLiteral;
        componentRestrictions?: { country: string | string[] };
        types?: string[];
      }
      interface AutocompletePrediction {
        description: string;
        place_id: string;
        structured_formatting: { main_text: string; secondary_text: string };
      }
      type PlacesServiceStatus = 'OK' | 'ZERO_RESULTS' | 'INVALID_REQUEST' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'UNKNOWN_ERROR';
    }
    namespace visualization {
      class HeatmapLayer {
        constructor(opts?: HeatmapLayerOptions);
        setMap(map: Map | null): void;
        setData(data: any[]): void;
      }
      interface HeatmapLayerOptions {
        data?: any[];
        map?: Map;
        radius?: number;
        opacity?: number;
        gradient?: string[];
        maxIntensity?: number;
        dissipating?: boolean;
      }
    }
    interface MapOptions {
      center?: LatLng | LatLngLiteral;
      zoom?: number;
      mapTypeId?: string;
      disableDefaultUI?: boolean;
      zoomControl?: boolean;
      streetViewControl?: boolean;
      fullscreenControl?: boolean;
      mapTypeControl?: boolean;
      gestureHandling?: string;
      styles?: any[];
      [key: string]: any;
    }
    interface MarkerOptions {
      position?: LatLng | LatLngLiteral;
      map?: Map;
      title?: string;
      icon?: string | Icon | Symbol;
      draggable?: boolean;
      animation?: number;
      zIndex?: number;
      [key: string]: any;
    }
    interface Icon {
      url: string;
      scaledSize?: Size;
      size?: Size;
      origin?: Point;
      anchor?: Point;
      path?: string | number;
      scale?: number;
      strokeColor?: string;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      [key: string]: any;
    }
    interface Symbol {
      path: string | number;
      scale?: number;
      strokeColor?: string;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
    }
    interface InfoWindowOptions {
      content?: string | Node;
      position?: LatLng | LatLngLiteral;
      maxWidth?: number;
    }
    interface CircleOptions {
      center?: LatLng | LatLngLiteral;
      radius?: number;
      map?: Map;
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
      fillColor?: string;
      fillOpacity?: number;
      zIndex?: number;
      clickable?: boolean;
      [key: string]: any;
    }
    class Size {
      constructor(width: number, height: number);
    }
    class Point {
      constructor(x: number, y: number);
    }
    interface LatLngLiteral {
      lat: number;
      lng: number;
    }
    interface LatLngBoundsLiteral {
      east: number;
      north: number;
      south: number;
      west: number;
    }
    interface MapsEventListener {
      remove(): void;
    }
    interface GeocoderRequest {
      address?: string;
      location?: LatLng | LatLngLiteral;
      placeId?: string;
    }
    interface GeocoderResult {
      formatted_address: string;
      geometry: { location: LatLng };
      address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
    }
    type GeocoderStatus = 'OK' | 'ZERO_RESULTS' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'INVALID_REQUEST' | 'UNKNOWN_ERROR';
    interface DirectionsRequest {
      origin: LatLng | LatLngLiteral | string;
      destination: LatLng | LatLngLiteral | string;
      travelMode: TravelMode;
      unitSystem?: UnitSystem;
      [key: string]: any;
    }
    interface DirectionsResult {
      routes: DirectionsRoute[];
    }
    interface DirectionsRoute {
      legs: DirectionsLeg[];
      overview_polyline: { points: string };
    }
    interface DirectionsLeg {
      distance?: { text: string; value: number };
      duration?: { text: string; value: number };
      start_address: string;
      end_address: string;
    }
    interface DirectionsRendererOptions {
      map?: Map;
      suppressMarkers?: boolean;
      polylineOptions?: PolylineOptions;
      [key: string]: any;
    }
    interface PolylineOptions {
      strokeColor?: string;
      strokeOpacity?: number;
      strokeWeight?: number;
    }
    interface DistanceMatrixRequest {
      origins: (LatLng | LatLngLiteral | string)[];
      destinations: (LatLng | LatLngLiteral | string)[];
      travelMode: TravelMode;
      unitSystem?: UnitSystem;
    }
    interface DistanceMatrixResponse {
      rows: { elements: DistanceMatrixResponseElement[] }[];
    }
    interface DistanceMatrixResponseElement {
      distance?: { text: string; value: number };
      duration?: { text: string; value: number };
      status: string;
    }
    type DistanceMatrixStatus = 'OK' | 'INVALID_REQUEST' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'UNKNOWN_ERROR';
    type DirectionsStatus = 'OK' | 'NOT_FOUND' | 'ZERO_RESULTS' | 'MAX_WAYPOINTS_EXCEEDED' | 'INVALID_REQUEST' | 'OVER_QUERY_LIMIT' | 'REQUEST_DENIED' | 'UNKNOWN_ERROR';
    enum TravelMode {
      DRIVING = 'DRIVING',
      WALKING = 'WALKING',
      BICYCLING = 'BICYCLING',
      TRANSIT = 'TRANSIT'
    }
    enum UnitSystem {
      METRIC = 0,
      IMPERIAL = 1
    }
    const Animation: { DROP: number; BOUNCE: number };
    const MapTypeId: { ROADMAP: string; SATELLITE: string; HYBRID: string; TERRAIN: string };
    const DirectionsStatus: { OK: string; NOT_FOUND: string; ZERO_RESULTS: string; MAX_WAYPOINTS_EXCEEDED: string; INVALID_REQUEST: string; OVER_QUERY_LIMIT: string; REQUEST_DENIED: string; UNKNOWN_ERROR: string };
    const SymbolPath: { CIRCLE: number; FORWARD_CLOSED_ARROW: number; FORWARD_OPEN_ARROW: number; BACKWARD_CLOSED_ARROW: number; BACKWARD_OPEN_ARROW: number };
    const event: { addListener: (instance: any, eventName: string, handler: (...args: any[]) => void) => MapsEventListener; addListenerOnce: (instance: any, eventName: string, handler: (...args: any[]) => void) => MapsEventListener; removeListener: (listener: MapsEventListener) => void; clearListeners: (instance: any, eventName: string) => void; trigger: (instance: any, eventName: string, ...args: any[]) => void };
  }
}

// Helper types for Supabase Generic usage
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: UserProfile
        Insert: UserProfile
        Update: Partial<UserProfile>
      }
      messages: {
        Row: Message
        Insert: Message
        Update: Partial<Message>
      }
      app_settings: {
        Row: AppSettings
        Insert: AppSettings
        Update: Partial<AppSettings>
      }
      broadcasts: { // Nova tabela
        Row: BroadcastMessage
        Insert: Partial<BroadcastMessage>
        Update: Partial<BroadcastMessage>
      }
    }
  }
}