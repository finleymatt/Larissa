import {
  calculateSMA, calculateEMA, calculateMACrossover,
  calculateRSI, calculateMACD, calculateBollinger, calculateATR,
} from '../src/indicators';
import { Candle } from '../src/types';

// Helper to generate mock candles
function generateCandles(count: number, startPrice: number = 1.1000, trend: 'up' | 'down' | 'flat' = 'flat'): Candle[] {
  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const change = trend === 'up' ? 0.0002 : trend === 'down' ? -0.0002 : (Math.random() - 0.5) * 0.001;
    price += change;
    const high = price + Math.random() * 0.0005;
    const low = price - Math.random() * 0.0005;

    candles.push({
      timestamp: Date.now() - (count - i) * 3600000,
      open: price - change / 2,
      high,
      low,
      close: price,
      volume: Math.floor(Math.random() * 1000) + 100,
    });
  }

  return candles;
}

describe('Technical Indicators', () => {
  const candles = generateCandles(100);

  describe('SMA', () => {
    it('should calculate SMA with correct length', () => {
      const result = calculateSMA(candles, 20);
      expect(result.length).toBe(candles.length - 20 + 1);
    });

    it('should return numbers', () => {
      const result = calculateSMA(candles, 10);
      result.forEach(val => expect(typeof val).toBe('number'));
    });
  });

  describe('EMA', () => {
    it('should calculate EMA', () => {
      const result = calculateEMA(candles, 12);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(val => expect(typeof val).toBe('number'));
    });
  });

  describe('MA Crossover', () => {
    it('should detect crossovers', () => {
      const result = calculateMACrossover(candles, 10, 50);
      expect(result.shortMA.length).toBe(result.longMA.length);
      expect(result.crossover.length).toBe(result.longMA.length);
      result.crossover.forEach(val => {
        expect(['bullish', 'bearish', 'none']).toContain(val);
      });
    });

    it('should detect bullish crossover in uptrend', () => {
      const upCandles = generateCandles(100, 1.1, 'up');
      const result = calculateMACrossover(upCandles, 5, 20);
      // In an uptrend, short MA should generally be above long MA
      const lastShort = result.shortMA[result.shortMA.length - 1];
      const lastLong = result.longMA[result.longMA.length - 1];
      expect(lastShort).toBeGreaterThan(lastLong);
    });
  });

  describe('RSI', () => {
    it('should calculate RSI between 0 and 100', () => {
      const result = calculateRSI(candles, 14);
      expect(result.current).toBeGreaterThanOrEqual(0);
      expect(result.current).toBeLessThanOrEqual(100);
    });

    it('should detect overbought/oversold', () => {
      const result = calculateRSI(candles, 14);
      expect(typeof result.overbought).toBe('boolean');
      expect(typeof result.oversold).toBe('boolean');
    });
  });

  describe('MACD', () => {
    it('should calculate MACD components', () => {
      const result = calculateMACD(candles, 12, 26, 9);
      expect(result.macd.length).toBeGreaterThan(0);
      expect(result.signal.length).toBeGreaterThan(0);
      expect(result.histogram.length).toBeGreaterThan(0);
      expect(['bullish', 'bearish', 'none']).toContain(result.crossover);
    });
  });

  describe('Bollinger Bands', () => {
    it('should calculate bands with upper > middle > lower', () => {
      const result = calculateBollinger(candles, 20, 2);
      expect(result.currentUpper).toBeGreaterThan(result.currentMiddle);
      expect(result.currentMiddle).toBeGreaterThan(result.currentLower);
    });

    it('should calculate %B between reasonable bounds', () => {
      const result = calculateBollinger(candles, 20, 2);
      expect(result.percentB).toBeGreaterThan(-1);
      expect(result.percentB).toBeLessThan(2);
    });
  });

  describe('ATR', () => {
    it('should calculate ATR values', () => {
      const result = calculateATR(candles, 14);
      expect(result.length).toBeGreaterThan(0);
      result.forEach(val => {
        expect(val).toBeGreaterThan(0);
      });
    });
  });
});
