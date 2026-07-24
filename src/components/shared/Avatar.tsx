/**
 * Avatar - Componente de avatar moderno
 */

import React, { useState } from 'react';

// Types
type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
type AvatarStatus = 'online' | 'offline' | 'busy' | 'away';

interface AvatarProps {
    src?: string | null;
    name?: string;
    size?: AvatarSize;
    status?: AvatarStatus;
    showStatus?: boolean;
    ring?: boolean;
    className?: string;
    style?: React.CSSProperties;
    onClick?: () => void;
}

// Size values
const sizeValues: Record<AvatarSize, number> = {
    xs: 24,
    sm: 32,
    md: 40,
    lg: 48,
    xl: 64,
    '2xl': 96,
};

// Status colors
const statusColors: Record<AvatarStatus, string> = {
    online: '#00a884',
    offline: '#667781',
    busy: '#ef4444',
    away: '#f59e0b',
};

// Generate initials from name
const getInitials = (name: string): string => {
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
};

// Generate color from name
const getColorFromName = (name: string): string => {
    const colors = [
        '#00a884', '#25d366', '#3b82f6', '#8b5cf6',
        '#ec4899', '#f59e0b', '#ef4444', '#10b981',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
};

// Component
export const Avatar: React.FC<AvatarProps> = ({
    src,
    name = 'User',
    size = 'md',
    status,
    showStatus = false,
    ring = false,
    className = '',
    style,
    onClick,
}) => {
    const [imageError, setImageError] = useState(false);
    const pixelSize = sizeValues[size];
    const statusSize = Math.max(pixelSize * 0.25, 8);
    const fontSize = pixelSize * 0.4;

    const containerStyle: React.CSSProperties = {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: pixelSize,
        height: pixelSize,
        borderRadius: '50%',
        flexShrink: 0,
        cursor: onClick ? 'pointer' : 'default',
        ...(ring && {
            padding: 3,
            background: 'linear-gradient(135deg, #00a884 0%, #25d366 100%)',
        }),
        ...style,
    };

    const avatarStyle: React.CSSProperties = {
        width: ring ? pixelSize - 6 : pixelSize,
        height: ring ? pixelSize - 6 : pixelSize,
        borderRadius: '50%',
        objectFit: 'cover',
        background: getColorFromName(name),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#ffffff',
        fontSize: fontSize,
        fontWeight: 600,
        textTransform: 'uppercase',
    };

    const statusStyle: React.CSSProperties = {
        position: 'absolute',
        bottom: ring ? 2 : 0,
        right: ring ? 2 : 0,
        width: statusSize,
        height: statusSize,
        borderRadius: '50%',
        background: status ? statusColors[status] : 'transparent',
        border: `2px solid var(--color-bg-primary, #111b21)`,
        boxSizing: 'content-box',
    };

    const showImage = src && !imageError;

    return (
        <div
            style={containerStyle}
            className={className}
            onClick={onClick}
            role={onClick ? 'button' : undefined}
            tabIndex={onClick ? 0 : undefined}
        >
            {showImage ? (
                <img
                    src={src}
                    alt={name}
                    style={avatarStyle}
                    onError={() => setImageError(true)}
                />
            ) : (
                <div style={avatarStyle}>
                    {getInitials(name)}
                </div>
            )}
            {showStatus && status && <div style={statusStyle} />}
        </div>
    );
};

// Avatar Group
interface AvatarGroupProps {
    avatars: Array<{ src?: string; name?: string }>;
    max?: number;
    size?: AvatarSize;
    className?: string;
}

export const AvatarGroup: React.FC<AvatarGroupProps> = ({
    avatars,
    max = 3,
    size = 'md',
    className = '',
}) => {
    const visibleAvatars = avatars.slice(0, max);
    const remaining = avatars.length - max;
    const pixelSize = sizeValues[size];

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
    };

    const avatarItemStyle: React.CSSProperties = {
        marginLeft: -pixelSize * 0.25,
        border: `2px solid var(--color-bg-primary, #111b21)`,
        borderRadius: '50%',
    };

    const remainingStyle: React.CSSProperties = {
        ...avatarItemStyle,
        width: pixelSize,
        height: pixelSize,
        background: 'var(--color-surface, #202c33)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: pixelSize * 0.35,
        fontWeight: 600,
    };

    return (
        <div style={containerStyle} className={className}>
            {visibleAvatars.map((avatar, index) => (
                <div key={index} style={index === 0 ? {} : avatarItemStyle}>
                    <Avatar src={avatar.src} name={avatar.name} size={size} />
                </div>
            ))}
            {remaining > 0 && (
                <div style={remainingStyle}>+{remaining}</div>
            )}
        </div>
    );
};
