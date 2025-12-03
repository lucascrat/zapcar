import React, { useEffect } from 'react';
import { AdMobService } from '../services/adMobService';

interface AdBannerProps {
    className?: string;
}

import { Capacitor } from '@capacitor/core';

export const AdBanner: React.FC<AdBannerProps> = ({ className = '' }) => {
    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            AdMobService.showBanner();
        }
        return () => {
            if (Capacitor.isNativePlatform()) {
                AdMobService.removeBanner();
            }
        };
    }, []);

    if (!Capacitor.isNativePlatform()) {
        return null;
    }

    return (
        <div
            id="admob-banner-container"
            className={`w-full bg-gray-900 flex items-center justify-center shrink-0 ${className}`}
            style={{ minHeight: '50px', maxHeight: '90px' }}
        >
            {/* O banner do AdMob será injetado aqui pelo serviço nativo */}
            <div className="text-gray-500 text-xs">Publicidade</div>
        </div>
    );
};
