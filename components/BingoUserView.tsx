
import React, { useState, useEffect } from 'react';
import { UserProfile, BingoSettings, BingoCard } from '../types';
import { fetchBingoSettings, getOrCreateBingoCard, subscribeToBingo } from '../services/supabaseClient';
import { AdMobService } from '../services/adMobService';


interface BingoUserViewProps {
    currentUser: UserProfile;
    onClose: () => void;
}

export const BingoUserView: React.FC<BingoUserViewProps> = ({ currentUser, onClose }) => {
    const [settings, setSettings] = useState<BingoSettings | null>(null);
    const [card, setCard] = useState<BingoCard | null>(null);
    const [drawnSet, setDrawnSet] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (window.Capacitor?.isNativePlatform()) {
            AdMobService.showBanner().catch(() => { });
            AdMobService.showInterstitial().catch(() => { });
        }

        loadData();

        const sub: any = subscribeToBingo(() => {
            loadData(); // Atualiza se sortearem numero
        });
        return () => {
            sub?.unsubscribe?.();
            if (window.Capacitor?.isNativePlatform()) {
                AdMobService.removeBanner().catch(() => { });
            }
        }
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            setError(null);

            console.log('[BingoUserView] Carregando settings...');
            const s = await fetchBingoSettings();
            console.log('[BingoUserView] Settings:', s);

            if (!s) {
                setError('Não foi possível carregar as configurações do Bingo');
                setLoading(false);
                return;
            }

            setSettings(s);
            setDrawnSet(new Set(s.drawn_numbers || []));

            console.log('[BingoUserView] Carregando cartela para:', currentUser.id);
            const c = await getOrCreateBingoCard(currentUser.id);
            console.log('[BingoUserView] Cartela:', c);

            if (!c) {
                setError('Não foi possível carregar sua cartela');
                setLoading(false);
                return;
            }

            setCard(c);
            setLoading(false);
        } catch (err: any) {
            console.error('[BingoUserView] Erro:', err);
            setError(err.message || 'Erro ao carregar Bingo');
            setLoading(false);
        }
    };

    const getYoutubeId = (url: string) => {
        if (!url) return null;
        // Regex mais robusto para capturar ID de vários formatos de URL do Youtube incluindo /live/ e /shorts/
        const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|live\/|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    };

    // Loading state
    if (loading) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#111b21] text-white p-8">
                <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mb-4"></div>
                <p className="text-gray-400">Carregando Bingo...</p>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#111b21] text-white p-8">
                <span className="material-icons text-red-500 text-5xl mb-4">error</span>
                <p className="text-red-400 text-center mb-4">{error}</p>
                <button
                    onClick={loadData}
                    className="bg-purple-600 text-white px-6 py-2 rounded-lg font-bold"
                >
                    Tentar Novamente
                </button>
                <button
                    onClick={onClose}
                    className="mt-4 text-gray-400 underline"
                >
                    Voltar
                </button>
            </div>
        );
    }

    if (!settings || !card) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-[#111b21] text-white p-8">
                <span className="material-icons text-yellow-500 text-5xl mb-4">warning</span>
                <p className="text-gray-400">Dados não disponíveis</p>
                <button
                    onClick={onClose}
                    className="mt-4 text-gray-400 underline"
                >
                    Voltar
                </button>
            </div>
        );
    }

    const hits = card.numbers.filter(n => drawnSet.has(n)).length;
    const isWinner = hits >= card.numbers.length;
    const videoId = getYoutubeId(settings.youtube_link);

    return (
        <div className="flex-1 flex flex-col h-full bg-[#111b21] text-white relative overflow-y-auto custom-scrollbar pb-24">
            {/* AdMob Banner Removed */}
            {/* Header */}
            <div className="bg-purple-900 p-4 flex justify-between items-center shadow-lg shrink-0">
                <div className="flex items-center gap-2">
                    <button onClick={onClose} className="mr-2 p-1 rounded-full hover:bg-white/10 transition">
                        <span className="material-icons text-white">arrow_back</span>
                    </button>
                    <span className="material-icons text-yellow-400 text-3xl">casino</span>
                    <h1 className="text-xl font-bold text-white tracking-wider">PRÊMIOS CHEGOJÁ</h1>
                </div>
                <button onClick={onClose} className="text-white hover:text-gray-300">
                    <span className="material-icons">close</span>
                </button>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 p-4 max-w-6xl mx-auto w-full">

                {/* Left Column: Prize Info */}
                <div className="lg:w-1/2 space-y-6">
                    <div className="bg-[#1f2c34] rounded-xl overflow-hidden shadow-lg border border-gray-700">
                        <img src={settings.prize_image} alt="Prêmio" className="w-full h-48 object-cover" />
                        <div className="p-4">
                            <h2 className="text-2xl font-bold text-yellow-400 mb-2">{settings.prize_description}</h2>
                            <div className="flex items-center justify-between text-sm text-gray-400">
                                <span>Sorteio ativo</span>
                                <span>{settings.drawn_numbers.length} números chamados</span>
                            </div>
                        </div>
                    </div>

                    {videoId && (
                        <div className="bg-[#1f2c34] rounded-xl overflow-hidden shadow-lg border border-gray-700">
                            {/* Wrapper para garantir 16:9 responsivo sem plugins extras */}
                            <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                                <iframe
                                    className="absolute top-0 left-0 w-full h-full"
                                    src={`https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
                                    title="YouTube video player"
                                    frameBorder="0"
                                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                    allowFullScreen
                                    referrerPolicy="strict-origin-when-cross-origin"
                                ></iframe>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: The Card */}
                <div className="lg:w-1/2">
                    <div className="bg-white rounded-xl p-4 shadow-2xl relative overflow-hidden">
                        {/* Badge de acertos */}
                        <div className="absolute -top-1 -right-1 bg-red-600 text-white w-12 h-12 rounded-full flex items-center justify-center font-bold text-xs shadow-lg z-10">
                            {hits}/{card.numbers.length}
                        </div>

                        <h3 className="text-center text-gray-800 font-bold text-base mb-4 uppercase tracking-wider border-b border-gray-200 pb-2">Minha Cartela</h3>

                        {/* Grid 5x5 com tamanhos fixos */}
                        <div className="flex flex-wrap justify-center gap-1.5">
                            {card.numbers.map((num, idx) => {
                                const marked = drawnSet.has(num);
                                return (
                                    <div
                                        key={idx}
                                        className={`
                                            w-11 h-11 flex items-center justify-center text-sm font-bold rounded-full transition-all duration-300 border-2
                                            ${marked
                                                ? 'bg-purple-600 text-white border-purple-800 shadow-md'
                                                : 'bg-gray-100 text-gray-800 border-gray-300'
                                            }
                                        `}
                                    >
                                        {num}
                                    </div>
                                );
                            })}
                        </div>

                        {isWinner && (
                            <div className="mt-4 bg-green-500 text-white p-3 rounded-lg text-center font-bold text-sm animate-pulse shadow-lg border-2 border-green-600">
                                🎉 BINGO! VOCÊ GANHOU! 🎉
                            </div>
                        )}
                    </div>

                    {/* Last called numbers */}
                    <div className="mt-6">
                        <h4 className="text-gray-400 text-sm mb-2 uppercase">Últimos Sorteados</h4>
                        <div className="flex gap-2 flex-wrap">
                            {settings.drawn_numbers.slice(-8).reverse().map((n, i) => (
                                <div key={i} className="w-10 h-10 rounded-full bg-[#2a3942] border border-gray-600 flex items-center justify-center font-mono text-yellow-400 font-bold shadow-sm">
                                    {n}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
