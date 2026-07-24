/**
 * useCountUp - Hook para animação de contagem
 */

import { useState, useEffect, useRef } from 'react';

interface UseCountUpOptions {
    start?: number;
    end: number;
    duration?: number;
    delay?: number;
    decimals?: number;
    easing?: 'linear' | 'easeOut' | 'easeInOut';
    separator?: string;
    onComplete?: () => void;
}

// Easing functions
const easings = {
    linear: (t: number) => t,
    easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

/**
 * Animate a number counting up or down
 */
export function useCountUp({
    start = 0,
    end,
    duration = 2000,
    delay = 0,
    decimals = 0,
    easing = 'easeOut',
    separator = '',
    onComplete,
}: UseCountUpOptions) {
    const [count, setCount] = useState(start);
    const [isComplete, setIsComplete] = useState(false);
    const frameRef = useRef<number | undefined>(undefined);
    const startTimeRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;

        const animate = (timestamp: number) => {
            if (!startTimeRef.current) {
                startTimeRef.current = timestamp;
            }

            const elapsed = timestamp - startTimeRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const easedProgress = easings[easing](progress);

            const currentValue = start + (end - start) * easedProgress;
            setCount(currentValue);

            if (progress < 1) {
                frameRef.current = requestAnimationFrame(animate);
            } else {
                setIsComplete(true);
                onComplete?.();
            }
        };

        // Start after delay
        timeoutId = setTimeout(() => {
            frameRef.current = requestAnimationFrame(animate);
        }, delay);

        return () => {
            clearTimeout(timeoutId);
            if (frameRef.current) {
                cancelAnimationFrame(frameRef.current);
            }
        };
    }, [start, end, duration, delay, easing, onComplete]);

    // Reset when end value changes
    useEffect(() => {
        startTimeRef.current = undefined;
        setIsComplete(false);
    }, [end]);

    // Format the number
    const formattedValue = (() => {
        const value = count.toFixed(decimals);
        if (separator) {
            const parts = value.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, separator);
            return parts.join('.');
        }
        return value;
    })();

    return {
        value: count,
        formattedValue,
        isComplete,
    };
}

/**
 * Format currency with animation
 */
export function useCountUpCurrency(
    amount: number,
    options: Partial<Omit<UseCountUpOptions, 'end'>> = {}
) {
    const { formattedValue, isComplete } = useCountUp({
        end: amount,
        decimals: 2,
        separator: '.',
        ...options,
    });

    const formatted = new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
    }).format(parseFloat(formattedValue.replace('.', '')));

    return { formatted, isComplete };
}
