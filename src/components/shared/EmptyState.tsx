/**
 * EmptyState - Componente para estados vazios
 */

import React, { ReactNode } from 'react';

interface EmptyStateProps {
    icon?: string;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon = 'inbox',
    title,
    description,
    action,
    className = '',
}) => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }} className={className}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'rgba(0, 168, 132, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                <span className="material-icons" style={{ fontSize: '36px', color: '#00a884' }}>{icon}</span>
            </div>
            <h3 style={{ color: '#ffffff', fontSize: '18px', fontWeight: 600, margin: '0 0 8px 0' }}>{title}</h3>
            {description && <p style={{ color: '#8696a0', fontSize: '14px', margin: '0 0 24px 0', maxWidth: '280px' }}>{description}</p>}
            {action}
        </div>
    );
};
