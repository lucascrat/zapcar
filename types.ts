
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
  role: UserRole;
  status: DriverStatus;
  avatar_url?: string;
  created_at?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_color?: string;
  lat?: number;
  lng?: number;
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
    }
  }
}