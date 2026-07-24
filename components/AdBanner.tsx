
import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { Banner } from '../types';

export const AdBanner: React.FC = () => {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchBanners = async () => {
            setIsLoading(true);
            const { data, error } = await supabase
                .from('banners')
                .select('*')
                .eq('active', true)
                .order('order', { ascending: true });

            if (error) {
                console.error('Erro ao buscar banners:', error);
            }

            if (data) {
                console.log('Banners carregados:', data);
                setBanners(data);
            }
            setIsLoading(false);
        };

        fetchBanners();

        const subscription = supabase
            .channel('banners-changes')
            .on('postgres_changes', { event: '*', schema: 'chegoja', table: 'banners' }, fetchBanners)
            .subscribe();

        return () => {
            supabase.removeChannel(subscription);
        };
    }, []);

    useEffect(() => {
        if (banners.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % banners.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [banners]);

    // Don't render anything if no banners or still loading
    if (isLoading || banners.length === 0) return null;

    const banner = banners[currentIndex];

    return (
        <div className="w-full h-32 sm:h-40 rounded-xl overflow-hidden shadow-lg mb-4 relative group cursor-pointer"
            onClick={() => banner.link_url && window.open(banner.link_url, '_blank')}>
            <img
                src={banner.image_url}
                alt="Banner Promocional"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                onError={(e) => {
                    console.error('Erro ao carregar imagem do banner:', banner.image_url);
                    (e.target as HTMLImageElement).style.display = 'none';
                }}
            />
            {banners.length > 1 && (
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {banners.map((_, idx) => (
                        <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentIndex ? 'bg-white w-4' : 'bg-white/50'}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
