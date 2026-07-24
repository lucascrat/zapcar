/**
 * useMediaQuery - Hook para media queries responsivas
 */

import { useState, useEffect } from 'react';

// Predefined breakpoints
export const breakpoints = {
    sm: '640px',
    md: '768px',
    lg: '1024px',
    xl: '1280px',
    '2xl': '1536px',
};

/**
 * Hook to detect if a media query matches
 * @param query - Media query string (e.g., '(min-width: 768px)')
 * @returns Boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => {
        if (typeof window !== 'undefined') {
            return window.matchMedia(query).matches;
        }
        return false;
    });

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const mediaQuery = window.matchMedia(query);
        setMatches(mediaQuery.matches);

        const handler = (event: MediaQueryListEvent) => {
            setMatches(event.matches);
        };

        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, [query]);

    return matches;
}

/**
 * Hook to get current breakpoint
 */
export function useBreakpoint() {
    const isSm = useMediaQuery(`(min-width: ${breakpoints.sm})`);
    const isMd = useMediaQuery(`(min-width: ${breakpoints.md})`);
    const isLg = useMediaQuery(`(min-width: ${breakpoints.lg})`);
    const isXl = useMediaQuery(`(min-width: ${breakpoints.xl})`);
    const is2Xl = useMediaQuery(`(min-width: ${breakpoints['2xl']})`);

    const current = is2Xl ? '2xl' : isXl ? 'xl' : isLg ? 'lg' : isMd ? 'md' : isSm ? 'sm' : 'xs';

    return {
        current,
        isXs: !isSm,
        isSm,
        isMd,
        isLg,
        isXl,
        is2Xl,
        isMobile: !isMd, // < 768px
        isTablet: isMd && !isLg, // 768px - 1023px
        isDesktop: isLg, // >= 1024px
    };
}

/**
 * Hook to detect if user prefers reduced motion
 */
export function usePrefersReducedMotion(): boolean {
    return useMediaQuery('(prefers-reduced-motion: reduce)');
}

/**
 * Hook to detect if user prefers dark mode
 */
export function usePrefersDarkMode(): boolean {
    return useMediaQuery('(prefers-color-scheme: dark)');
}

/**
 * Hook to detect if device supports touch
 */
export function useIsTouchDevice(): boolean {
    return useMediaQuery('(hover: none) and (pointer: coarse)');
}
