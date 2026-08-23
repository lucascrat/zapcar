import React, { useState, useEffect } from 'react';
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler,
    ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import { fetchRevenueStats, fetchDashboardMetrics } from '../../../services/supabaseClient';
import { Card } from '../shared';

// Registrar componentes do Chart.js
ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

interface DashboardMetrics {
    totalDrivers: number;
    totalClients: number;
    todayRides: number;
    todayEarnings: number;
}

export const AdminOverviewView: React.FC = () => {
    const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
    const [revenueData, setRevenueData] = useState<{ date: string, amount: number }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            try {
                const [m, rev] = await Promise.all([
                    fetchDashboardMetrics(),
                    fetchRevenueStats(7)
                ]);
                setMetrics(m);
                setRevenueData(rev);
            } catch (error) {
                console.error("Error loading dashboard data:", error);
            } finally {
                setIsLoading(false);
            }
        };

        loadData();
    }, []);

    const chartData = {
        labels: revenueData.map(d => {
            const date = new Date(d.date + 'T00:00:00');
            return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        }),
        datasets: [
            {
                label: 'Faturamento (R$)',
                data: revenueData.map(d => d.amount),
                fill: true,
                borderColor: '#00a884',
                backgroundColor: 'rgba(0, 168, 132, 0.1)',
                tension: 0.4,
                pointBackgroundColor: '#00a884',
                pointBorderColor: '#fff',
                pointHoverRadius: 6,
                pointRadius: 4,
            }
        ],
    };

    const chartOptions: ChartOptions<'line'> = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                display: false,
            },
            tooltip: {
                backgroundColor: '#1f2937',
                titleColor: '#9ca3af',
                bodyColor: '#fff',
                padding: 12,
                cornerRadius: 8,
                displayColors: false,
                callbacks: {
                    label: (context) => `R$ ${context.parsed.y.toFixed(2).replace('.', ',')}`
                }
            },
        },
        scales: {
            y: {
                beginAtZero: true,
                grid: {
                    color: 'rgba(255, 255, 255, 0.05)',
                },
                ticks: {
                    color: '#9ca3af',
                    callback: (value) => `R$ ${value}`
                }
            },
            x: {
                grid: {
                    display: false,
                },
                ticks: {
                    color: '#9ca3af',
                }
            }
        },
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green"></div>
            </div>
        );
    }

    return (
        <div className="admin-overview">
            <div className="admin-stats-grid mb-6">
                <div className="admin-stat-card" style={{ '--stat-color': 'rgba(59, 130, 246, 0.15)', '--stat-color-solid': '#3b82f6' } as any}>
                    <div className="admin-stat-icon">
                        <span className="material-icons">people</span>
                    </div>
                    <p className="admin-stat-label">Motoristas</p>
                    <p className="admin-stat-value">{metrics?.totalDrivers || 0}</p>
                </div>

                <div className="admin-stat-card" style={{ '--stat-color': 'rgba(16, 185, 129, 0.15)', '--stat-color-solid': '#10b981' } as any}>
                    <div className="admin-stat-icon">
                        <span className="material-icons">person</span>
                    </div>
                    <p className="admin-stat-label">Clientes</p>
                    <p className="admin-stat-value">{metrics?.totalClients || 0}</p>
                </div>

                <div className="admin-stat-card" style={{ '--stat-color': 'rgba(245, 158, 11, 0.15)', '--stat-color-solid': '#f59e0b' } as any}>
                    <div className="admin-stat-icon">
                        <span className="material-icons">route</span>
                    </div>
                    <p className="admin-stat-label">Concluídas Hoje</p>
                    <p className="admin-stat-value">{metrics?.todayRides || 0}</p>
                </div>

                <div className="admin-stat-card" style={{ '--stat-color': 'rgba(0, 168, 132, 0.15)', '--stat-color-solid': '#00a884' } as any}>
                    <div className="admin-stat-icon">
                        <span className="material-icons">attach_money</span>
                    </div>
                    <p className="admin-stat-label">Ganhos Hoje</p>
                    <p className="admin-stat-value">
                        <span className="prefix">R$</span>
                        {(metrics?.todayEarnings || 0).toFixed(2).replace('.', ',')}
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                    <Card title="Tendência de Faturamento (7 dias)">
                        <div style={{ height: '300px', width: '100%' }}>
                            <Line data={chartData} options={chartOptions} />
                        </div>
                    </Card>
                </div>

                <div>
                    <Card title="Acertações Rápidas">
                        <div className="flex flex-col gap-3">
                            <button className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5">
                                <span className="material-icons text-blue-400">add_task</span>
                                <div className="text-left">
                                    <p className="text-sm font-semibold">Novo Plano</p>
                                    <p className="text-xs text-gray-500">Criar plano de assinatura</p>
                                </div>
                            </button>
                            <button className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5">
                                <span className="material-icons text-green-400">campaign</span>
                                <div className="text-left">
                                    <p className="text-sm font-semibold">Notificar Tudo</p>
                                    <p className="text-xs text-gray-500">Enviar aviso para todos</p>
                                </div>
                            </button>
                            <button className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5">
                                <span className="material-icons text-purple-400">casino</span>
                                <div className="text-left">
                                    <p className="text-sm font-semibold">Novo Sorteio</p>
                                    <p className="text-xs text-gray-500">Configurar bingo rápido</p>
                                </div>
                            </button>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};
