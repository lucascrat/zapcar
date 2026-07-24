import React, { useState, useEffect } from 'react';
import { BingoSettings, BingoRankingUser } from '../../../types';
import {
    fetchBingoSettings,
    updateBingoSettings,
    drawBingoNumber,
    drawSpecificBingoNumber,
    resetBingo,
    fetchBingoRanking,
    subscribeToBingo
} from '../../../services/supabaseClient';
import { Card, Button, Badge, Input, Avatar, AnimatedNumber } from '../../components/shared';

export const AdminBingoView: React.FC = () => {
    const [settings, setSettings] = useState<BingoSettings | null>(null);
    const [ranking, setRanking] = useState<BingoRankingUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [lastDrawn, setLastDrawn] = useState<number | null>(null);
    const [drawMode, setDrawMode] = useState<'random' | 'manual'>('random');
    const [manualNumber, setManualNumber] = useState('');

    useEffect(() => {
        loadData();
        const sub = subscribeToBingo(() => {
            loadData();
        });
        return () => {
            if (sub && typeof sub.unsubscribe === 'function') {
                sub.unsubscribe();
            }
        };
    }, []);

    const loadData = async () => {
        try {
            const [s, r] = await Promise.all([
                fetchBingoSettings(),
                fetchBingoRanking()
            ]);
            setSettings(s);
            setRanking(r);
            if (s && s.drawn_numbers.length > 0) {
                setLastDrawn(s.drawn_numbers[s.drawn_numbers.length - 1]);
            }
        } catch (error) {
            console.error("Erro ao carregar bingo:", error);
        }
        setLoading(false);
    };

    const handleSaveSettings = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            const success = await updateBingoSettings(settings);
            if (success) {
                // Notificação de sucesso poderia ser implementada aqui
            }
        } catch (error) {
            console.error("Erro ao salvar bingo:", error);
        }
        setIsSaving(false);
    };

    const handleDraw = async () => {
        if (drawMode === 'random') {
            const num = await drawBingoNumber();
            if (num) setLastDrawn(num);
            else alert("Todos os números já foram sorteados!");
        } else {
            const num = parseInt(manualNumber);
            if (isNaN(num) || num < 1 || num > 75) {
                alert("Digite um número entre 1 e 75");
                return;
            }
            if (settings?.drawn_numbers.includes(num)) {
                alert("Número já sorteado!");
                return;
            }
            const success = await drawSpecificBingoNumber(num);
            if (success) {
                setLastDrawn(num);
                setManualNumber('');
            }
        }
    };

    const handleReset = async () => {
        if (!window.confirm("Deseja realmente RESETAR o sorteio atual? Isso apagará todos os números sorteados.")) return;
        const success = await resetBingo();
        if (success) {
            setLastDrawn(null);
        }
    };

    if (loading || !settings) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <p className="text-gray-400 font-medium">Carregando módulo de Bingo...</p>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-surface-glass backdrop-blur-md p-6 rounded-2xl border border-white/5">
                <div>
                    <h2 className="text-3xl font-black text-white bg-gradient-to-r from-white to-gray-500 bg-clip-text text-fill-transparent tracking-tight">
                        PAINEL DO BINGO
                    </h2>
                    <p className="text-sm text-gray-400 mt-1 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        Gestão de sorteios e prêmios em tempo real
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Button variant="outline" size="md" onClick={handleReset} className="border-red-500/20 text-red-400 hover:bg-red-500/10">
                        <span className="material-icons text-sm">restart_alt</span>
                        Resetar Arena
                    </Button>
                    <Button variant="primary" size="md" onClick={handleSaveSettings} loading={isSaving} className="shadow-primary/20">
                        <span className="material-icons text-sm">save</span>
                        Salvar Ajustes
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left: Settings */}
                <div className="lg:col-span-4 space-y-6">
                    <Card variant="default" className="overflow-visible">
                        <div className="border-b border-white/5 pb-4 mb-4">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <span className="material-icons text-primary/80">settings</span>
                                Configuração
                            </h3>
                        </div>
                        <div className="space-y-5">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-1">Descrição do Prêmio</label>
                                <textarea
                                    className="w-full bg-bg-tertiary border border-white/5 rounded-xl p-3 text-sm text-white focus:border-primary/50 focus:ring-2 focus:ring-primary/20 outline-none transition-all min-h-[100px] resize-none"
                                    placeholder="Ex: 1 Ano de Assinatura Grátis + Kit ChegoJá"
                                    value={settings.prize_description}
                                    onChange={e => setSettings({ ...settings, prize_description: e.target.value })}
                                />
                            </div>

                            <Input
                                label="Imagem do Prêmio"
                                placeholder="https://..."
                                value={settings.prize_image}
                                onChange={e => setSettings({ ...settings, prize_image: e.target.value })}
                                icon="image"
                            />

                            <Input
                                label="Live Stream URL"
                                placeholder="Link do YouTube ou Instagram"
                                value={settings.youtube_link}
                                onChange={e => setSettings({ ...settings, youtube_link: e.target.value })}
                                icon="videocam"
                            />

                            <div className="pt-2">
                                <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 cursor-pointer hover:bg-white/10 transition-all group">
                                    <div className={`w-10 h-6 rounded-full relative transition-all duration-300 ${settings.is_active ? 'bg-primary' : 'bg-gray-700'}`}>
                                        <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${settings.is_active ? 'left-5' : 'left-1'}`}></div>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">Sorteio Visível</span>
                                        <span className="text-[10px] text-gray-400">Controla a exibição para motoristas</span>
                                    </div>
                                    <input
                                        type="checkbox"
                                        className="hidden"
                                        checked={settings.is_active}
                                        onChange={e => setSettings({ ...settings, is_active: e.target.checked })}
                                    />
                                </label>
                            </div>
                        </div>
                    </Card>

                    {/* Quick Stats */}
                    <Card variant="glass" className="bg-gradient-to-br from-primary/5 to-transparent">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Sorteados</p>
                                <p className="text-2xl font-black text-white mt-1">{settings.drawn_numbers.length}</p>
                            </div>
                            <div className="text-center p-4 bg-white/5 rounded-2xl border border-white/5">
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Restantes</p>
                                <p className="text-2xl font-black text-primary mt-1">{75 - settings.drawn_numbers.length}</p>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Middle: Drawing Control */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <Card variant="premium" className="flex-1 flex flex-col overflow-hidden relative border-primary/20">
                        {/* Background Decoration */}
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 blur-3xl rounded-full -mr-10 -mt-10"></div>
                        <div className="absolute bottom-0 left-0 w-32 h-32 bg-green-500/10 blur-3xl rounded-full -ml-10 -mb-10"></div>

                        <div className="relative z-10 flex flex-col items-center justify-center py-8 h-full">
                            <div className="text-center mb-8">
                                <Badge variant="primary" size="lg" className="px-6 py-1 tracking-widest shadow-lg shadow-primary/20">
                                    ARENA DE SORTEIO
                                </Badge>
                            </div>

                            <div className="relative mb-10 group">
                                <div className="absolute inset-0 bg-primary blur-3xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div className="w-44 h-44 rounded-full bg-surface border-4 border-primary/30 flex items-center justify-center shadow-2xl relative z-10 overflow-hidden">
                                    <div className="absolute inset-0 bg-gradient-to-tr from-primary/20 to-transparent"></div>
                                    <span className="text-7xl font-black text-white drop-shadow-lg relative z-10">
                                        {lastDrawn !== null ? <AnimatedNumber value={lastDrawn} duration={500} /> : '?'}
                                    </span>
                                </div>
                                <div className="absolute -bottom-4 left-1/2 -translate-x-1/2">
                                    <div className="px-4 py-1 bg-gray-900 border border-white/10 rounded-full text-[10px] font-black text-primary uppercase shadow-xl tracking-tighter">
                                        Última Chamada
                                    </div>
                                </div>
                            </div>

                            <div className="w-full max-w-[300px] space-y-6">
                                <div className="flex bg-gray-900/50 p-1.5 rounded-2xl border border-white/5 backdrop-blur-sm">
                                    <button
                                        className={`flex-1 py-3 text-[11px] font-black rounded-xl transition-all duration-300 ${drawMode === 'random' ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'text-gray-500 hover:text-white'}`}
                                        onClick={() => setDrawMode('random')}
                                    >
                                        MODO AUTOMÁTICO
                                    </button>
                                    <button
                                        className={`flex-1 py-3 text-[11px] font-black rounded-xl transition-all duration-300 ${drawMode === 'manual' ? 'bg-primary text-white shadow-lg shadow-primary/40' : 'text-gray-500 hover:text-white'}`}
                                        onClick={() => setDrawMode('manual')}
                                    >
                                        INSERIR MANUAL
                                    </button>
                                </div>

                                <div className="animate-fade-in">
                                    {drawMode === 'manual' ? (
                                        <div className="space-y-4">
                                            <Input
                                                type="number"
                                                placeholder="Digite o número (1-75)"
                                                value={manualNumber}
                                                onChange={e => setManualNumber(e.target.value)}
                                                className="text-center text-xl font-bold"
                                            />
                                            <Button
                                                variant="success"
                                                className="w-full py-4 text-sm font-black tracking-widest uppercase hover:scale-[1.02] active:scale-95"
                                                onClick={handleDraw}
                                            >
                                                Registrar Agora
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="primary"
                                            className="w-full py-6 text-lg font-black tracking-widest uppercase shadow-2xl hover:scale-[1.02] active:scale-95 group overflow-hidden"
                                            onClick={handleDraw}
                                        >
                                            <div className="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                                            <span className="relative z-10 flex items-center justify-center gap-3">
                                                <span className="material-icons text-2xl">casino</span>
                                                SORTEAR BOLA
                                            </span>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* Right: Ranking */}
                <Card variant="default" className="lg:col-span-4 flex flex-col p-0 overflow-hidden">
                    <div className="p-5 border-b border-white/5 flex justify-between items-center bg-white/2">
                        <div className="flex items-center gap-2">
                            <span className="material-icons text-yellow-500">leaderboard</span>
                            <h3 className="text-lg font-bold text-white">Ranking Pro</h3>
                        </div>
                        <Badge variant="premium" size="sm">{ranking.length} Jogando</Badge>
                    </div>
                    <div className="flex-1 overflow-y-auto no-scrollbar max-h-[500px]">
                        {ranking.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center p-10 opacity-30 grayscale gap-4">
                                <span className="material-icons text-6xl">groups_3</span>
                                <p className="text-sm font-medium">Aguardando participantes...</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-white/[0.03]">
                                {ranking.map((user, idx) => (
                                    <div key={user.user_id} className="p-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors group">
                                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black border ${idx < 3 ? 'border-yellow-500/50 bg-yellow-500/10 text-yellow-500' : 'border-white/10 bg-white/5 text-gray-500'}`}>
                                            {idx + 1}
                                        </div>
                                        <Avatar
                                            src={user.avatar_url}
                                            name={user.username}
                                            size="md"
                                            className="ring-2 ring-white/5 group-hover:ring-primary/30 transition-all"
                                        />
                                        <div className="flex-grow min-width-0">
                                            <div className="text-sm font-bold text-white truncate max-w-[120px]">{user.username}</div>
                                            <div className="flex items-center gap-3 mt-1">
                                                <div className="px-2 py-0.5 rounded-md bg-green-500/10 text-[9px] text-green-500 font-black uppercase tracking-tighter">
                                                    {user.hits} ACERTOS
                                                </div>
                                                <div className="text-[9px] text-gray-500 font-bold uppercase tracking-tighter">
                                                    Restam {user.missing}
                                                </div>
                                            </div>
                                        </div>
                                        {user.missing <= 3 && user.missing > 0 && (
                                            <div className="flex gap-1">
                                                {[...Array(user.missing)].map((_, i) => (
                                                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
                                                ))}
                                            </div>
                                        )}
                                        {user.missing === 0 && (
                                            <Badge variant="success" className="animate-bounce font-black text-[10px]">BINGO!</Badge>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="p-4 bg-white/2 border-top border-white/5 text-[10px] text-center text-gray-500 font-medium">
                        Atualizado em tempo real via Supabase Sync
                    </div>
                </Card>
            </div>

            {/* Drawn History */}
            <Card variant="glass" className="border-white/5 bg-surface/50">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <span className="material-icons text-gray-400">history</span>
                        Histórico de Chamadas
                        <span className="text-xs font-normal text-gray-500 ml-2">({settings.drawn_numbers.length} números)</span>
                    </h3>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-15 gap-2 md:gap-3">
                    {settings.drawn_numbers.length === 0 ? (
                        <div className="col-span-full py-10 flex flex-col items-center justify-center gap-3 opacity-20">
                            <span className="material-icons text-5xl">grid_off</span>
                            <p className="italic text-sm">Nenhum número foi sorteado nesta arena.</p>
                        </div>
                    ) : (
                        settings.drawn_numbers.slice().reverse().map((num, i) => (
                            <div
                                key={num}
                                className={`aspect-square rounded-xl flex items-center justify-center text-sm font-black transition-all duration-300 cursor-default
                                    ${i === 0
                                        ? 'bg-primary text-white scale-110 shadow-lg shadow-primary/30 ring-2 ring-white/20'
                                        : 'bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white'
                                    }`}
                            >
                                {num}
                            </div>
                        ))
                    )}
                </div>
            </Card>
        </div>
    );
};

export default AdminBingoView;
