import { Capacitor } from '@capacitor/core';
import {
    AdMob,
    AdOptions,
    AdLoadInfo,
    InterstitialAdPluginEvents,
    BannerAdPosition,
    RewardAdOptions,
    AdMobRewardItem,
} from '@capacitor-community/admob';

// IDs reais de produção (ca-app-pub-6105194579101073).
// Env vars têm prioridade; se não definidas, usa o ID real hardcoded.
const BANNER_ID       = (import.meta as any).env?.VITE_ADMOB_BANNER_ID       || 'ca-app-pub-6105194579101073/1959488464';
const INTERSTITIAL_ID = (import.meta as any).env?.VITE_ADMOB_INTERSTITIAL_ID || 'ca-app-pub-6105194579101073/5910094348';
const NATIVE_ID       = (import.meta as any).env?.VITE_ADMOB_NATIVE_ID       || 'ca-app-pub-6105194579101073/9815224922';
const REWARDED_ID     = (import.meta as any).env?.VITE_ADMOB_REWARDED_ID       || 'ca-app-pub-6105194579101073/2099199008';

let bannerVisible = false;

export const AdMobService = {
    initialize: async () => {
        if (!Capacitor.isNativePlatform()) {
            console.log('[AdMob] Web Environment - Skipping initialization');
            return;
        }
        try {
            await AdMob.initialize({
                initializeForTesting: false,
            });
            console.log('AdMob initialized - PRODUCTION MODE');
        } catch (e) {
            console.error('AdMob initialization failed', e);
        }
    },

    showInterstitial: async () => {
        try {
            const options: AdOptions = {
                adId: INTERSTITIAL_ID,
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
                adId: BANNER_ID,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
            };
            if (bannerVisible) return;
            try { await AdMob.removeBanner(); } catch { }
            await AdMob.showBanner(options);
            bannerVisible = true;
        } catch (e) {
            console.error('Failed to show banner', e);
        }
    },

    hideBanner: async () => {
        try {
            if (!bannerVisible) return;
            await AdMob.hideBanner();
            bannerVisible = false;
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
            bannerVisible = false;
        } catch (e) {
            console.error('Failed to remove banner', e);
        }
    },

    showNative: async (parentId: string) => {
        try {
            const options: any = {
                adId: NATIVE_ID,
                parentId: parentId,
                adSize: 'MEDIUM_RECTANGLE',
            };

            // @ts-ignore
            if (AdMob.showNativeAd) {
                // @ts-ignore
                await AdMob.showNativeAd(options);
            } else {
                console.warn("Native Ads not supported by this plugin version directly via JS (tried showNativeAd).");
            }

        } catch (e) {
            console.error('Failed to show native ad', e);
        }
    },

    hideNative: async (parentId: string) => {
        try {
            // @ts-ignore
            if (AdMob.hideNativeAd) {
                // @ts-ignore
                await AdMob.hideNativeAd({ parentId });
            }
        } catch (e) {
            console.error('Failed to hide native ad', e);
        }
    },

    showRewardVideo: async (): Promise<boolean> => {
        try {
            if (!window.Capacitor?.isNativePlatform()) {
                return new Promise(resolve => setTimeout(() => resolve(true), 1500));
            }

            const adId = REWARDED_ID;

            const options: RewardAdOptions = {
                adId,
            };

            try {
                await AdMob.prepareRewardVideoAd(options);
            } catch (prepError) {
                console.error('[AdMob] Erro ao preparar Rewarded:', prepError);
                return false;
            }

            try {
                const rewardItem: AdMobRewardItem | null = await AdMob.showRewardVideoAd();
                console.log('[AdMob] Reward recebido:', rewardItem);
                return !!rewardItem;
            } catch (showError) {
                console.error('[AdMob] Erro ao exibir Rewarded:', showError);
                return false;
            }
        } catch (e) {
            console.error('Failed to show reward video', e);
            return false;
        }
    }
};
