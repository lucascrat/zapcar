/**
 * Cálculo de preço de corrida - fonte única, usada por toda tela que precisa
 * estimar/cobrar uma corrida (pedido do cliente, taxímetro, bot do WhatsApp,
 * simulador do admin).
 *
 * Antes desta função, a mesma fórmula estava duplicada em 6 lugares
 * diferentes (RideCalculator, ClientDashboard, Taximeter, DriverDashboard,
 * whatsappBot, e o simulador do admin), cada um com uma variação sutil - o
 * bug real: o campo "preço mínimo" noturno/madrugada era usado como TARIFA
 * MÍNIMA em alguns lugares e como PREÇO POR MINUTO em outros, porque nunca
 * existiu um campo de preço/minuto separado por horário. VehicleCategory
 * (types.ts) tem os dois campos, sem ambiguidade, em cada faixa de horário -
 * essa função é a única que precisa saber ler essa tabela.
 */

import { VehicleCategory } from '../types';

export interface PriceBreakdown {
    price: number;
    tier: 'standard' | 'night' | 'dawn';
    base: number;
    perKm: number;
    perMinute: number;
    minFare: number;
    chargeableDistanceKm: number;
}

const parseTimeToMinutes = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const [h, m] = timeStr.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
};

// Testa se `nowMin` cai dentro da janela [startMin, endMin), tratando o caso
// da janela cruzar a meia-noite (ex: 19:00 às 05:00).
const isWithinWindow = (nowMin: number, startMin: number, endMin: number): boolean =>
    startMin < endMin
        ? (nowMin >= startMin && nowMin <= endMin)
        : (nowMin >= startMin || nowMin <= endMin);

export const detectPricingTier = (
    now: Date,
    nightStartTime?: string, nightEndTime?: string,
    dawnStartTime?: string, dawnEndTime?: string
): 'standard' | 'night' | 'dawn' => {
    const nowMin = now.getHours() * 60 + now.getMinutes();

    const dawnStart = parseTimeToMinutes(dawnStartTime || '00:00');
    const dawnEnd = parseTimeToMinutes(dawnEndTime || '05:00');
    if (isWithinWindow(nowMin, dawnStart, dawnEnd)) return 'dawn';

    const nightStart = parseTimeToMinutes(nightStartTime || '19:00');
    const nightEnd = parseTimeToMinutes(nightEndTime || '23:59');
    if (isWithinWindow(nowMin, nightStart, nightEnd)) return 'night';

    return 'standard';
};

/**
 * Calcula o preço de uma corrida pra uma categoria, distância e duração
 * dadas. `now` é injetável pra facilitar teste/simulação (ex: simulador do
 * admin mostrando "se fosse agora à noite"); no uso normal passe `new Date()`.
 */
export const calculateCategoryPrice = (
    category: VehicleCategory,
    distanceKm: number,
    durationMin: number,
    now: Date = new Date(),
    windows?: { nightStartTime?: string; nightEndTime?: string; dawnStartTime?: string; dawnEndTime?: string }
): PriceBreakdown => {
    const tier = detectPricingTier(
        now,
        windows?.nightStartTime, windows?.nightEndTime,
        windows?.dawnStartTime, windows?.dawnEndTime
    );

    // Cada campo cai pro valor padrão quando a categoria não tem override
    // específico daquele horário (null/undefined) - mesmo comportamento que
    // já existia antes, só que agora aplicado de forma consistente aos 4
    // campos (base/km/mínima/minuto), não só a alguns.
    const base = (tier === 'dawn' ? category.dawn_base_price : tier === 'night' ? category.night_base_price : null) ?? category.base_price;
    const perKm = (tier === 'dawn' ? category.dawn_price_km : tier === 'night' ? category.night_price_km : null) ?? category.price_km;
    const perMinute = (tier === 'dawn' ? category.dawn_price_per_minute : tier === 'night' ? category.night_price_per_minute : null) ?? category.price_per_minute;
    const minFare = (tier === 'dawn' ? category.dawn_price_min_fare : tier === 'night' ? category.night_price_min_fare : null) ?? category.price_min_fare;

    const chargeableDistanceKm = Math.max(0, distanceKm - (category.start_distance_limit || 0));
    const calculated = base + (chargeableDistanceKm * perKm) + (durationMin * perMinute);
    const price = Math.max(calculated, minFare);

    return { price, tier, base, perKm, perMinute, minFare, chargeableDistanceKm };
};
