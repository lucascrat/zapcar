/**
 * AppProviders - Wrapper que combina todos os contextos
 */

import React, { ReactNode } from 'react';
import { ThemeProvider } from './ThemeContext';
import { ToastProvider } from './ToastContext';

interface AppProvidersProps {
    children: ReactNode;
}

/**
 * Wrapper que inclui todos os provedores de contexto da aplicação
 * 
 * Ordem de providers (de fora para dentro):
 * 1. ThemeProvider - Tema claro/escuro
 * 2. ToastProvider - Sistema de notificações
 * 
 * Nota: AuthProvider e RideProvider são gerenciados pelo App.tsx
 * pois dependem de lógica existente que será migrada gradualmente
 */
export const AppProviders: React.FC<AppProvidersProps> = ({ children }) => {
    return (
        <ThemeProvider>
            <ToastProvider>
                {children}
            </ToastProvider>
        </ThemeProvider>
    );
};

export default AppProviders;
