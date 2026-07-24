export const formatBRL = (value: number): string => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `R$ ${((Number.isFinite(value) ? value : 0).toFixed(2)).replace('.', ',')}`;
  }
};

export const convertCoinsToBRL = (coins: number, coinValueBRL: number): number => {
  const DEFAULT_COIN_BRL = 0.1;
  if (!Number.isFinite(coins)) return 0;
  const rate = Number.isFinite(coinValueBRL) && coinValueBRL > 0 ? coinValueBRL : DEFAULT_COIN_BRL;
  return coins * rate;
};

export const amountColorClass = (value: number): string => {
  if (value > 0) return 'text-green-500';
  if (value < 0) return 'text-red-500';
  return 'text-gray-400';
};
