
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
  vehicle_type?: 'car' | 'motorcycle'; // Novo campo para tipo de veículo
  lat?: number;
  lng?: number;
  unread_count?: number; // Contador de mensagens não lidas (Frontend Only)
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
  car_start_distance_limit: number; // Distância (km) incluída na bandeirada
  moto_base_price: number;
  moto_price_km: number;
  moto_price_min: number;
  moto_start_distance_limit: number; // Distância (km) incluída na bandeirada
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
    target_role: 'client' | 'driver' | 'all';
    created_at: string;
}

// Interfaces para Pagamento Pix Transparente
export interface PayerFormData {
    firstName: string;
    lastName: string;
    email: string;
    cpf: string;
}

export interface PixPaymentResponse {
    id: number;
    status: string;
    point_of_interaction: {
        transaction_data: {
            qr_code: string; // Copia e Cola
            qr_code_base64: string; // Imagem
        }
    }
}

// Tipo para as abas do Painel Admin
export type AdminTab = 'details' | 'map' | 'history' | 'settings' | 'chat' | 'bingo' | 'approvals' | 'notifications';

// Interface global para comunicação com Android Nativo
declare global {
  interface Window {
    Android?: {
      triggerNativeAlert: () => void;
      triggerNativeMessageSound: () => void; // Novo método para mensagens
      stopNativeAlert: () => void;
      showToast: (msg: string) => void;
      bringToFront: () => void;
    };
    // FIX: Add pushalert to window to solve TypeScript errors.
    pushalert?: any;
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
