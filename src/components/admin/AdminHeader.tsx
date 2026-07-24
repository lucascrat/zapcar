/**
 * AdminHeader - Cabeçalho do painel admin
 */

import React from 'react';
import { UserProfile } from '../../../types';

interface AdminHeaderProps {
    currentUser: UserProfile;
    searchQuery: string;
    onSearchChange: (query: string) => void;
    onToggleSidebar?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({
    currentUser,
    searchQuery,
    onSearchChange,
    onToggleSidebar,
}) => {
    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 24px',
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        marginBottom: '16px',
    };

    const searchContainerStyle: React.CSSProperties = {
        flex: 1,
        maxWidth: '400px',
        position: 'relative',
    };

    const searchInputStyle: React.CSSProperties = {
        width: '100%',
        padding: '12px 16px 12px 44px',
        background: 'var(--color-bg-tertiary, #2a3942)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        color: 'var(--color-text-primary, #ffffff)',
        fontSize: '14px',
        outline: 'none',
    };

    const searchIconStyle: React.CSSProperties = {
        position: 'absolute',
        left: '14px',
        top: '50%',
        transform: 'translateY(-50%)',
        color: 'var(--color-text-tertiary, #667781)',
        pointerEvents: 'none',
    };

    const userInfoStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginLeft: 'auto',
    };

    const avatarStyle: React.CSSProperties = {
        width: '40px',
        height: '40px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #00a884 0%, #25d366 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontWeight: 700,
        fontSize: '16px',
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <header style={headerStyle}>
            {onToggleSidebar && (
                <button
                    onClick={onToggleSidebar}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer',
                        padding: '8px',
                        display: 'flex',
                    }}
                >
                    <span className="material-icons">menu</span>
                </button>
            )}

            <div style={searchContainerStyle}>
                <span className="material-icons" style={searchIconStyle}>search</span>
                <input
                    type="text"
                    placeholder="Buscar motorista..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    style={searchInputStyle}
                />
            </div>

            <div style={userInfoStyle}>
                <div style={{ textAlign: 'right' }}>
                    <p style={{ color: '#ffffff', fontSize: '14px', fontWeight: 600, margin: 0 }}>
                        {currentUser.username}
                    </p>
                    <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px', margin: 0 }}>
                        Administrador
                    </p>
                </div>
                {currentUser.avatar_url ? (
                    <img
                        src={currentUser.avatar_url}
                        alt={currentUser.username}
                        style={{ ...avatarStyle, background: 'none' }}
                    />
                ) : (
                    <div style={avatarStyle}>
                        {getInitials(currentUser.username)}
                    </div>
                )}
            </div>
        </header>
    );
};
