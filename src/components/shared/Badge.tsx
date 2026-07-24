/**
 * Badge - Componente de badge/tag moderno
 */

import React, { ReactNode } from 'react';

// Types
type BadgeVariant = 'success' | 'error' | 'danger' | 'warning' | 'info' | 'default' | 'secondary' | 'primary' | 'premium';
type BadgeSize = 'sm' | 'md' | 'lg';

interface BadgeProps {
    children: ReactNode;
    variant?: BadgeVariant;
    size?: BadgeSize;
    icon?: ReactNode;
    dot?: boolean;
    pill?: boolean;
    className?: string;
    style?: React.CSSProperties;
}

// Variant styles
const variantStyles: Record<BadgeVariant, { bg: string; color: string }> = {
    success: { bg: 'rgba(0, 168, 132, 0.2)', color: '#25d366' },
    error: { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' },
    danger: { bg: 'rgba(239, 68, 68, 0.2)', color: '#f87171' }, // Alias for error
    warning: { bg: 'rgba(245, 158, 11, 0.2)', color: '#fbbf24' },
    info: { bg: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa' },
    default: { bg: 'rgba(255, 255, 255, 0.1)', color: '#8696a0' },
    secondary: { bg: 'rgba(255, 255, 255, 0.1)', color: '#8696a0' }, // Same as default
    primary: { bg: 'rgba(0, 168, 132, 0.2)', color: '#00a884' }, // Primary green theme
    premium: { bg: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: '#ffffff' },
};

// Size styles
const sizeStyles: Record<BadgeSize, { padding: string; fontSize: string }> = {
    sm: { padding: '2px 6px', fontSize: '10px' },
    md: { padding: '4px 10px', fontSize: '11px' },
    lg: { padding: '6px 14px', fontSize: '12px' },
};

// Component
export const Badge: React.FC<BadgeProps> = ({
    children,
    variant = 'default',
    size = 'md',
    icon,
    dot = false,
    pill = true,
    className = '',
    style,
}) => {
    const { bg, color } = variantStyles[variant];
    const { padding, fontSize } = sizeStyles[size];

    const badgeStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding,
        fontSize,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        borderRadius: pill ? '9999px' : '6px',
        background: bg,
        color,
        whiteSpace: 'nowrap',
        ...style,
    };

    const dotStyle: React.CSSProperties = {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
    };

    return (
        <span style={badgeStyle} className={className}>
            {dot && <span style={dotStyle} />}
            {icon && <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>}
            {children}
        </span>
    );
};

// Notification Badge (for counters)
interface NotificationBadgeProps {
    count: number;
    max?: number;
    children: ReactNode;
    className?: string;
}

export const NotificationBadge: React.FC<NotificationBadgeProps> = ({
    count,
    max = 99,
    children,
    className = '',
}) => {
    if (count <= 0) {
        return <>{children}</>;
    }

    const displayCount = count > max ? `${max}+` : count.toString();

    const containerStyle: React.CSSProperties = {
        position: 'relative',
        display: 'inline-flex',
    };

    const badgeStyle: React.CSSProperties = {
        position: 'absolute',
        top: '-4px',
        right: '-4px',
        minWidth: '18px',
        height: '18px',
        padding: '0 4px',
        background: '#ef4444',
        color: '#ffffff',
        fontSize: '10px',
        fontWeight: 700,
        borderRadius: '9999px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
        animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
    };

    return (
        <div style={containerStyle} className={className}>
            {children}
            <span style={badgeStyle}>{displayCount}</span>
        </div>
    );
};

// Status Badge
interface StatusBadgeProps {
    status: 'online' | 'offline' | 'busy' | 'away';
    label?: boolean;
    size?: BadgeSize;
    className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    status,
    label = false,
    size = 'md',
    className = '',
}) => {
    const statusConfig = {
        online: { color: '#00a884', text: 'Online' },
        offline: { color: '#667781', text: 'Offline' },
        busy: { color: '#ef4444', text: 'Ocupado' },
        away: { color: '#f59e0b', text: 'Ausente' },
    };

    const config = statusConfig[status];
    const dotSize = size === 'sm' ? 6 : size === 'md' ? 8 : 10;

    const containerStyle: React.CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
    };

    const dotStyle: React.CSSProperties = {
        width: dotSize,
        height: dotSize,
        borderRadius: '50%',
        background: config.color,
        flexShrink: 0,
    };

    const textStyle: React.CSSProperties = {
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: size === 'sm' ? '11px' : size === 'md' ? '12px' : '13px',
    };

    return (
        <span style={containerStyle} className={className}>
            <span style={dotStyle} />
            {label && <span style={textStyle}>{config.text}</span>}
        </span>
    );
};
