/**
 * LoadingSpinner - Componentes de loading
 */

import React from 'react';

type SpinnerSize = 'sm' | 'md' | 'lg' | 'xl';

interface LoadingSpinnerProps {
    size?: SpinnerSize;
    text?: string;
    fullScreen?: boolean;
    className?: string;
}

const sizeValues: Record<SpinnerSize, number> = {
    sm: 16, md: 24, lg: 40, xl: 64,
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
    size = 'md',
    text,
    fullScreen = false,
    className = '',
}) => {
    const pixelSize = sizeValues[size];

    const containerStyle: React.CSSProperties = fullScreen
        ? { position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111b21', zIndex: 9999 }
        : { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px' };

    const spinnerStyle: React.CSSProperties = {
        width: pixelSize,
        height: pixelSize,
        border: `${Math.max(2, pixelSize / 10)}px solid rgba(255, 255, 255, 0.1)`,
        borderTopColor: '#00a884',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
    };

    return (
        <div style={containerStyle} className={className}>
            <div style={spinnerStyle} />
            {text && <span style={{ color: '#8696a0', fontSize: '14px', marginTop: '8px' }}>{text}</span>}
        </div>
    );
};

export const LoadingOverlay: React.FC<{ isVisible: boolean; text?: string }> = ({ isVisible, text = 'Carregando...' }) => {
    if (!isVisible) return null;
    return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', background: 'rgba(17, 27, 33, 0.9)', zIndex: 100 }}>
            <LoadingSpinner size="lg" />
            {text && <span style={{ color: '#8696a0', fontSize: '14px' }}>{text}</span>}
        </div>
    );
};
