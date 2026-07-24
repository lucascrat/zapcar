/**
 * Card - Componente de card moderno
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from 'react';

// Types
type CardVariant = 'default' | 'glass' | 'premium' | 'outlined';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    children: ReactNode;
    variant?: CardVariant;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    interactive?: boolean;
    glow?: boolean;
    header?: ReactNode;
    footer?: ReactNode;
}

// Padding values
const paddingValues = {
    none: '0',
    sm: '12px',
    md: '16px',
    lg: '24px',
};

// Component
export const Card = forwardRef<HTMLDivElement, CardProps>(({
    children,
    variant = 'default',
    padding = 'md',
    interactive = false,
    glow = false,
    header,
    footer,
    style,
    className = '',
    ...props
}, ref) => {
    const baseStyles: React.CSSProperties = {
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        overflow: 'hidden',
    };

    const variantStyles: Record<CardVariant, React.CSSProperties> = {
        default: {},
        glass: {
            background: 'rgba(32, 44, 51, 0.85)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
        },
        premium: {
            background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 10px 15px rgba(0, 0, 0, 0.5)',
        },
        outlined: {
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.1)',
        },
    };

    const interactiveStyles: React.CSSProperties = interactive ? {
        cursor: 'pointer',
    } : {};

    const glowStyles: React.CSSProperties = glow ? {
        boxShadow: '0 0 15px rgba(0, 168, 132, 0.4)',
    } : {};

    const combinedStyles: React.CSSProperties = {
        ...baseStyles,
        ...variantStyles[variant],
        ...interactiveStyles,
        ...glowStyles,
        ...style,
    };

    const contentStyle: React.CSSProperties = {
        padding: paddingValues[padding],
    };

    const headerStyle: React.CSSProperties = {
        padding: '16px 16px 0',
        borderBottom: header ? '1px solid rgba(255, 255, 255, 0.05)' : 'none',
        paddingBottom: header ? '16px' : '0',
    };

    const footerStyle: React.CSSProperties = {
        padding: '0 16px 16px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        paddingTop: '16px',
    };

    return (
        <div
            ref={ref}
            style={combinedStyles}
            className={`${className} ${interactive ? 'card-hover' : ''}`}
            {...props}
        >
            {header && <div style={headerStyle}>{header}</div>}
            <div style={contentStyle}>{children}</div>
            {footer && <div style={footerStyle}>{footer}</div>}
        </div>
    );
});

Card.displayName = 'Card';

// Card Subcomponents
export const CardTitle: React.FC<{ children: ReactNode; className?: string }> = ({
    children,
    className = ''
}) => (
    <h3
        style={{
            color: 'var(--color-text-primary, #ffffff)',
            fontSize: '18px',
            fontWeight: 600,
            margin: 0,
        }}
        className={className}
    >
        {children}
    </h3>
);

export const CardDescription: React.FC<{ children: ReactNode; className?: string }> = ({
    children,
    className = ''
}) => (
    <p
        style={{
            color: 'var(--color-text-secondary, #8696a0)',
            fontSize: '14px',
            margin: '4px 0 0 0',
        }}
        className={className}
    >
        {children}
    </p>
);
