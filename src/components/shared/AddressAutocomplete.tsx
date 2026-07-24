import React, { useEffect, useRef, useState } from 'react';
import { Input } from './Input';
import { geocodeForward, GeocodeResult } from '../../../services/mapboxService';

interface AddressAutocompleteProps {
    label?: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    onPlaceSelected?: (place: { address: string; lat: number; lng: number }) => void;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
    label,
    placeholder,
    value,
    onChange,
    onPlaceSelected
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleChange = (text: string) => {
        onChange(text);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const results = await geocodeForward(text);
            setSuggestions(results);
            setIsOpen(results.length > 0);
        }, 300);
    };

    const handleSelect = (place: GeocodeResult) => {
        onChange(place.address);
        onPlaceSelected && onPlaceSelected({ address: place.address, lat: place.lat, lng: place.lng });
        setIsOpen(false);
        setSuggestions([]);
    };

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <Input
                ref={inputRef}
                label={label}
                placeholder={placeholder}
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setIsOpen(true)}
                autoComplete="off"
            />
            {isOpen && suggestions.length > 0 && (
                <ul
                    style={{
                        position: 'absolute',
                        zIndex: 30,
                        top: '100%',
                        left: 0,
                        right: 0,
                        marginTop: '4px',
                        background: 'var(--color-bg-tertiary, #2a3942)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '12px',
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        overflow: 'hidden',
                        maxHeight: '240px',
                        overflowY: 'auto',
                        listStyle: 'none',
                        padding: 0,
                        margin: 0,
                    }}
                >
                    {suggestions.map((place, idx) => (
                        <li key={idx}>
                            <button
                                type="button"
                                onClick={() => handleSelect(place)}
                                style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '10px 16px',
                                    fontSize: '13px',
                                    color: 'var(--color-text-primary, #ffffff)',
                                    background: 'transparent',
                                    border: 'none',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,168,132,0.15)')}
                                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                            >
                                <span className="material-icons" style={{ fontSize: '16px', color: 'var(--color-text-tertiary, #667781)' }}>place</span>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{place.address}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
