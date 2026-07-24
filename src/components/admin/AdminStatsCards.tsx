/**
 * AdminStatsCards - Cards de estatísticas do dashboard
 */

import React from 'react';

interface StatCard {
    id: string;
    title: string;
    value: number | string;
    icon: string;
    color: string;
    change?: number;
    prefix?: string;
    suffix?: string;
}

interface AdminStatsCardsProps {
    stats: StatCard[];
    isLoading?: boolean;
}

export const AdminStatsCards: React.FC<AdminStatsCardsProps> = ({
    stats,
    isLoading = false,
}) => {
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px',
    };

    const cardStyle = (color: string): React.CSSProperties => ({
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        position: 'relative',
        overflow: 'hidden',
    });

    const iconContainerStyle = (color: string): React.CSSProperties => ({
        width: '48px',
        height: '48px',
        borderRadius: '12px',
        background: `${color}20`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '16px',
    });

    const titleStyle: React.CSSProperties = {
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: '12px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
    };

    const valueStyle: React.CSSProperties = {
        color: '#ffffff',
        fontSize: '28px',
        fontWeight: 700,
        margin: '8px 0 0 0',
        display: 'flex',
        alignItems: 'baseline',
        gap: '4px',
    };

    const prefixStyle: React.CSSProperties = {
        fontSize: '16px',
        fontWeight: 500,
        color: 'var(--color-text-secondary)',
    };

    const changeStyle = (isPositive: boolean): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        marginTop: '8px',
        fontSize: '12px',
        color: isPositive ? '#00a884' : '#ef4444',
    });

    const glowStyle = (color: string): React.CSSProperties => ({
        position: 'absolute',
        top: '-50%',
        right: '-50%',
        width: '100%',
        height: '100%',
        background: `radial-gradient(circle, ${color}10 0%, transparent 70%)`,
        pointerEvents: 'none',
    });

    if (isLoading) {
        return (
            <div style={gridStyle}>
                {[1, 2, 3, 4].map(i => (
                    <div key={i} style={cardStyle('#666')}>
                        <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: 'var(--color-bg-tertiary)', marginBottom: '16px' }} />
                        <div style={{ height: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', width: '50%' }} />
                        <div style={{ height: '28px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', width: '70%', marginTop: '8px' }} />
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div style={gridStyle}>
            {stats.map((stat) => (
                <div key={stat.id} style={cardStyle(stat.color)}>
                    <div style={glowStyle(stat.color)} />
                    <div style={iconContainerStyle(stat.color)}>
                        <span className="material-icons" style={{ color: stat.color, fontSize: '24px' }}>
                            {stat.icon}
                        </span>
                    </div>
                    <p style={titleStyle}>{stat.title}</p>
                    <p style={valueStyle}>
                        {stat.prefix && <span style={prefixStyle}>{stat.prefix}</span>}
                        {stat.value}
                        {stat.suffix && <span style={prefixStyle}>{stat.suffix}</span>}
                    </p>
                    {stat.change !== undefined && (
                        <div style={changeStyle(stat.change >= 0)}>
                            <span className="material-icons" style={{ fontSize: '14px' }}>
                                {stat.change >= 0 ? 'trending_up' : 'trending_down'}
                            </span>
                            {Math.abs(stat.change)}% vs. ontem
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

// Helper para criar stats comuns
export const createDriverStats = (data: {
    totalDrivers: number;
    onlineDrivers: number;
    pendingApprovals: number;
    todayEarnings: number;
}): StatCard[] => [
        {
            id: 'total',
            title: 'Total de Motoristas',
            value: data.totalDrivers,
            icon: 'people',
            color: '#3b82f6',
        },
        {
            id: 'online',
            title: 'Online Agora',
            value: data.onlineDrivers,
            icon: 'wifi',
            color: '#00a884',
        },
        {
            id: 'pending',
            title: 'Aguardando Aprovação',
            value: data.pendingApprovals,
            icon: 'hourglass_top',
            color: '#f59e0b',
        },
        {
            id: 'earnings',
            title: 'Ganhos Hoje',
            value: data.todayEarnings.toFixed(2).replace('.', ','),
            icon: 'attach_money',
            color: '#10b981',
            prefix: 'R$',
        },
    ];
