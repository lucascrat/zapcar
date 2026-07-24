/**
 * Button - Componente de botão moderno e reutilizável
 */

import React, { forwardRef, ButtonHTMLAttributes, ReactNode } from 'react';

// Types
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'outline';
type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    children: ReactNode;
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    fullWidth?: boolean;
    loading?: boolean;
    rounded?: boolean;
    title?: string;
    className?: string;
}

// Styles
const baseStyles: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    fontWeight: 600,
    borderRadius: '16px',
    border: 'none',
    cursor: 'pointer',
    transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
    outline: 'none',
    position: 'relative',
    overflow: 'hidden',
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
    primary: {
        background: 'linear-gradient(135deg, #00a884 0%, #25d366 100%)',
        color: '#ffffff',
        boxShadow: '0 0 15px rgba(0, 168, 132, 0.4)',
    },
    secondary: {
        background: 'var(--color-surface, #202c33)',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.1)',
    },
    ghost: {
        background: 'transparent',
        color: '#ffffff',
    },
    danger: {
        background: '#ef4444',
        color: '#ffffff',
    },
    success: {
        background: '#00a884',
        color: '#ffffff',
    },
    outline: {
        background: 'transparent',
        color: '#ffffff',
        border: '1px solid rgba(255, 255, 255, 0.2)',
    },
};

const sizeStyles: Record<ButtonSize, React.CSSProperties> = {
    xs: {
        padding: '4px 8px',
        fontSize: '10px',
        gap: '4px',
    },
    sm: {
        padding: '6px 12px',
        fontSize: '11px',
        gap: '6px',
    },
    md: {
        padding: '10px 18px',
        fontSize: '13px',
    },
    lg: {
        padding: '14px 28px',
        fontSize: '15px',
    },
    xl: {
        padding: '18px 36px',
        fontSize: '17px',
        borderRadius: '24px',
    },
};

// Component
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({
    children,
    variant = 'primary',
    size = 'md',
    icon,
    iconPosition = 'left',
    fullWidth = false,
    loading = false,
    rounded = false,
    disabled,
    style,
    className = '',
    ...props
}, ref) => {
    const isDisabled = disabled || loading;

    const combinedStyles: React.CSSProperties = {
        ...baseStyles,
        ...variantStyles[variant],
        ...sizeStyles[size],
        ...(fullWidth && { width: '100%' }),
        ...(rounded && { borderRadius: '9999px' }),
        ...(isDisabled && { opacity: 0.5, cursor: 'not-allowed' }),
        ...style,
    };

    return (
        <button
            ref={ref}
            style={combinedStyles}
            disabled={isDisabled}
            className={className}
            {...props}
        >
            {loading ? (
                <>
                    <span
                        className="material-icons animate-spin"
                        style={{ fontSize: 'inherit' }}
                    >
                        sync
                    </span>
                    Carregando...
                </>
            ) : (
                <>
                    {icon && iconPosition === 'left' && (
                        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
                    )}
                    {children}
                    {icon && iconPosition === 'right' && (
                        <span style={{ display: 'flex', alignItems: 'center' }}>{icon}</span>
                    )}
                </>
            )}
        </button>
    );
});

Button.displayName = 'Button';
