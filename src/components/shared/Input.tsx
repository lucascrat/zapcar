/**
 * Input - Componente de input moderno
 */

import React, { forwardRef, InputHTMLAttributes, ReactNode, useState } from 'react';

// Types
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    hint?: string;
    icon?: ReactNode;
    iconPosition?: 'left' | 'right';
    variant?: 'default' | 'filled' | 'outlined';
    fullWidth?: boolean;
}

// Component
export const Input = forwardRef<HTMLInputElement, InputProps>(({
    label,
    error,
    hint,
    icon,
    iconPosition = 'left',
    variant = 'default',
    fullWidth = true,
    className = '',
    style,
    onFocus,
    onBlur,
    ...props
}, ref) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(true);
        onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        setIsFocused(false);
        onBlur?.(e);
    };

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        width: fullWidth ? '100%' : 'auto',
    };

    const labelStyle: React.CSSProperties = {
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: '12px',
        fontWeight: 500,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
    };

    const inputWrapperStyle: React.CSSProperties = {
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '12px 16px',
        paddingLeft: icon && iconPosition === 'left' ? '44px' : '16px',
        paddingRight: icon && iconPosition === 'right' ? '44px' : '16px',
        background: 'var(--color-bg-tertiary, #2a3942)',
        border: '1px solid',
        borderColor: error
            ? 'var(--color-error, #ef4444)'
            : isFocused
                ? 'var(--color-primary, #00a884)'
                : 'rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        color: 'var(--color-text-primary, #ffffff)',
        fontSize: '14px',
        outline: 'none',
        transition: 'all 150ms cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: isFocused
            ? error
                ? '0 0 0 3px rgba(239, 68, 68, 0.3)'
                : '0 0 0 3px rgba(0, 168, 132, 0.3)'
            : 'none',
        ...style,
    };

    const iconStyle: React.CSSProperties = {
        position: 'absolute',
        [iconPosition]: '12px',
        color: isFocused ? 'var(--color-primary, #00a884)' : 'var(--color-text-tertiary, #667781)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'color 150ms ease',
        pointerEvents: 'none',
    };

    const hintStyle: React.CSSProperties = {
        color: error
            ? 'var(--color-error, #ef4444)'
            : 'var(--color-text-tertiary, #667781)',
        fontSize: '12px',
        marginTop: '-2px',
    };

    return (
        <div style={containerStyle} className={className}>
            {label && <label style={labelStyle}>{label}</label>}
            <div style={inputWrapperStyle}>
                {icon && (
                    <span style={iconStyle} className={typeof icon === 'string' ? 'material-icons' : ''}>
                        {icon}
                    </span>
                )}
                <input
                    ref={ref}
                    style={inputStyle}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    {...props}
                />
            </div>
            {(error || hint) && <span style={hintStyle}>{error || hint}</span>}
        </div>
    );
});

Input.displayName = 'Input';

// Search Input Variant
export const SearchInput = forwardRef<HTMLInputElement, Omit<InputProps, 'icon' | 'iconPosition'>>(
    (props, ref) => (
        <Input
            ref={ref}
            icon={<span className="material-icons" style={{ fontSize: '20px' }}>search</span>}
            iconPosition="left"
            placeholder="Buscar..."
            {...props}
        />
    )
);

SearchInput.displayName = 'SearchInput';
