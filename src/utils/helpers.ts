export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function pipValue(instrument: string, price: number): number {
  // For JPY pairs, 1 pip = 0.01; for others, 1 pip = 0.0001
  if (instrument.includes('JPY')) {
    return 0.01;
  }
  return 0.0001;
}

export function pipsToPrice(pips: number, instrument: string): number {
  return pips * pipValue(instrument, 0);
}

export function priceToPips(priceChange: number, instrument: string): number {
  return priceChange / pipValue(instrument, 0);
}

export function roundToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function percentChange(oldVal: number, newVal: number): number {
  if (oldVal === 0) return 0;
  return ((newVal - oldVal) / oldVal) * 100;
}
