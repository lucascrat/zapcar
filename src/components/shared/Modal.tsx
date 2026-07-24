/**
 * Modal - Componente de modal moderno
 */

import React, { useEffect, useRef, ReactNode, useCallback } from 'react';
import { useOnClickOutside } from '../../hooks/useOnClickOutside';

// Types
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    size?: ModalSize;
    closeOnBackdrop?: boolean;
    closeOnEsc?: boolean;
    showCloseButton?: boolean;
    preventScroll?: boolean;
    className?: string;
}

// Size values
const sizeValues: Record<ModalSize, string> = {
    sm: '320px',
    md: '400px',
    lg: '500px',
    xl: '640px',
    full: '100%',
};

// Component
export const Modal: React.FC<ModalProps> = ({
    isOpen,
    onClose,
    title,
    subtitle,
    children,
    footer,
    size = 'md',
    closeOnBackdrop = true,
    closeOnEsc = true,
    showCloseButton = true,
    preventScroll = true,
    className = '',
}) => {
    const modalRef = useRef<HTMLDivElement>(null);

    // Handle click outside
    useOnClickOutside(modalRef, () => {
        if (closeOnBackdrop) onClose();
    }, isOpen);

    // Handle ESC key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape' && closeOnEsc) {
            onClose();
        }
    }, [closeOnEsc, onClose]);

    useEffect(() => {
        if (isOpen) {
            document.addEventListener('keydown', handleKeyDown);
            if (preventScroll) {
                document.body.style.overflow = 'hidden';
            }
        }

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (preventScroll) {
                document.body.style.overflow = '';
            }
        };
    }, [isOpen, handleKeyDown, preventScroll]);

    if (!isOpen) return null;

    const backdropStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 200ms ease-out',
    };

    const modalStyle: React.CSSProperties = {
        background: 'var(--color-surface, #202c33)',
        borderRadius: size === 'full' ? '0' : '24px',
        width: '100%',
        maxWidth: sizeValues[size],
        maxHeight: size === 'full' ? '100%' : '90vh',
        overflow: 'hidden',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.7)',
        animation: 'scaleIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
        display: 'flex',
        flexDirection: 'column',
    };

    const headerStyle: React.CSSProperties = {
        padding: '20px 24px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: '16px',
    };

    const titleContainerStyle: React.CSSProperties = {
        flex: 1,
        minWidth: 0,
    };

    const titleStyle: React.CSSProperties = {
        color: 'var(--color-text-primary, #ffffff)',
        fontSize: '20px',
        fontWeight: 700,
        margin: 0,
    };

    const subtitleStyle: React.CSSProperties = {
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: '14px',
        margin: '4px 0 0 0',
    };

    const closeButtonStyle: React.CSSProperties = {
        width: '36px',
        height: '36px',
        borderRadius: '50%',
        background: 'rgba(255, 255, 255, 0.05)',
        border: 'none',
        color: 'var(--color-text-secondary, #8696a0)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 150ms ease',
        flexShrink: 0,
    };

    const bodyStyle: React.CSSProperties = {
        padding: '24px',
        overflowY: 'auto',
        flex: 1,
    };

    const footerStyle: React.CSSProperties = {
        padding: '16px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        display: 'flex',
        gap: '12px',
        justifyContent: 'flex-end',
    };

    return (
        <div style={backdropStyle} className="modal-backdrop">
            <div ref={modalRef} style={modalStyle} className={`modal ${className}`}>
                {(title || showCloseButton) && (
                    <div style={headerStyle}>
                        <div style={titleContainerStyle}>
                            {title && <h2 style={titleStyle}>{title}</h2>}
                            {subtitle && <p style={subtitleStyle}>{subtitle}</p>}
                        </div>
                        {showCloseButton && (
                            <button
                                style={closeButtonStyle}
                                onClick={onClose}
                                aria-label="Fechar"
                            >
                                <span className="material-icons" style={{ fontSize: '20px' }}>close</span>
                            </button>
                        )}
                    </div>
                )}
                <div style={bodyStyle}>{children}</div>
                {footer && <div style={footerStyle}>{footer}</div>}
            </div>
        </div>
    );
};

// Bottom Sheet variant for mobile
interface BottomSheetProps {
    isOpen: boolean;
    onClose: () => void;
    children: ReactNode;
    title?: string;
    showHandle?: boolean;
    className?: string;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
    isOpen,
    onClose,
    children,
    title,
    showHandle = true,
    className = '',
}) => {
    const sheetRef = useRef<HTMLDivElement>(null);

    useOnClickOutside(sheetRef, onClose, isOpen);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const backdropStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        zIndex: 500,
        animation: 'fadeIn 200ms ease-out',
    };

    const sheetStyle: React.CSSProperties = {
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'var(--color-surface, #202c33)',
        borderRadius: '24px 24px 0 0',
        padding: '24px',
        paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -10px 40px rgba(0, 0, 0, 0.5)',
        animation: 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1)',
        zIndex: 501,
        maxHeight: '85vh',
        overflow: 'auto',
    };

    const handleStyle: React.CSSProperties = {
        width: '40px',
        height: '4px',
        background: 'var(--color-text-tertiary, #667781)',
        borderRadius: '9999px',
        margin: '0 auto 16px',
    };

    const titleStyle: React.CSSProperties = {
        color: 'var(--color-text-primary, #ffffff)',
        fontSize: '18px',
        fontWeight: 700,
        textAlign: 'center',
        marginBottom: '16px',
    };

    return (
        <>
            <div style={backdropStyle} onClick={onClose} />
            <div ref={sheetRef} style={sheetStyle} className={className}>
                {showHandle && <div style={handleStyle} />}
                {title && <h3 style={titleStyle}>{title}</h3>}
                {children}
            </div>
        </>
    );
};
