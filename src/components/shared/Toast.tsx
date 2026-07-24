/**
 * Toast - Notificações inline substituindo alert() nativo
 */
import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
    id: number;
    message: string;
    type: ToastType;
    exiting?: boolean;
}

interface ToastContextType {
    toast: (message: string, type?: ToastType) => void;
    success: (message: string) => void;
    error: (message: string) => void;
    warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let globalId = 0;

const ICONS: Record<ToastType, string> = {
    success: 'check_circle',
    error: 'error',
    warning: 'warning',
    info: 'info',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300);
    }, []);

    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = ++globalId;
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => removeToast(id), 4000);
    }, [removeToast]);

    const ctx: ToastContextType = {
        toast: addToast,
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error'),
        warning: (msg) => addToast(msg, 'warning'),
    };

    return (
        <ToastContext.Provider value={ctx}>
            {children}
            {toasts.length > 0 && (
                <div className="toast-container">
                    {toasts.map(t => (
                        <div key={t.id} className={`toast-item ${t.type} ${t.exiting ? 'exiting' : ''}`}>
                            <span className="material-icons toast-icon">
                                {ICONS[t.type]}
                            </span>
                            <span className="toast-message">{t.message}</span>
                            <button
                                onClick={() => removeToast(t.id)}
                                className="toast-close"
                            >
                                <span className="material-icons">close</span>
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </ToastContext.Provider>
    );
};

export const useToast = (): ToastContextType => {
    const ctx = useContext(ToastContext);
    if (!ctx) {
        // Fallback if used outside provider
        return {
            toast: (msg) => console.log('[Toast]', msg),
            success: (msg) => console.log('[Toast:success]', msg),
            error: (msg) => console.error('[Toast:error]', msg),
            warning: (msg) => console.warn('[Toast:warning]', msg),
        };
    }
    return ctx;
};

export default ToastProvider;
