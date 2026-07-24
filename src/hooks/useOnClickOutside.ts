/**
 * useOnClickOutside - Hook para detectar cliques fora de um elemento
 */

import { useEffect, RefObject } from 'react';

type Handler = (event: MouseEvent | TouchEvent) => void;

/**
 * Hook to detect clicks outside of an element
 * @param ref - React ref of the element
 * @param handler - Callback when click outside is detected
 * @param enabled - Whether the hook is enabled (default: true)
 */
export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
    ref: RefObject<T>,
    handler: Handler,
    enabled: boolean = true
): void {
    useEffect(() => {
        if (!enabled) return;

        const listener = (event: MouseEvent | TouchEvent) => {
            const el = ref?.current;

            // Do nothing if clicking ref's element or descendent elements
            if (!el || el.contains(event.target as Node)) {
                return;
            }

            handler(event);
        };

        document.addEventListener('mousedown', listener);
        document.addEventListener('touchstart', listener);

        return () => {
            document.removeEventListener('mousedown', listener);
            document.removeEventListener('touchstart', listener);
        };
    }, [ref, handler, enabled]);
}
