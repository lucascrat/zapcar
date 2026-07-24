import React, { useEffect, useRef, useState } from 'react';
import { geocodeForward, GeocodeResult } from '../services/mapboxService';

interface AddressAutocompleteInputProps {
    value: string;
    onChangeText: (text: string) => void;
    onSelectPlace: (place: GeocodeResult) => void;
    placeholder?: string;
    inputClassName?: string;
    proximity?: [number, number];
    inputRef?: React.RefObject<HTMLInputElement>;
    variant?: 'dark' | 'light';
}

const DROPDOWN_CLASSES = {
    dark: { list: 'bg-whatsapp-panel border-gray-700 text-white', item: 'hover:bg-whatsapp-green/20' },
    light: { list: 'bg-white border-gray-200 text-gray-800', item: 'hover:bg-gray-100' },
};

export const AddressAutocompleteInput: React.FC<AddressAutocompleteInputProps> = ({
    value,
    onChangeText,
    onSelectPlace,
    placeholder,
    inputClassName,
    proximity,
    inputRef,
    variant = 'dark',
}) => {
    const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

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
        onChangeText(text);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            const results = await geocodeForward(text, proximity);
            setSuggestions(results);
            setIsOpen(results.length > 0);
        }, 300);
    };

    const handleSelect = (place: GeocodeResult) => {
        onSelectPlace(place);
        setIsOpen(false);
        setSuggestions([]);
    };

    return (
        <div ref={containerRef} className="relative w-full">
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => handleChange(e.target.value)}
                onFocus={() => suggestions.length > 0 && setIsOpen(true)}
                placeholder={placeholder}
                className={inputClassName}
                autoComplete="off"
            />
            {isOpen && suggestions.length > 0 && (
                <ul className={`absolute z-30 top-full left-0 right-0 mt-1 border rounded-lg shadow-lg overflow-hidden max-h-60 overflow-y-auto ${DROPDOWN_CLASSES[variant].list}`}>
                    {suggestions.map((place, idx) => (
                        <li key={idx}>
                            <button
                                type="button"
                                onClick={() => handleSelect(place)}
                                className={`w-full text-left px-4 py-2 text-sm transition flex items-center gap-2 ${DROPDOWN_CLASSES[variant].item}`}
                            >
                                <span className="material-icons text-gray-400 text-base">place</span>
                                <span className="truncate">{place.address}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};
