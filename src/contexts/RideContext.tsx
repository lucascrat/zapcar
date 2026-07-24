/**
 * RideContext - Gerenciamento de Corridas
 * 
 * Centraliza toda a lógica de solicitação, aceitação e acompanhamento de corridas.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { Ride, UserProfile, AppSettings } from '../../types';
import { supabase, subscribeToRides, cancelRide, acceptRide, updateRideStatus, completeRide, fetchAppSettings } from '../../services/supabaseClient';
import { sendNotification } from '../../services/notificationSender';

// Types
interface RideState {
    activeRide: Ride | null;
    pendingRide: Ride | null; // For drivers - incoming ride request
    rideHistory: Ride[];
    isLoading: boolean;
    error: string | null;
}

interface RideRequest {
    clientId: string;
    vehicleType: 'car' | 'motorcycle';
    originLat: number;
    originLng: number;
    originAddress: string;
    destinationLat?: number;
    destinationLng?: number;
    destinationAddress?: string;
    estimatedPrice?: number;
    estimatedTime?: number;
    distanceKm?: number;
    couponId?: string;
    discountAmount?: number;
}

interface RideContextType extends RideState {
    requestRide: (request: RideRequest) => Promise<boolean>;
    cancelCurrentRide: (reason?: string) => Promise<boolean>;
    acceptPendingRide: () => Promise<boolean>;
    rejectPendingRide: () => Promise<boolean>;
    startRide: () => Promise<boolean>;
    finishRide: (finalPrice: number, paymentMethod: 'pix' | 'card' | 'cash' | 'coins') => Promise<boolean>;
    loadHistory: (userId: string) => Promise<void>;
    clearError: () => void;
    settings: AppSettings | null;
}

// Default State
const defaultState: RideState = {
    activeRide: null,
    pendingRide: null,
    rideHistory: [],
    isLoading: false,
    error: null,
};

// Create Context
const RideContext = createContext<RideContextType | undefined>(undefined);

// Provider Component
export const RideProvider: React.FC<{ children: ReactNode; userId?: string; userRole?: string }> = ({
    children,
    userId,
    userRole
}) => {
    const [state, setState] = useState<RideState>(defaultState);
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const subscriptionRef = useRef<any>(null);

    // Load settings on mount
    useEffect(() => {
        const loadSettings = async () => {
            try {
                const appSettings = await fetchAppSettings();
                setSettings(appSettings);
            } catch (e) {
                console.error('[RideContext] Error loading settings:', e);
            }
        };
        loadSettings();
    }, []);

    // Subscribe to ride updates
    useEffect(() => {
        if (!userId || !userRole) return;

        const handleRideUpdate = (ride: Ride) => {
            console.log('[RideContext] Ride update:', ride);

            // For drivers - check if this is a new ride offer
            if (userRole === 'driver') {
                if (ride.status === 'searching' && ride.driver_id === userId) {
                    // This is a ride being offered to this driver
                    setState(prev => ({ ...prev, pendingRide: ride }));
                } else if (ride.driver_id === userId && ['accepted', 'en_route', 'arrived', 'started', 'waiting_payment'].includes(ride.status)) {
                    // This is an active ride for this driver
                    setState(prev => ({ ...prev, activeRide: ride, pendingRide: null }));
                } else if (ride.driver_id === userId && ['finished', 'cancelled'].includes(ride.status)) {
                    // Ride ended
                    setState(prev => ({ ...prev, activeRide: null, pendingRide: null }));
                }
            }

            // For clients - track their ride
            if (userRole === 'client' && ride.client_id === userId) {
                if (['searching', 'accepted', 'en_route', 'arrived', 'started', 'waiting_payment'].includes(ride.status)) {
                    setState(prev => ({ ...prev, activeRide: ride }));
                } else if (['finished', 'cancelled'].includes(ride.status)) {
                    setState(prev => ({ ...prev, activeRide: null }));
                }
            }
        };

        // Subscribe to rides table
        const setupSubscription = async () => {
            subscriptionRef.current = subscribeToRides(userId, userRole as any, handleRideUpdate);
        };

        setupSubscription();

        return () => {
            if (subscriptionRef.current) {
                subscriptionRef.current.unsubscribe();
            }
        };
    }, [userId, userRole]);

    // Request Ride (Client)
    const requestRide = useCallback(async (request: RideRequest): Promise<boolean> => {
        setState(prev => ({ ...prev, isLoading: true, error: null }));

        try {
            const newRide: Partial<Ride> = {
                client_id: request.clientId,
                vehicle_type: request.vehicleType,
                origin_lat: request.originLat,
                origin_lng: request.originLng,
                origin_address: request.originAddress,
                destination_lat: request.destinationLat,
                destination_lng: request.destinationLng,
                destination_address: request.destinationAddress,
                estimated_price: request.estimatedPrice,
                estimated_time: request.estimatedTime,
                distance_km: request.distanceKm,
                coupon_id: request.couponId,
                discount_amount: request.discountAmount,
                status: 'searching',
                is_broadcast: true,
                ignored_drivers: [],
            };

            const { data, error } = await supabase
                .from('rides')
                .insert(newRide)
                .select()
                .single();

            if (error) {
                console.error('[RideContext] Request ride error:', error);
                setState(prev => ({
                    ...prev,
                    isLoading: false,
                    error: 'Erro ao solicitar corrida. Tente novamente.',
                }));
                return false;
            }

            setState(prev => ({
                ...prev,
                activeRide: data as Ride,
                isLoading: false,
            }));

            console.log('[RideContext] Ride requested:', data.id);
            return true;
        } catch (e) {
            console.error('[RideContext] Request ride error:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao solicitar corrida.',
            }));
            return false;
        }
    }, []);

    // Cancel Current Ride
    const cancelCurrentRide = useCallback(async (reason?: string): Promise<boolean> => {
        if (!state.activeRide) return false;

        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const success = await cancelRide(state.activeRide.id);

            if (success) {
                setState(prev => ({
                    ...prev,
                    activeRide: null,
                    isLoading: false,
                }));
                console.log('[RideContext] Ride cancelled');
                return true;
            }

            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao cancelar corrida.',
            }));
            return false;
        } catch (e) {
            console.error('[RideContext] Cancel ride error:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao cancelar corrida.',
            }));
            return false;
        }
    }, [state.activeRide]);

    // Accept Pending Ride (Driver)
    const acceptPendingRide = useCallback(async (): Promise<boolean> => {
        if (!state.pendingRide || !userId) return false;

        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const success = await acceptRide(state.pendingRide.id, userId);

            if (success) {
                setState(prev => ({
                    ...prev,
                    activeRide: { ...prev.pendingRide!, status: 'en_route', driver_id: userId },
                    pendingRide: null,
                    isLoading: false,
                }));

                // Notify client
                if (state.pendingRide.client_id) {
                    await sendNotification(
                        'Motorista a caminho! 🚗',
                        'Seu motorista aceitou a corrida e está indo até você.',
                        'user',
                        { targetUserId: state.pendingRide.client_id }
                    );
                }

                console.log('[RideContext] Ride accepted');
                return true;
            }

            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao aceitar corrida.',
            }));
            return false;
        } catch (e) {
            console.error('[RideContext] Accept ride error:', e);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Erro ao aceitar corrida.',
            }));
            return false;
        }
    }, [state.pendingRide, userId]);

    // Reject Pending Ride (Driver)
    const rejectPendingRide = useCallback(async (): Promise<boolean> => {
        if (!state.pendingRide || !userId) return false;

        try {
            // Add this driver to ignored list
            const ignoredDrivers = state.pendingRide.ignored_drivers || [];
            ignoredDrivers.push(userId);

            await supabase
                .from('rides')
                .update({
                    ignored_drivers: ignoredDrivers,
                    driver_id: null // Remove driver assignment
                })
                .eq('id', state.pendingRide.id);

            setState(prev => ({
                ...prev,
                pendingRide: null,
            }));

            console.log('[RideContext] Ride rejected');
            return true;
        } catch (e) {
            console.error('[RideContext] Reject ride error:', e);
            return false;
        }
    }, [state.pendingRide, userId]);

    // Start Ride (Driver)
    const startRide = useCallback(async (): Promise<boolean> => {
        if (!state.activeRide) return false;

        try {
            const success = await updateRideStatus(state.activeRide.id, 'started');

            if (success) {
                setState(prev => ({
                    ...prev,
                    activeRide: { ...prev.activeRide!, status: 'started' },
                }));

                // Notify client
                if (state.activeRide.client_id) {
                    await sendNotification(
                        'Corrida iniciada! 🚀',
                        'Sua corrida começou. Boa viagem!',
                        'user',
                        { targetUserId: state.activeRide.client_id }
                    );
                }

                console.log('[RideContext] Ride started');
                return true;
            }

            return false;
        } catch (e) {
            console.error('[RideContext] Start ride error:', e);
            return false;
        }
    }, [state.activeRide]);

    // Finish Ride (Driver)
    const finishRide = useCallback(async (
        finalPrice: number,
        paymentMethod: 'pix' | 'card' | 'cash' | 'coins'
    ): Promise<boolean> => {
        if (!state.activeRide) return false;

        try {
            const success = await completeRide(state.activeRide.id, finalPrice, paymentMethod);

            if (success) {
                setState(prev => ({
                    ...prev,
                    activeRide: null,
                }));

                console.log('[RideContext] Ride finished');
                return true;
            }

            return false;
        } catch (e) {
            console.error('[RideContext] Finish ride error:', e);
            return false;
        }
    }, [state.activeRide]);

    // Load History
    const loadHistory = useCallback(async (targetUserId: string) => {
        setState(prev => ({ ...prev, isLoading: true }));

        try {
            const { data, error } = await supabase
                .from('rides')
                .select('*, driver:profiles!driver_id(*), client:profiles!client_id(*)')
                .or(`client_id.eq.${targetUserId},driver_id.eq.${targetUserId}`)
                .in('status', ['finished', 'cancelled'])
                .order('created_at', { ascending: false })
                .limit(50);

            if (!error && data) {
                setState(prev => ({
                    ...prev,
                    rideHistory: data as Ride[],
                    isLoading: false,
                }));
            } else {
                setState(prev => ({ ...prev, isLoading: false }));
            }
        } catch (e) {
            console.error('[RideContext] Load history error:', e);
            setState(prev => ({ ...prev, isLoading: false }));
        }
    }, []);

    // Clear Error
    const clearError = useCallback(() => {
        setState(prev => ({ ...prev, error: null }));
    }, []);

    const value: RideContextType = {
        ...state,
        settings,
        requestRide,
        cancelCurrentRide,
        acceptPendingRide,
        rejectPendingRide,
        startRide,
        finishRide,
        loadHistory,
        clearError,
    };

    return (
        <RideContext.Provider value={value}>
            {children}
        </RideContext.Provider>
    );
};

// Hook
export const useRide = (): RideContextType => {
    const context = useContext(RideContext);
    if (!context) {
        throw new Error('useRide must be used within a RideProvider');
    }
    return context;
};

export default RideContext;
