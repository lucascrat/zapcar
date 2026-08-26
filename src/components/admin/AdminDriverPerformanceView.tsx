/**
 * AdminDriverPerformanceView - Relatório de desempenho dos motoristas
 * Corridas recebidas, saldo e tempo online, tudo num só lugar, pra saber quem
 * está realmente trabalhando e poder recompensar os melhores.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../../components/shared';
import { fetchDriverPerformanceReport, DriverPerformanceEntry, supabase } from '../../../services/supabaseClient';

// status='busy' também é usado pelo botão LIVRE/OCUPADO que o motorista aperta
// pra se pausar sem ficar offline (App.tsx handleStatusToggle) - sem checar se
// existe corrida ativa de verdade, motorista pausado aparece como "Em corrida"
// aqui também (mesmo problema corrigido no AdminDashboard.tsx).
const ACTIVE_RIDE_STATUSES = ['accepted', 'en_route', 'arrived', 'started', 'waiting_payment'];

type Period = 'today' | 'week' | 'month' | 'all';

const getPeriodStart = (period: Period): Date => {
    const now = new Date();
    if (period === 'today') {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    if (period === 'week') {
        // Segunda-feira desta semana (mesmo critério do sistema de premiação)
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const day = d.getDay(); // 0=domingo
        const diff = day === 0 ? 6 : day - 1;
        d.setDate(d.getDate() - diff);
        return d;
    }
    if (period === 'month') {
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return new Date('2000-01-01T00:00:00Z');
};

const formatOnlineTime = (seconds: number): string => {
    if (!seconds || seconds < 60) return `${Math.floor(seconds || 0)}s`;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h === 0) return `${m}min`;
    return `${h}h ${m}min`;
};

const formatMoney = (value: number): string =>
    value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const AdminDriverPerformanceView: React.FC = () => {
    const [period, setPeriod] = useState<Period>('week');
    const [entries, setEntries] = useState<DriverPerformanceEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [activeRideDriverIds, setActiveRideDriverIds] = useState<Set<string>>(new Set());

    const load = useCallback(async () => {
        setLoading(true);
        const [data, ridesRes] = await Promise.all([
            fetchDriverPerformanceReport(getPeriodStart(period)),
            supabase.from('rides').select('driver_id').in('status', ACTIVE_RIDE_STATUSES).not('driver_id', 'is', null),
        ]);
        setEntries(data);
        setActiveRideDriverIds(new Set((ridesRes.data || []).map((r: any) => r.driver_id)));
        setLoading(false);
    }, [period]);

    useEffect(() => { load(); }, [load]);

    const filtered = entries.filter(e =>
        !search.trim() || e.username?.toLowerCase().includes(search.toLowerCase())
    );

    const periodLabel: Record<Period, string> = {
        today: 'Hoje',
        week: 'Esta Semana',
        month: 'Este Mês',
        all: 'Desde o Início',
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <span className="material-icons">insights</span>
                        Desempenho dos Motoristas
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">
                        Corridas recebidas, saldo e tempo online - identifique quem está realmente trabalhando.
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        className="admin-form-input"
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as Period)}
                    >
                        <option value="today">Hoje</option>
                        <option value="week">Esta Semana</option>
                        <option value="month">Este Mês</option>
                        <option value="all">Desde o Início</option>
                    </select>
                    <button
                        onClick={load}
                        className="w-10 h-10 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-gray-300 transition"
                        title="Atualizar"
                    >
                        <span className="material-icons text-lg">refresh</span>
                    </button>
                </div>
            </div>

            <div className="relative max-w-sm">
                <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg">search</span>
                <input
                    type="text"
                    placeholder="Buscar motorista..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-black/20 text-white text-sm rounded-full pl-10 pr-4 py-2.5 border border-white/5 outline-none focus:border-white/20 transition"
                />
            </div>

            <Card>
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="admin-loading">Carregando relatório...</div>
                    ) : filtered.length === 0 ? (
                        <div className="admin-empty-state">
                            <span className="material-icons">person_off</span>
                            <p className="admin-empty-state-title">Nenhum motorista encontrado</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-gray-400 text-xs uppercase tracking-wide border-b border-white/10">
                                    <th className="py-3 px-4 font-semibold">#</th>
                                    <th className="py-3 px-4 font-semibold">Motorista</th>
                                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                                    <th className="py-3 px-4 font-semibold text-right">Corridas ({periodLabel[period]})</th>
                                    <th className="py-3 px-4 font-semibold text-right">Tempo Online</th>
                                    <th className="py-3 px-4 font-semibold text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((entry, idx) => (
                                    <tr key={entry.driver_id} className="border-b border-white/5 hover:bg-white/5 transition">
                                        <td className="py-3 px-4 text-gray-500 font-bold">
                                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={entry.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(entry.username || 'M')}
                                                    className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                                                    alt=""
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-white font-semibold truncate">{entry.username || 'Sem nome'}</p>
                                                    <p className="text-[11px] text-gray-500 uppercase tracking-wide">
                                                        {entry.vehicle_type === 'motorcycle' ? 'Moto' : 'Carro'}
                                                        {!entry.is_approved && ' • Não aprovado'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${
                                                entry.status === 'available' ? 'bg-green-500/15 text-green-400' :
                                                entry.status === 'busy' ? 'bg-yellow-500/15 text-yellow-400' :
                                                'bg-gray-500/15 text-gray-400'
                                            }`}>
                                                {entry.status === 'available' ? 'Online' :
                                                    entry.status === 'busy' ? (activeRideDriverIds.has(entry.driver_id) ? 'Em corrida' : 'Pausado') :
                                                        'Offline'}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="text-white font-bold">{entry.rides_count}</span>
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-300">
                                            {formatOnlineTime(entry.online_seconds)}
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <span className="text-green-400 font-semibold">{formatMoney(entry.financial_balance)}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>

            <Card variant="glass">
                <div className="admin-card-body">
                    <h4 className="font-semibold text-white mb-2 flex items-center gap-2">
                        <span className="material-icons text-yellow-400" style={{ fontSize: '20px' }}>info</span>
                        Como ler esse relatório
                    </h4>
                    <ul className="space-y-1.5 text-sm text-gray-300">
                        <li>• <strong>Corridas:</strong> só conta corrida pedida por cliente no app ou disparada pelo admin - lançamento manual do motorista (taxímetro) não entra, pra não inflar o número.</li>
                        <li>• <strong>Tempo Online:</strong> soma o tempo que o motorista ficou "Disponível" ou "Em corrida" no período selecionado.</li>
                        <li>• <strong>Saldo:</strong> saldo financeiro atual da carteira do motorista.</li>
                    </ul>
                </div>
            </Card>
        </div>
    );
};

export default AdminDriverPerformanceView;
