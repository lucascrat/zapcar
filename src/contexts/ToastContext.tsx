/**
 * ToastContext - Sistema de Notificações Toast
 * 
 * Notificações visuais com suporte a diferentes tipos e auto-dismiss.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// Types
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    showToast: (type: ToastType, title: string, message?: string, duration?: number) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
    dismiss: (id: string) => void;
    dismissAll: () => void;
}

// Create Context
const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Generate unique ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// Default durations
const DEFAULT_DURATION = 4000;
const DURATIONS: Record<ToastType, number> = {
    success: 3000,
    error: 5000,
    warning: 4000,
    info: 4000,
};

// Provider Component
export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    // Show toast
    const showToast = useCallback((
        type: ToastType,
        title: string,
        message?: string,
        duration?: number
    ) => {
        const id = generateId();
        const toast: Toast = {
            id,
            type,
            title,
            message,
            duration: duration || DURATIONS[type] || DEFAULT_DURATION,
        };

        setToasts(prev => [...prev, toast]);

        // Auto dismiss
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, toast.duration);
    }, []);

    // Helper methods
    const success = useCallback((title: string, message?: string) => {
        showToast('success', title, message);
    }, [showToast]);

    const error = useCallback((title: string, message?: string) => {
        showToast('error', title, message);
    }, [showToast]);

    const warning = useCallback((title: string, message?: string) => {
        showToast('warning', title, message);
    }, [showToast]);

    const info = useCallback((title: string, message?: string) => {
        showToast('info', title, message);
    }, [showToast]);

    // Dismiss specific toast
    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Dismiss all
    const dismissAll = useCallback(() => {
        setToasts([]);
    }, []);

    const value: ToastContextType = {
        toasts,
        showToast,
        success,
        error,
        warning,
        info,
        dismiss,
        dismissAll,
    };

    return (
        <ToastContext.Provider value={value}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={dismiss} />
        </ToastContext.Provider>
    );
};

// Toast Container Component
const ToastContainer: React.FC<{ toasts: Toast[]; onDismiss: (id: string) => void }> = ({
    toasts,
    onDismiss,
}) => {
    if (toasts.length === 0) return null;

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return 'check_circle';
            case 'error': return 'error';
            case 'warning': return 'warning';
            case 'info': return 'info';
        }
    };

    const getColor = (type: ToastType) => {
        switch (type) {
            case 'success': return 'var(--color-success)';
            case 'error': return 'var(--color-error)';
            case 'warning': return 'var(--color-warning)';
            case 'info': return 'var(--color-info)';
        }
    };

    return (
        <div
            style={{
                position: 'fixed',
                top: 'var(--spacing-4)',
                right: 'var(--spacing-4)',
                left: 'var(--spacing-4)',
                zIndex: 'var(--z-toast)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 'var(--spacing-2)',
                pointerEvents: 'none',
            }}
        >
            {toasts.map((toast) => (
                <div
                    key={toast.id}
                    style={{
                        background: 'var(--color-surface)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--spacing-3) var(--spacing-4)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-3)',
                        boxShadow: 'var(--shadow-xl)',
                        borderLeft: `4px solid ${getColor(toast.type)}`,
                        maxWidth: '360px',
                        pointerEvents: 'auto',
                        animation: 'slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
                    }}
                    className="animate-slide-in-right"
                >
                    <span
                        className="material-icons"
                        style={{ color: getColor(toast.type), fontSize: '24px' }}
                    >
                        {getIcon(toast.type)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <p
                            style={{
                                color: 'var(--color-text-primary)',
                                fontWeight: 'var(--font-weight-semibold)',
                                fontSize: 'var(--font-size-base)',
                                margin: 0,
                            }}
                        >
                            {toast.title}
                        </p>
                        {toast.message && (
                            <p
                                style={{
                                    color: 'var(--color-text-secondary)',
                                    fontSize: 'var(--font-size-sm)',
                                    margin: '4px 0 0 0',
                                }}
                            >
                                {toast.message}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={() => onDismiss(toast.id)}
                        style={{
                            background: 'none',
                            border: 'none',
                            padding: 'var(--spacing-1)',
                            cursor: 'pointer',
                            color: 'var(--color-text-tertiary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <span className="material-icons" style={{ fontSize: '20px' }}>close</span>
                    </button>
                </div>
            ))}
        </div>
    );
};

// Hook
export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export default ToastContext;
