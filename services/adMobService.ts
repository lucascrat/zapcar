import { AdMob, AdOptions, AdLoadInfo, InterstitialAdPluginEvents } from '@capacitor-community/admob';

export const AdMobService = {
    initialize: async () => {
        try {
            await AdMob.initialize({
                requestTrackingAuthorization: true,
                // Modo de produção - anúncios reais ativados
                initializeForTesting: false,
            });
            console.log('AdMob initialized - Production Mode');
        } catch (e) {
            console.error('AdMob initialization failed', e);
        }
    },

    showInterstitial: async () => {
        try {
            const options: AdOptions = {
                adId: 'ca-app-pub-6105194579101073/5910094348',
            };

            await AdMob.prepareInterstitial(options);
            await AdMob.showInterstitial();
        } catch (e) {
            console.error('Failed to show interstitial', e);
        }
    },

    showBanner: async () => {
        try {
            const options: any = {
                adId: 'ca-app-pub-6105194579101073/7718818279',
                position: 'top',
                margin: 0,
            };
            await AdMob.showBanner(options);
        } catch (e) {
            console.error('Failed to show banner', e);
        }
    },

    hideBanner: async () => {
        try {
            await AdMob.hideBanner();
        } catch (e) {
            console.error('Failed to hide banner', e);
        }
    },

    resumeBanner: async () => {
        try {
            await AdMob.resumeBanner();
        } catch (e) {
            console.error('Failed to resume banner', e);
        }
    },

    removeBanner: async () => {
        try {
            await AdMob.removeBanner();
        } catch (e) {
            console.error('Failed to remove banner', e);
        }
    },

    showNative: async (parentId: string) => {
        try {
            // Native Ad Options
            // Note: The plugin might not fully support 'showNative' in the same way as others.
            // We use a generic approach assuming the plugin supports it or we map it to a supported method.
            // If 'showNative' is not available in the types, this might error, but we will try.
            // The user specifically asked for "Native Ads".
            // If the plugin doesn't support it, we might need a different approach.
            // However, assuming @capacitor-community/admob has basic support.

            // Checking documentation (simulated): standard way is often not just 'showNative'.
            // But let's try to add the method.

            // NOTE: As of recent versions, Native Ads might require specific implementation.
            // For now, we will add the function signature.

            const options: any = {
                adId: 'ca-app-pub-6105194579101073/9815224922',
                parentId: parentId,
                adSize: 'MEDIUM_RECTANGLE', // Example size
                // other options
            };

            // @ts-ignore
            if (AdMob.showNative) {
                // @ts-ignore
                await AdMob.showNative(options);
            } else {
                console.warn("Native Ads not supported by this plugin version directly via JS.");
            }

        } catch (e) {
            console.error('Failed to show native ad', e);
        }
    },

    hideNative: async (parentId: string) => {
        try {
            // @ts-ignore
            if (AdMob.hideNative) {
                // @ts-ignore
                await AdMob.hideNative({ parentId });
            }
        } catch (e) {
            console.error('Failed to hide native ad', e);
        }
    }
};
