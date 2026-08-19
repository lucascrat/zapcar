
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { Banner } from '../types';

/**
 * Carrossel de banners promocionais (estilo 99Pay).
 * Rolagem horizontal com snap, avanço automático a cada 5s e indicadores (dots).
 * Os banners são cadastrados pelo admin (proporção recomendada 3:1, ex: 1200x400).
 */
export const AdBanner: React.FC = () => {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);
    const isUserScrolling = useRef(false);
    const userScrollTimeout = useRef<any>(null);

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

    // Auto-advance a cada 5s (pausa enquanto o usuário arrasta manualmente)
    useEffect(() => {
        if (banners.length <= 1) return;

        const interval = setInterval(() => {
            if (isUserScrolling.current) return;
            setCurrentIndex((prev) => {
                const next = (prev + 1) % banners.length;
                scrollToIndex(next);
                return next;
            });
        }, 5000);

        return () => clearInterval(interval);
    }, [banners]);

    const scrollToIndex = (idx: number) => {
        const el = scrollRef.current;
        if (!el) return;
        const child = el.children[idx] as HTMLElement | undefined;
        if (child) {
            el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' });
        }
    };

    // Sincroniza o dot ativo quando o usuário arrasta manualmente
    const handleScroll = () => {
        const el = scrollRef.current;
        if (!el || banners.length === 0) return;

        isUserScrolling.current = true;
        if (userScrollTimeout.current) clearTimeout(userScrollTimeout.current);
        userScrollTimeout.current = setTimeout(() => { isUserScrolling.current = false; }, 2500);

        const cardWidth = el.scrollWidth / banners.length;
        const idx = Math.round(el.scrollLeft / cardWidth);
        if (idx !== currentIndex && idx >= 0 && idx < banners.length) {
            setCurrentIndex(idx);
        }
    };

    if (isLoading || banners.length === 0) return null;

    return (
        <div className="w-full">
            <div
                ref={scrollRef}
                onScroll={handleScroll}
                className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-3 -mx-1 px-1"
                style={{ scrollbarWidth: 'none' }}
            >
                {banners.map((banner) => (
                    <div
                        key={banner.id}
                        onClick={() => banner.link_url && window.open(banner.link_url, '_blank')}
                        className="snap-center shrink-0 w-full rounded-2xl overflow-hidden shadow-md bg-white cursor-pointer active:scale-[0.99] transition-transform"
                        style={{ aspectRatio: '3 / 1' }}
                    >
                        <img
                            src={banner.image_url}
                            alt="Banner Promocional"
                            className="w-full h-full object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).parentElement!.style.display = 'none';
                            }}
                        />
                    </div>
                ))}
            </div>

            {banners.length > 1 && (
                <div className="flex justify-center gap-1.5 mt-2">
                    {banners.map((_, idx) => (
                        <button
                            key={idx}
                            onClick={() => { setCurrentIndex(idx); scrollToIndex(idx); }}
                            className={`h-1.5 rounded-full transition-all ${idx === currentIndex ? 'bg-gray-800 w-5' : 'bg-gray-300 w-1.5'}`}
                            aria-label={`Banner ${idx + 1}`}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
