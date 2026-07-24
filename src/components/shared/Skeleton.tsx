/**
 * Skeleton - Componentes de loading skeleton
 */

import React from 'react';

// Types
interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string | number;
    className?: string;
    style?: React.CSSProperties;
}

// Base Skeleton
export const Skeleton: React.FC<SkeletonProps> = ({
    width = '100%',
    height = '1em',
    borderRadius = '8px',
    className = '',
    style,
}) => {
    const skeletonStyle: React.CSSProperties = {
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, var(--color-surface, #202c33) 25%, var(--color-surface-hover, #2a3942) 50%, var(--color-surface, #202c33) 75%)',
        backgroundSize: '200% 100%',
        animation: 'skeleton 1.5s ease-in-out infinite',
        ...style,
    };

    return <div style={skeletonStyle} className={className} />;
};

// Skeleton Text (multiple lines)
interface SkeletonTextProps {
    lines?: number;
    lastLineWidth?: string;
    gap?: string;
    className?: string;
}

export const SkeletonText: React.FC<SkeletonTextProps> = ({
    lines = 3,
    lastLineWidth = '60%',
    gap = '8px',
    className = '',
}) => {
    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap,
    };

    return (
        <div style={containerStyle} className={className}>
            {Array.from({ length: lines }).map((_, index) => (
                <Skeleton
                    key={index}
                    height="14px"
                    width={index === lines - 1 ? lastLineWidth : '100%'}
                />
            ))}
        </div>
    );
};

// Skeleton Circle (for avatars)
interface SkeletonCircleProps {
    size?: number | string;
    className?: string;
}

export const SkeletonCircle: React.FC<SkeletonCircleProps> = ({
    size = 40,
    className = '',
}) => (
    <Skeleton
        width={size}
        height={size}
        borderRadius="50%"
        className={className}
    />
);

// Skeleton Card
interface SkeletonCardProps {
    showAvatar?: boolean;
    showActions?: boolean;
    className?: string;
}

export const SkeletonCard: React.FC<SkeletonCardProps> = ({
    showAvatar = true,
    showActions = false,
    className = '',
}) => {
    const cardStyle: React.CSSProperties = {
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        padding: '16px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '16px',
    };

    const actionsStyle: React.CSSProperties = {
        display: 'flex',
        gap: '8px',
        marginTop: '16px',
    };

    return (
        <div style={cardStyle} className={className}>
            <div style={headerStyle}>
                {showAvatar && <SkeletonCircle size={48} />}
                <div style={{ flex: 1 }}>
                    <Skeleton height="16px" width="60%" style={{ marginBottom: '8px' }} />
                    <Skeleton height="12px" width="40%" />
                </div>
            </div>
            <SkeletonText lines={2} />
            {showActions && (
                <div style={actionsStyle}>
                    <Skeleton height="36px" width="80px" borderRadius="12px" />
                    <Skeleton height="36px" width="80px" borderRadius="12px" />
                </div>
            )}
        </div>
    );
};

// Skeleton List Item
interface SkeletonListItemProps {
    showAvatar?: boolean;
    showSecondaryText?: boolean;
    className?: string;
}

export const SkeletonListItem: React.FC<SkeletonListItemProps> = ({
    showAvatar = true,
    showSecondaryText = true,
    className = '',
}) => {
    const itemStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
    };

    return (
        <div style={itemStyle} className={className}>
            {showAvatar && <SkeletonCircle size={48} />}
            <div style={{ flex: 1 }}>
                <Skeleton height="16px" width="70%" style={{ marginBottom: showSecondaryText ? '8px' : '0' }} />
                {showSecondaryText && <Skeleton height="12px" width="50%" />}
            </div>
            <Skeleton height="12px" width="40px" />
        </div>
    );
};

// Skeleton List
interface SkeletonListProps {
    count?: number;
    showAvatar?: boolean;
    showSecondaryText?: boolean;
    className?: string;
}

export const SkeletonList: React.FC<SkeletonListProps> = ({
    count = 3,
    showAvatar = true,
    showSecondaryText = true,
    className = '',
}) => (
    <div className={className}>
        {Array.from({ length: count }).map((_, index) => (
            <SkeletonListItem
                key={index}
                showAvatar={showAvatar}
                showSecondaryText={showSecondaryText}
            />
        ))}
    </div>
);

// Skeleton Dashboard Stat
export const SkeletonStat: React.FC<{ className?: string }> = ({ className = '' }) => {
    const statStyle: React.CSSProperties = {
        background: 'var(--color-surface, #202c33)',
        borderRadius: '16px',
        padding: '20px',
        border: '1px solid rgba(255, 255, 255, 0.05)',
    };

    return (
        <div style={statStyle} className={className}>
            <Skeleton height="14px" width="50%" style={{ marginBottom: '12px' }} />
            <Skeleton height="32px" width="80%" />
        </div>
    );
};

// Skeleton Grid
interface SkeletonGridProps {
    count?: number;
    columns?: number;
    gap?: string;
    className?: string;
}

export const SkeletonGrid: React.FC<SkeletonGridProps> = ({
    count = 4,
    columns = 2,
    gap = '16px',
    className = '',
}) => {
    const gridStyle: React.CSSProperties = {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap,
    };

    return (
        <div style={gridStyle} className={className}>
            {Array.from({ length: count }).map((_, index) => (
                <SkeletonStat key={index} />
            ))}
        </div>
    );
};
