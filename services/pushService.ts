// Push Notifications Service using Firebase Cloud Messaging
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from './supabaseClient';
import { soundService } from './soundService';

class PushNotificationService {
    private isInitialized = false;
    private currentUserId: string | null = null;

    // Initialize push notifications for a user
    async initialize(userId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) {
            console.log('[Push] Not a native platform, skipping push setup');
            return false;
        }

        if (this.isInitialized && this.currentUserId === userId) {
            console.log('[Push] Already initialized for this user');
            return true;
        }

        this.currentUserId = userId;
        console.log('[Push] Initializing for user:', userId);

        try {
            console.log('[Push] Initializing for user:', userId);

            // Remove existing listeners first to avoid duplicates
            await PushNotifications.removeAllListeners();
            console.log('[Push] Removed existing listeners');

            // Add listeners BEFORE calling register() - this is critical!
            PushNotifications.addListener('registration', async (token) => {
                console.log('[Push] Token recebido via listener');
                // Save token to database
                await this.saveToken(userId, token.value);
            });

            PushNotifications.addListener('registrationError', (error) => {
                console.error('[Push] Registration error:', error.error);
            });

            PushNotifications.addListener('pushNotificationReceived', (notification) => {
                console.log('[Push] Notification received in foreground:', notification);
                // Play alert sound for foreground notification
                soundService.playReceived();
                // Display a simple alert for testing foreground notifications
                if (typeof window !== 'undefined') {
                    alert('Notificação Recebida: ' + notification.title + '\n' + notification.body);
                }
                this.handleNotification(notification);
            });

            PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                console.log('[Push] Notification action performed:', notification);
                this.handleNotificationAction(notification);
            });

            console.log('[Push] Listeners registrados, solicitando permissões...');

            // Request permission
            const permResult = await PushNotifications.requestPermissions();
            console.log('[Push] Permission result:', permResult.receive);

            if (permResult.receive !== 'granted') {
                console.log('[Push] Permission not granted');
                return false;
            }

            // Register with FCM - this will trigger the 'registration' listener
            console.log('[Push] Chamando PushNotifications.register()...');
            await PushNotifications.register();

            // Create channels for Android (crucial for notifications to show up)
            if (Capacitor.getPlatform() === 'android') {
                // Default Channel
                await PushNotifications.createChannel({
                    id: 'chegoja_rides',
                    name: 'Corridas e Alertas',
                    description: 'Notificações de novas corridas e alertas do sistema',
                    importance: 5,
                    visibility: 1,
                    sound: 'default',
                    vibration: true
                });

                // Special Channel (Custom Sound)
                await PushNotifications.createChannel({
                    id: 'special_alert',
                    name: 'Alertas Especiais',
                    description: 'Alertas com som personalizado',
                    importance: 5,
                    visibility: 1,
                    sound: 'ubb', // Matches ubb.mp3 in res/raw (WITHOUT extension)
                    vibration: true
                });

                console.log('[Push] Canais de notificação criados (default e special)');
            }

            this.isInitialized = true;
            console.log('[Push] Initialization complete');
            return true;

        } catch (error) {
            console.error('[Push] Initialization failed:', error);
            return false;
        }
    }

    // Save FCM token to database using Secure RPC
    private async saveToken(userId: string, token: string): Promise<void> {
        try {
            console.log('[Push] Saving token via RPC for user:', userId);
            // DEBUG ALERT
            // alert(`Tentando Salvar Token... User: ${userId.substring(0, 5)}`);

            // Use RPC to bypass potential RLS/Permission issues on the table
            const { data, error } = await supabase.rpc('register_push_token', {
                user_id_param: userId,
                token_param: token,
                platform_param: Capacitor.getPlatform()
            });

            if (error) {
                console.error('[Push] Token Registration RPC ERROR:', JSON.stringify(error, null, 2));
                // alert(`ERRO RPC: ${error.message}`);

                // Fallback
                const { error: tableError } = await supabase
                    .from('push_tokens')
                    .upsert({
                        user_id: userId,
                        token: token,
                        platform: Capacitor.getPlatform(),
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id' });

                if (tableError) {
                    console.error('[Push] Fallback Error:', tableError);
                    // alert(`ERRO Fallback: ${tableError.message}`);
                }
            } else {
                console.log('[Push] Token Registered Successfully via RPC!');
                // alert('SUCESSO! Token Registrado.');
            }
        } catch (error: any) {
            console.error('[Push] CRITICAL EXCEPTION:', error);
            // alert(`CRITICAL: ${error.message}`);
        }
    }

    // Handle incoming notification when app is open
    private handleNotification(notification: any): void {
        // You can display a custom in-app notification here
        // For now, just log it
        console.log('[Push] Notification data:', {
            title: notification.title,
            body: notification.body,
            data: notification.data
        });

        // Trigger native alert if it's a ride notification
        if (notification.data?.type === 'new_ride' && window.Android?.triggerNativeAlert) {
            window.Android.triggerNativeAlert();
        }
    }

    // Handle notification tap action
    private handleNotificationAction(action: any): void {
        const data = action.notification?.data;

        if (data?.type === 'new_ride' && data?.ride_id) {
            // Navigate to ride screen
            console.log('[Push] Should navigate to ride:', data.ride_id);
            // You can dispatch an event here to navigate
            window.dispatchEvent(new CustomEvent('openRide', { detail: { rideId: data.ride_id } }));
        }
    }

    // Remove token on logout
    async removeToken(userId: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('push_tokens')
                .delete()
                .eq('user_id', userId);

            if (error) {
                console.error('[Push] Error removing token:', error);
            } else {
                console.log('[Push] Token removed');
            }
        } catch (error) {
            console.error('[Push] Error removing token:', error);
        }
    }
}

export const pushService = new PushNotificationService();
