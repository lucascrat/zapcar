/**
 * AnimatedNumber - Número com animação de contagem
 */

import React from 'react';
import { useCountUp } from '../../hooks/useCountUp';

interface AnimatedNumberProps {
    value: number;
    duration?: number;
    decimals?: number;
    prefix?: string;
    suffix?: string;
    className?: string;
    style?: React.CSSProperties;
    isCurrency?: boolean;
}

export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
    value,
    duration = 2000,
    decimals = 0,
    prefix = '',
    suffix = '',
    className = '',
    style,
    isCurrency = false,
}) => {
    const actualDecimals = isCurrency ? 2 : decimals;
    const { formattedValue } = useCountUp({ end: value, duration, decimals: actualDecimals, separator: '.' });

    if (isCurrency) {
        const formatted = `R$ ${formattedValue.replace('.', ',')}`;
        return <span className={className} style={style}>{formatted}</span>;
    }

    return <span className={className} style={style}>{prefix}{formattedValue}{suffix}</span>;
};

// Currency variant
export const AnimatedCurrency: React.FC<{ value: number; duration?: number; className?: string; style?: React.CSSProperties }> = ({
    value,
    duration = 2000,
    className = '',
    style,
}) => {
    const { formattedValue } = useCountUp({ end: value, duration, decimals: 2, separator: '.' });
    const formatted = `R$ ${formattedValue.replace('.', ',')}`;
    return <span className={className} style={style}>{formatted}</span>;
};
