/**
 * DriverRewardsScreen - Tela de premiação e ranking semanal para motoristas
 */

import React, { useEffect, useState } from 'react';
import {
    fetchRewardsConfig,
    fetchRewardTiers,
    fetchWeeklyDriverRanking,
    fetchDriverWeeklyRides,
} from '../services/supabaseClient';
import { RewardTier, RewardsConfig, DriverRankingEntry, UserProfile } from '../types';

interface Props {
    currentUser: UserProfile;
    onClose: () => void;
}

const MEDAL_COLORS: Record<number, { bg: string; text: string; border: string; label: string }> = {
    1: { bg: 'from-yellow-500 to-amber-600', text: 'text-yellow-300', border: 'border-yellow-500/40', label: '#f59e0b' },
    2: { bg: 'from-gray-400 to-gray-500',   text: 'text-gray-200',   border: 'border-gray-400/40',   label: '#9ca3af' },
    3: { bg: 'from-orange-700 to-amber-800', text: 'text-orange-300', border: 'border-orange-600/40', label: '#cd7c3a' },
};

export const DriverRewardsScreen: React.FC<Props> = ({ currentUser, onClose }) => {
    const [config, setConfig]           = useState<RewardsConfig | null>(null);
    const [tiers, setTiers]             = useState<RewardTier[]>([]);
    const [ranking, setRanking]         = useState<DriverRankingEntry[]>([]);
    const [myRides, setMyRides]         = useState(0);
    const [myRank, setMyRank]           = useState<number | null>(null);
    const [loading, setLoading]         = useState(true);

    useEffect(() => {
        const load = async () => {
            setLoading(true);
            const [cfg, tierList, rankList, rides] = await Promise.all([
                fetchRewardsConfig(),
                fetchRewardTiers(),
                fetchWeeklyDriverRanking(10),
                fetchDriverWeeklyRides(currentUser.id),
            ]);
            setConfig(cfg);
            setTiers(tierList);
            setRanking(rankList);
            setMyRides(rides);

            const idx = rankList.findIndex(e => e.driver_id === currentUser.id);
            setMyRank(idx >= 0 ? idx + 1 : null);
            setLoading(false);
        };
        load();
    }, [currentUser.id]);

    // Qual prêmio o motorista já alcançou / qual é o próximo
    const earnedTier = [...tiers]
        .filter(t => myRides >= t.min_rides)
        .sort((a, b) => b.min_rides - a.min_rides)[0] ?? null;

    const nextTier = [...tiers]
        .filter(t => myRides < t.min_rides)
        .sort((a, b) => a.min_rides - b.min_rides)[0] ?? null;

    const progressPct = nextTier
        ? Math.min(100, (myRides / nextTier.min_rides) * 100)
        : 100;

    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const weekEnd = new Date();
    // Próximo domingo
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()) % 7 || 7);
    const daysLeft = Math.max(0, Math.ceil((weekEnd.getTime() - Date.now()) / 86400000));

    if (loading) {
        return (
            <div className="fixed inset-0 z-50 bg-[#0b141a] flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-16 h-16 rounded-full border-4 border-yellow-500/30 border-t-yellow-500 animate-spin" />
                    <p className="text-gray-400 text-sm">Carregando premiações...</p>
                </div>
            </div>
        );
    }

    if (!config?.is_enabled) {
        return (
            <div className="fixed inset-0 z-50 bg-[#0b141a] flex flex-col">
                <div className="flex items-center gap-3 p-4 border-b border-white/5">
                    <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center text-gray-400">
                        <span className="material-icons">arrow_back</span>
                    </button>
                    <h2 className="text-white font-bold text-lg">Premiações</h2>
                </div>
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                    <span className="text-6xl">🏆</span>
                    <p className="text-white font-bold text-xl">Sistema desativado</p>
                    <p className="text-gray-400 text-sm">As premiações estão temporariamente desativadas. Volte em breve!</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-[#0b141a] flex flex-col overflow-hidden">

            {/* ── HEADER ─────────────────────────────────────── */}
            <div className="relative shrink-0 overflow-hidden">
                {/* Gradiente de fundo */}
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-600/30 via-amber-800/20 to-[#0b141a]" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(245,158,11,0.2),transparent_70%)]" />

                {/* Conteúdo do header */}
                <div className="relative p-4 pb-6">
                    <div className="flex items-center gap-3 mb-5">
                        <button
                            onClick={onClose}
                            className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-gray-300 active:scale-95 transition"
                        >
                            <span className="material-icons">arrow_back</span>
                        </button>
                        <div className="flex-1">
                            <h2 className="text-white font-black text-xl leading-none">
                                {config?.week_title || 'Premiação Semanal'}
                            </h2>
                            <p className="text-yellow-400/80 text-xs mt-0.5">{config?.subtitle}</p>
                        </div>
                        <div className="bg-white/10 rounded-xl px-3 py-1.5 text-center">
                            <p className="text-yellow-400 font-black text-lg leading-none">{daysLeft}</p>
                            <p className="text-gray-400 text-[9px] uppercase tracking-wider">dias rest.</p>
                        </div>
                    </div>

                    {/* Card do meu progresso */}
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
                        <div className="flex items-center justify-between mb-3">
                            <div>
                                <p className="text-gray-400 text-[10px] uppercase tracking-widest font-bold">Suas corridas esta semana</p>
                                <div className="flex items-end gap-2 mt-1">
                                    <span className="text-4xl font-black text-white leading-none">{myRides}</span>
                                    {nextTier && (
                                        <span className="text-gray-500 text-sm mb-1">/ {nextTier.min_rides} p/ {nextTier.badge_emoji}</span>
                                    )}
                                </div>
                            </div>
                            <div className="text-right">
                                {myRank ? (
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl">{myRank <= 3 ? ['🥇','🥈','🥉'][myRank-1] : '🎖️'}</span>
                                        <p className="text-gray-400 text-[10px]">#{myRank} no ranking</p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center">
                                        <span className="text-2xl">🎯</span>
                                        <p className="text-gray-400 text-[10px]">Complete corridas!</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Barra de progresso */}
                        <div className="h-2.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full rounded-full transition-all duration-700"
                                style={{
                                    width: `${progressPct}%`,
                                    background: progressPct >= 100
                                        ? 'linear-gradient(90deg, #10b981, #059669)'
                                        : 'linear-gradient(90deg, #f59e0b, #d97706)',
                                }}
                            />
                        </div>
                        {earnedTier ? (
                            <p className="text-green-400 text-[11px] mt-2 flex items-center gap-1 font-bold">
                                <span className="material-icons text-sm">check_circle</span>
                                Você ganhou: {earnedTier.badge_emoji} R$ {earnedTier.prize_value.toFixed(2).replace('.', ',')}
                                {nextTier && ' · Continue para ganhar mais!'}
                            </p>
                        ) : nextTier ? (
                            <p className="text-gray-400 text-[11px] mt-2">
                                Faltam <span className="text-yellow-400 font-bold">{nextTier.min_rides - myRides}</span> corridas para ganhar R$ {nextTier.prize_value.toFixed(2).replace('.', ',')}
                            </p>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* ── SCROLL AREA ─────────────────────────────────── */}
            <div className="flex-1 overflow-y-auto">

                {/* ── CARDS DE PRÊMIOS ─────────────────────────── */}
                <div className="px-4 pt-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-3">🏆 Prêmios da Semana</p>
                    <div className="flex gap-3 overflow-x-auto pb-3 no-scrollbar">
                        {tiers.map((tier) => {
                            const achieved = myRides >= tier.min_rides;
                            return (
                                <div
                                    key={tier.id}
                                    className="shrink-0 w-48 rounded-2xl overflow-hidden relative"
                                    style={{
                                        border: achieved
                                            ? `2px solid ${tier.card_color}`
                                            : '2px solid rgba(255,255,255,0.08)',
                                        boxShadow: achieved
                                            ? `0 0 24px ${tier.card_color}40`
                                            : undefined,
                                    }}
                                >
                                    {/* Imagem ou fundo gradiente */}
                                    {tier.image_url ? (
                                        <div className="relative h-28">
                                            <img
                                                src={tier.image_url}
                                                alt={tier.title}
                                                className="w-full h-full object-cover"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                                        </div>
                                    ) : (
                                        <div
                                            className="h-28 flex items-center justify-center text-5xl relative"
                                            style={{
                                                background: `linear-gradient(135deg, ${tier.card_color}30, ${tier.card_color}10)`,
                                            }}
                                        >
                                            <span className="drop-shadow-lg">{tier.badge_emoji}</span>
                                            {/* Glow */}
                                            <div
                                                className="absolute inset-0 opacity-20 rounded-t-2xl"
                                                style={{
                                                    background: `radial-gradient(circle at center, ${tier.card_color}, transparent 70%)`,
                                                }}
                                            />
                                        </div>
                                    )}

                                    {/* Conteúdo */}
                                    <div className="bg-[#131d26] p-3">
                                        <p
                                            className="text-xs font-black leading-tight"
                                            style={{ color: tier.card_color }}
                                        >
                                            {tier.badge_emoji} {tier.title}
                                        </p>
                                        <p className="text-gray-400 text-[10px] mt-0.5 leading-tight">{tier.description}</p>
                                        <div className="mt-2 flex items-center justify-between">
                                            <span className="text-white font-black text-lg">
                                                R$ {tier.prize_value.toFixed(2).replace('.', ',')}
                                            </span>
                                            {achieved ? (
                                                <span
                                                    className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase"
                                                    style={{ background: `${tier.card_color}30`, color: tier.card_color }}
                                                >
                                                    ✓ Atingido!
                                                </span>
                                            ) : (
                                                <span className="text-gray-600 text-[9px]">
                                                    {tier.min_rides} corridas
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Selo de conquista */}
                                    {achieved && (
                                        <div
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-xs shadow-lg"
                                            style={{ background: tier.card_color }}
                                        >
                                            <span className="material-icons text-white" style={{ fontSize: '14px' }}>check</span>
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {tiers.length === 0 && (
                            <p className="text-gray-500 text-sm py-4">Nenhum prêmio cadastrado ainda.</p>
                        )}
                    </div>
                </div>

                {/* ── RANKING TOP 10 ────────────────────────────── */}
                <div className="px-4 pt-5 pb-10">
                    <p className="text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-3">📊 Ranking Semanal — Top 10</p>

                    {/* Pódio top 3 */}
                    {ranking.length >= 3 && (
                        <div className="flex items-end justify-center gap-2 mb-5 px-2">
                            {/* 2º lugar */}
                            <PodiumCard entry={ranking[1]} position={2} isMe={ranking[1].driver_id === currentUser.id} />
                            {/* 1º lugar */}
                            <PodiumCard entry={ranking[0]} position={1} isMe={ranking[0].driver_id === currentUser.id} />
                            {/* 3º lugar */}
                            <PodiumCard entry={ranking[2]} position={3} isMe={ranking[2].driver_id === currentUser.id} />
                        </div>
                    )}

                    {/* Lista 4–10 */}
                    <div className="space-y-2">
                        {ranking.slice(3).map((entry, i) => {
                            const pos = i + 4;
                            const isMe = entry.driver_id === currentUser.id;
                            return (
                                <div
                                    key={entry.driver_id}
                                    className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isMe ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-white/4 border border-white/5'}`}
                                >
                                    <span className="text-gray-500 font-black w-5 text-center text-sm">#{pos}</span>
                                    <div
                                        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                                        style={{ background: isMe ? '#f59e0b' : '#1e2d3d' }}
                                    >
                                        {entry.avatar_url ? (
                                            <img src={entry.avatar_url} className="w-full h-full rounded-full object-cover" alt="" />
                                        ) : (
                                            entry.username?.[0]?.toUpperCase()
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-bold truncate ${isMe ? 'text-yellow-300' : 'text-white'}`}>
                                            {isMe ? '⭐ ' : ''}{entry.username}
                                            {isMe && <span className="text-yellow-500/60 text-[10px] font-normal ml-1">(você)</span>}
                                        </p>
                                        <p className="text-[10px] text-gray-500">{entry.vehicle_type === 'motorcycle' ? '🛵 Moto' : '🚗 Carro'}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`text-lg font-black ${isMe ? 'text-yellow-400' : 'text-white'}`}>{entry.weekly_rides}</p>
                                        <p className="text-[9px] text-gray-500">corridas</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {ranking.length === 0 && (
                        <div className="text-center py-10">
                            <span className="text-4xl mb-3 block">🏁</span>
                            <p className="text-white font-bold">Ranking vazio!</p>
                            <p className="text-gray-400 text-sm mt-1">Seja o primeiro a completar corridas esta semana.</p>
                        </div>
                    )}

                    {/* Se o motorista não está no top 10 */}
                    {myRank === null && myRides > 0 && (
                        <div className="mt-4 p-3 bg-white/5 border border-white/10 rounded-xl flex items-center gap-3">
                            <span className="text-xl">📍</span>
                            <div>
                                <p className="text-white text-sm font-bold">Você está fora do Top 10</p>
                                <p className="text-gray-400 text-xs">Você tem {myRides} corrida{myRides !== 1 ? 's' : ''} esta semana. Continue!</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Componente do pódio ───────────────────────────────────────────────────────
const PodiumCard: React.FC<{
    entry: DriverRankingEntry;
    position: number;
    isMe: boolean;
}> = ({ entry, position, isMe }) => {
    const medals: Record<number, { emoji: string; h: string; bg: string; glow: string }> = {
        1: { emoji: '🥇', h: 'h-24', bg: 'from-yellow-600/30 to-amber-700/20', glow: 'shadow-yellow-500/30' },
        2: { emoji: '🥈', h: 'h-16', bg: 'from-gray-500/20 to-gray-600/10', glow: 'shadow-gray-400/20' },
        3: { emoji: '🥉', h: 'h-12', bg: 'from-orange-700/20 to-amber-800/10', glow: 'shadow-orange-500/20' },
    };
    const m = medals[position];

    return (
        <div className={`flex-1 flex flex-col items-center gap-1 ${position === 1 ? 'order-2' : position === 2 ? 'order-1' : 'order-3'}`}>
            <span className="text-xl">{m.emoji}</span>
            <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-black text-white border-2 shadow-lg ${m.glow} ${isMe ? 'ring-2 ring-yellow-400 ring-offset-1 ring-offset-[#0b141a]' : ''}`}
                style={{
                    background: `linear-gradient(135deg, ${position === 1 ? '#92400e, #b45309' : position === 2 ? '#374151, #4b5563' : '#431407, #6b2b0e'})`,
                    borderColor: position === 1 ? '#f59e0b40' : position === 2 ? '#9ca3af40' : '#cd7c3a40',
                }}
            >
                {entry.avatar_url ? (
                    <img src={entry.avatar_url} className="w-full h-full rounded-2xl object-cover" alt="" />
                ) : (
                    entry.username?.[0]?.toUpperCase()
                )}
            </div>
            <p className="text-white text-[10px] font-bold text-center truncate w-16 leading-tight">
                {isMe ? '⭐ Você' : entry.username}
            </p>
            <div className={`w-full bg-gradient-to-b ${m.bg} border border-white/10 rounded-xl flex flex-col items-center justify-end ${m.h} pb-2 pt-2`}>
                <p className="text-white font-black text-xl leading-none">{entry.weekly_rides}</p>
                <p className="text-gray-500 text-[8px]">corridas</p>
            </div>
        </div>
    );
};

export default DriverRewardsScreen;
