/**
 * VehicleCategoriesContext - Categorias de veículo cadastráveis pelo admin
 * (Carro, Moto, Biz, Entregas, ...), carregadas uma vez e cacheadas pro app
 * inteiro. Substitui o antigo par fixo 'car'/'motorcycle' hardcoded em
 * dezenas de lugares - ver types.ts (VehicleCategory) e
 * services/pricing.ts (cálculo de preço unificado).
 *
 * getCategoryMeta() é o ponto central pra qualquer tela que hoje faz
 * `vehicle_type === 'motorcycle' ? X : Y`: troca por
 * `getCategoryMeta(vehicle_type).name` / `.icon_url`, com um fallback seguro
 * no formato carro/moto pra dado legado ou categoria desconhecida - nenhuma
 * tela quebra mesmo antes de ser migrada pra usar isso.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { VehicleCategory } from '../../types';
import { fetchVehicleCategories } from '../../services/supabaseClient';

export interface CategoryMeta {
    name: string;
    icon_url?: string;
    description?: string;
}

// Fallback pra quando o slug não bate com nenhuma categoria cadastrada
// (dado legado, categoria desativada, ou categorias ainda carregando) -
// mantém o comportamento visual de antes (ícone carro/moto) em vez de
// quebrar a tela.
const FALLBACK_META: Record<string, CategoryMeta> = {
    car: { name: 'Carro' },
    motorcycle: { name: 'Moto' },
};

interface VehicleCategoriesContextType {
    categories: VehicleCategory[];       // todas (inclusive inativas) - uso admin
    activeCategories: VehicleCategory[];  // só ativas - uso em pickers/cadastro
    loading: boolean;
    refetch: () => Promise<void>;
    getCategoryMeta: (vehicleType?: string | null) => CategoryMeta;
}

const VehicleCategoriesContext = createContext<VehicleCategoriesContextType | undefined>(undefined);

export const VehicleCategoriesProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [categories, setCategories] = useState<VehicleCategory[]>([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        const data = await fetchVehicleCategories(false); // todas, filtragem de ativas é local
        setCategories(data);
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const activeCategories = categories.filter(c => c.is_active);

    const getCategoryMeta = useCallback((vehicleType?: string | null): CategoryMeta => {
        if (!vehicleType) return FALLBACK_META.car;
        const found = categories.find(c => c.slug === vehicleType);
        if (found) return { name: found.name, icon_url: found.icon_url, description: found.description };
        return FALLBACK_META[vehicleType] || FALLBACK_META.car;
    }, [categories]);

    const value: VehicleCategoriesContextType = {
        categories,
        activeCategories,
        loading,
        refetch: load,
        getCategoryMeta,
    };

    return (
        <VehicleCategoriesContext.Provider value={value}>
            {children}
        </VehicleCategoriesContext.Provider>
    );
};

export const useVehicleCategories = (): VehicleCategoriesContextType => {
    const context = useContext(VehicleCategoriesContext);
    if (!context) {
        throw new Error('useVehicleCategories must be used within a VehicleCategoriesProvider');
    }
    return context;
};

export default VehicleCategoriesContext;
