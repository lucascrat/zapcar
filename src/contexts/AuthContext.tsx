/**
 * AuthContext - Gerenciamento de Autenticação
 * 
 * Centraliza toda a lógica de login, logout e estado do usuário.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile, UserRole } from '../../types';
import { supabase } from '../../services/supabaseClient';

// Types
interface AuthState {
    user: UserProfile | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    error: string | null;
}

interface LoginCredentials {
    username: string;
    password: string;
    role?: UserRole;
}

interface RegisterData {
    username: string;
    password: string;
    phone?: string;
    role: UserRole;
    avatar_url?: string;
    vehicle_type?: 'car' | 'motorcycle';
    vehicle_model?: string;
    vehicle_plate?: string;
    vehicle_color?: string;
}

interface AuthContextType extends AuthState {
    login: (credentials: LoginCredentials) => Promise<boolean>;
    logout: () => void;
    register: (data: RegisterData) => Promise<{ success: boolean; error?: string }>;
    updateUser: (updates: Partial<UserProfile>) => Promise<boolean>;
    refreshUser: () => Promise<void>;
    clearError: () => void;
}

// Default State
const defaultState: AuthState = {
    user: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,
};

// Create Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Storage Keys
const STORAGE_KEY = 'chegoja_user';

// Provider Component
export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<AuthState>(defaultState);

    // Load user from storage on mount
    useEffect(() => {
        const loadStoredUser = async () => {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    const user = JSON.parse(stored) as UserProfile;

                    // Verify user still exists in database
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('*')
                        .eq('id', user.id)
                        .single();

                    if (data && !error) {
                        setState({
                            user: data as UserProfile,
                            isAuthenticated: true,
                            isLoading: false,
                            error: null,
                        });
                        return;
                    }
                }
            } catch (e) {
                console.error('[AuthContext] Error loading stored user:', e);
            }

            setState(prev => ({ ...prev, isLoading: false }));
        };

        loadStoredUser();
    }, []);

    // Login
    const login = useCallback(async (credentials: LoginCredentials): Promise<boolean> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const { username, password, role } = credentials;

            let query = supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password);

            // Filter by role if provided
            if (role) {
                query = query.eq('role', role);
            }

            const { data, error } = await query.single();

            if (error || !data) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: 'Usuário ou senha incorretos',
                }));
                return false;
            }

            const user = data as UserProfile;

            // Check if driver is approved
            if (user.role === UserRole.DRIVER && !user.is_approved) {
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: 'Seu cadastro ainda não foi aprovado. Aguarde a aprovação do administrador.',
                }));
                return false;
            }

            // Check subscription for drivers
            if (user.role === UserRole.DRIVER && user.subscription_expires_at) {
                const expiresAt = new Date(user.subscription_expires_at);
                if (expiresAt < new Date()) {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        error: 'Sua assinatura expirou. Por favor, renove seu plano.',
                    }));
                    return false;
                }
            }

            // Save to storage
            localStorage.setItem(STORAGE_KEY, JSON.stringify(user));

            setState({
                user,
                isAuthenticated: true,
                isLoading: false,
                error: null,
            });

            console.log('[AuthContext] Login successful:', user.username);
            return true;
        } catch (e) {
            console.error('[AuthContext] Login error:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao fazer login. Tente novamente.',
            }));
            return false;
        }
    }, []);

    // Logout
    const logout = useCallback(() => {
        localStorage.removeItem(STORAGE_KEY);
        setState({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: null,
        });
        console.log('[AuthContext] User logged out');
    }, []);

    // Register
    const register = useCallback(async (data: RegisterData): Promise<{ success: boolean; error?: string }> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            // Check if username already exists
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', data.username)
                .single();

            if (existing) {
                setState(prev => ({ ...prev, isLoading: false }));
                return { success: false, error: 'Este nome de usuário já está em uso' };
            }

            // Check if phone already exists (if provided)
            if (data.phone) {
                const { data: existingPhone } = await supabase
                    .from('profiles')
                    .select('id')
                    .eq('phone', data.phone)
                    .single();

                if (existingPhone) {
                    setState(prev => ({ ...prev, isLoading: false }));
                    return { success: false, error: 'Este telefone já está cadastrado' };
                }
            }

            // Generate avatar URL if not provided
            const avatarUrl = data.avatar_url ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(data.username)}&background=00a884&color=fff&size=128`;

            // Create profile
            const newProfile: Partial<UserProfile> = {
                username: data.username,
                password: data.password, // TODO: Hash password
                phone: data.phone,
                role: data.role,
                avatar_url: avatarUrl,
                status: data.role === UserRole.CLIENT ? 'available' as any : 'offline' as any,
                is_approved: data.role === UserRole.CLIENT, // Clients auto-approved
                vehicle_type: data.vehicle_type,
                vehicle_model: data.vehicle_model,
                vehicle_plate: data.vehicle_plate,
                vehicle_color: data.vehicle_color,
                wallet_coins: 0,
                financial_balance: 0,
            };

            const { data: created, error } = await supabase
                .from('profiles')
                .insert(newProfile)
                .select()
                .single();

            if (error) {
                console.error('[AuthContext] Register error:', error);
                setState(prev => ({ ...prev, isLoading: false }));
                return { success: false, error: 'Erro ao criar conta. Tente novamente.' };
            }

            // Auto-login for clients
            if (data.role === UserRole.CLIENT && created) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(created));
                setState({
                    user: created as UserProfile,
                    isAuthenticated: true,
                    isLoading: false,
                    error: null,
                });
            } else {
                setState(prev => ({ ...prev, isLoading: false }));
            }

            console.log('[AuthContext] Registration successful:', data.username);
            return { success: true };
        } catch (e) {
            console.error('[AuthContext] Register error:', e);
            setState(prev => ({ ...prev, isLoading: false }));
            return { success: false, error: 'Erro ao criar conta. Tente novamente.' };
        }
    }, []);

    // Update User
    const updateUser = useCallback(async (updates: Partial<UserProfile>): Promise<boolean> => {
        if (!state.user) return false;

        try {
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('id', state.user.id);

            if (error) {
                console.error('[AuthContext] Update error:', error);
                return false;
            }

            const updatedUser = { ...state.user, ...updates };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser));
            setState(prev => ({ ...prev, user: updatedUser }));

            console.log('[AuthContext] User updated');
            return true;
        } catch (e) {
            console.error('[AuthContext] Update error:', e);
            return false;
        }
    }, [state.user]);

    // Refresh User
    const refreshUser = useCallback(async () => {
        if (!state.user) return;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', state.user.id)
                .single();

            if (data && !error) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
                setState(prev => ({ ...prev, user: data as UserProfile }));
            }
        } catch (e) {
            console.error('[AuthContext] Refresh error:', e);
        }
    }, [state.user]);

    // Clear Error
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    const value: AuthContextType = {
        ...state,
        login,
        logout,
        register,
        updateUser,
        refreshUser,
        clearError,
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export default AuthContext;
