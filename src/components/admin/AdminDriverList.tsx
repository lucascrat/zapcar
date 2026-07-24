/**
 * AdminDriverList - Lista de motoristas no painel admin
 */

import React from 'react';
import { UserProfile, DriverStatus } from '../../../types';

interface AdminDriverListProps {
    drivers: UserProfile[];
    selectedDriver: UserProfile | null;
    onSelectDriver: (driver: UserProfile) => void;
    isLoading?: boolean;
}

export const AdminDriverList: React.FC<AdminDriverListProps> = ({
    drivers,
    selectedDriver,
    onSelectDriver,
    isLoading = false,
}) => {
    const getStatusColor = (status: DriverStatus) => {
        switch (status) {
            case DriverStatus.AVAILABLE: return '#00a884';
            case DriverStatus.BUSY: return '#f59e0b';
            case DriverStatus.OFFLINE: return '#667781';
            default: return '#667781';
        }
    };

    const getStatusLabel = (status: DriverStatus) => {
        switch (status) {
            case DriverStatus.AVAILABLE: return 'Disponível';
            case DriverStatus.BUSY: return 'Ocupado';
            case DriverStatus.OFFLINE: return 'Offline';
            default: return 'Offline';
        }
    };

    const containerStyle: React.CSSProperties = {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
    };

    const driverItemStyle = (isSelected: boolean): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        background: isSelected ? 'var(--color-bg-tertiary, #2a3942)' : 'transparent',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        border: isSelected ? '1px solid var(--color-primary, #00a884)' : '1px solid transparent',
    });

    const avatarStyle: React.CSSProperties = {
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: 'var(--color-surface, #202c33)',
        objectFit: 'cover',
    };

    const infoStyle: React.CSSProperties = {
        flex: 1,
        minWidth: 0,
    };

    const nameStyle: React.CSSProperties = {
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: 600,
        margin: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    };

    const vehicleStyle: React.CSSProperties = {
        color: 'var(--color-text-secondary, #8696a0)',
        fontSize: '12px',
        margin: '2px 0 0 0',
    };

    const statusBadgeStyle = (status: DriverStatus): React.CSSProperties => ({
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        padding: '4px 8px',
        borderRadius: '9999px',
        background: `${getStatusColor(status)}20`,
        color: getStatusColor(status),
        fontSize: '10px',
        fontWeight: 600,
        textTransform: 'uppercase',
    });

    if (isLoading) {
        return (
            <div style={containerStyle}>
                {[1, 2, 3].map(i => (
                    <div key={i} style={{ ...driverItemStyle(false), opacity: 0.5 }}>
                        <div style={{ ...avatarStyle, background: 'var(--color-bg-tertiary)' }} />
                        <div style={infoStyle}>
                            <div style={{ height: '14px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', width: '60%' }} />
                            <div style={{ height: '12px', background: 'var(--color-bg-tertiary)', borderRadius: '4px', width: '40%', marginTop: '6px' }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (drivers.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '32px', color: 'var(--color-text-secondary)' }}>
                <span className="material-icons" style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.5 }}>
                    person_off
                </span>
                <p style={{ margin: 0, fontSize: '14px' }}>Nenhum motorista encontrado</p>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {drivers.map((driver) => (
                <div
                    key={driver.id}
                    style={driverItemStyle(selectedDriver?.id === driver.id)}
                    onClick={() => onSelectDriver(driver)}
                    role="button"
                    tabIndex={0}
                >
                    {driver.avatar_url ? (
                        <img src={driver.avatar_url} alt={driver.username} style={avatarStyle} />
                    ) : (
                        <div style={{ ...avatarStyle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 600 }}>
                            {driver.username[0].toUpperCase()}
                        </div>
                    )}

                    <div style={infoStyle}>
                        <p style={nameStyle}>{driver.username}</p>
                        <p style={vehicleStyle}>
                            {driver.vehicle_type === 'motorcycle' ? '🏍️' : '🚗'} {driver.vehicle_model || 'Veículo não informado'}
                        </p>
                    </div>

                    <span style={statusBadgeStyle(driver.status)}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: getStatusColor(driver.status) }} />
                        {getStatusLabel(driver.status)}
                    </span>
                </div>
            ))}
        </div>
    );
};
