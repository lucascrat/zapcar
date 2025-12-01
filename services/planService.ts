// Plan Service - Gerenciamento de Planos de Recarga
import { DRIVER_PLANS } from '../constants';

export interface DriverPlan {
    id: string;
    title: string;
    description: string;
    price: number;
    days: number;
}

// Por enquanto, usamos os planos do constants.ts
// No futuro, isso pode vir do Supabase
export const fetchDriverPlans = async (): Promise<DriverPlan[]> => {
    // TODO: Buscar do Supabase quando implementarmos a tabela
    return DRIVER_PLANS;
};

export const updateDriverPlans = async (plans: DriverPlan[]): Promise<boolean> => {
    // TODO: Salvar no Supabase quando implementarmos a tabela
    console.log("Planos atualizados (local):", plans);
    return true;
};
