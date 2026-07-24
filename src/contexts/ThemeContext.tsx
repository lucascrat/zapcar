/**
 * ThemeContext - Gerenciamento de Tema
 * 
 * Suporte a tema claro/escuro com persistência.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

// Types
type Theme = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: Theme;
    resolvedTheme: 'light' | 'dark';
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

// Storage Key
const STORAGE_KEY = 'chegoja_theme';

// Create Context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider Component
export const ThemeProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [theme, setThemeState] = useState<Theme>('dark');
    const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('dark');

    // Get system preference
    const getSystemTheme = useCallback((): 'light' | 'dark' => {
        if (typeof window !== 'undefined' && window.matchMedia) {
            return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        }
        return 'dark';
    }, []);

    // Resolve theme
    const resolveTheme = useCallback((themeValue: Theme): 'light' | 'dark' => {
        if (themeValue === 'system') {
            return getSystemTheme();
        }
        return themeValue;
    }, [getSystemTheme]);

    // Apply theme to document
    const applyTheme = useCallback((resolved: 'light' | 'dark') => {
        const root = document.documentElement;
        root.setAttribute('data-theme', resolved);

        // Update meta theme-color
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            metaThemeColor.setAttribute('content', resolved === 'dark' ? '#111b21' : '#f0f2f5');
        }
    }, []);

    // Initialize theme from storage
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
            const initialTheme = stored || 'dark';
            const resolved = resolveTheme(initialTheme);

            setThemeState(initialTheme);
            setResolvedTheme(resolved);
            applyTheme(resolved);
        } catch (e) {
            console.error('[ThemeContext] Error loading theme:', e);
        }
    }, [resolveTheme, applyTheme]);

    // Listen for system theme changes
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = () => {
            const resolved = getSystemTheme();
            setResolvedTheme(resolved);
            applyTheme(resolved);
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme, getSystemTheme, applyTheme]);

    // Set theme
    const setTheme = useCallback((newTheme: Theme) => {
        const resolved = resolveTheme(newTheme);

        setThemeState(newTheme);
        setResolvedTheme(resolved);
        applyTheme(resolved);

        try {
            localStorage.setItem(STORAGE_KEY, newTheme);
        } catch (e) {
            console.error('[ThemeContext] Error saving theme:', e);
        }
    }, [resolveTheme, applyTheme]);

    // Toggle theme
    const toggleTheme = useCallback(() => {
        const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
    }, [resolvedTheme, setTheme]);

    const value: ThemeContextType = {
        theme,
        resolvedTheme,
        setTheme,
        toggleTheme,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};

// Hook
export const useTheme = (): ThemeContextType => {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};

export default ThemeContext;
