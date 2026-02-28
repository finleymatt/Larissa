import { StrategyEngine } from '../src/strategies';
import { maCrossoverStrategy } from '../src/strategies/ma-crossover';
import { rsiStrategy } from '../src/strategies/rsi';
import { macdStrategy } from '../src/strategies/macd';
import { bollingerStrategy } from '../src/strategies/bollinger';
import { Candle, StrategyConfig } from '../src/types';

function generateCandles(count: number, startPrice: number = 1.1, trend: 'up' | 'down' | 'flat' = 'flat'): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = trend === 'up' ? 0.0003 : trend === 'down' ? -0.0003 : (Math.random() - 0.5) * 0.001;
    price += change;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high: price + Math.random() * 0.0005,
      low: price - Math.random() * 0.0005,
      close: price,
      volume: Math.floor(Math.random() * 1000) + 100,
    });
  }

  return candles;
}

describe('Individual Strategies', () => {
  const candles = generateCandles(100);
  const instrument = 'EUR_USD';

  describe('MA Crossover Strategy', () => {
    const config: StrategyConfig = {
      name: 'ma_crossover',
      enabled: true,
      weight: 0.25,
      params: { shortPeriod: 10, longPeriod: 50 },
    };

    it('should return a valid signal', () => {
      const result = maCrossoverStrategy(candles, instrument, config);
      expect(result.signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(result.signal.action);
      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
      expect(result.signal.strategy).toBe('ma_crossover');
      expect(result.signal.instrument).toBe(instrument);
    });
  });

  describe('RSI Strategy', () => {
    const config: StrategyConfig = {
      name: 'rsi',
      enabled: true,
      weight: 0.25,
      params: { period: 14, overbought: 70, oversold: 30 },
    };

    it('should return a valid signal', () => {
      const result = rsiStrategy(candles, instrument, config);
      expect(result.signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(result.signal.action);
      expect(result.signal.confidence).toBeGreaterThanOrEqual(0);
      expect(result.signal.confidence).toBeLessThanOrEqual(1);
      expect(result.signal.strategy).toBe('rsi');
    });
  });

  describe('MACD Strategy', () => {
    const config: StrategyConfig = {
      name: 'macd',
      enabled: true,
      weight: 0.25,
      params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
    };

    it('should return a valid signal', () => {
      const result = macdStrategy(candles, instrument, config);
      expect(result.signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(result.signal.action);
      expect(result.signal.strategy).toBe('macd');
    });
  });

  describe('Bollinger Strategy', () => {
    const config: StrategyConfig = {
      name: 'bollinger',
      enabled: true,
      weight: 0.25,
      params: { period: 20, stdDev: 2 },
    };

    it('should return a valid signal', () => {
      const result = bollingerStrategy(candles, instrument, config);
      expect(result.signal).toBeDefined();
      expect(['buy', 'sell', 'hold']).toContain(result.signal.action);
      expect(result.signal.strategy).toBe('bollinger');
    });
  });
});

describe('Strategy Engine', () => {
  const strategies: StrategyConfig[] = [
    { name: 'ma_crossover', enabled: true, weight: 0.25, params: { shortPeriod: 10, longPeriod: 50 } },
    { name: 'rsi', enabled: true, weight: 0.25, params: { period: 14, overbought: 70, oversold: 30 } },
    { name: 'macd', enabled: true, weight: 0.25, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    { name: 'bollinger', enabled: true, weight: 0.25, params: { period: 20, stdDev: 2 } },
  ];

  it('should combine signals into a composite signal', () => {
    const engine = new StrategyEngine(strategies);
    const candles = generateCandles(100);
    const result = engine.evaluate(candles, 'EUR_USD');

    expect(result).toBeDefined();
    expect(['buy', 'sell', 'hold']).toContain(result.action);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.signals.length).toBe(4);
    expect(result.instrument).toBe('EUR_USD');
  });

  it('should normalize weights', () => {
    const unbalanced: StrategyConfig[] = [
      { name: 'ma_crossover', enabled: true, weight: 0.5, params: { shortPeriod: 10, longPeriod: 50 } },
      { name: 'rsi', enabled: true, weight: 0.5, params: { period: 14, overbought: 70, oversold: 30 } },
      { name: 'macd', enabled: true, weight: 0.5, params: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
    ];

    const engine = new StrategyEngine(unbalanced);
    const candles = generateCandles(100);
    const result = engine.evaluate(candles, 'EUR_USD');

    expect(result).toBeDefined();
    // Should still work even with weights > 1
  });

  it('should handle disabled strategies', () => {
    const mixed: StrategyConfig[] = [
      { name: 'ma_crossover', enabled: true, weight: 0.5, params: { shortPeriod: 10, longPeriod: 50 } },
      { name: 'rsi', enabled: false, weight: 0.5, params: { period: 14, overbought: 70, oversold: 30 } },
    ];

    const engine = new StrategyEngine(mixed);
    const candles = generateCandles(100);
    const result = engine.evaluate(candles, 'EUR_USD');

    expect(result.signals.length).toBe(1);
  });
});
