import {
  SMA, EMA, RSI, MACD, BollingerBands, ATR,
} from 'technicalindicators';
import { Candle } from '../types';

// ============================================================
// Moving Average Indicators
// ============================================================

export function calculateSMA(candles: Candle[], period: number): number[] {
  const closes = candles.map(c => c.close);
  return SMA.calculate({ period, values: closes });
}

export function calculateEMA(candles: Candle[], period: number): number[] {
  const closes = candles.map(c => c.close);
  return EMA.calculate({ period, values: closes });
}

export interface MACrossoverResult {
  shortMA: number[];
  longMA: number[];
  crossover: ('bullish' | 'bearish' | 'none')[];
}

export function calculateMACrossover(
  candles: Candle[],
  shortPeriod: number,
  longPeriod: number,
): MACrossoverResult {
  const closes = candles.map(c => c.close);
  const shortMA = EMA.calculate({ period: shortPeriod, values: closes });
  const longMA = EMA.calculate({ period: longPeriod, values: closes });

  // Align arrays - longMA will be shorter
  const offset = shortMA.length - longMA.length;
  const alignedShort = shortMA.slice(offset);

  const crossover: ('bullish' | 'bearish' | 'none')[] = [];
  for (let i = 0; i < longMA.length; i++) {
    if (i === 0) {
      crossover.push('none');
      continue;
    }
    const prevShort = alignedShort[i - 1];
    const prevLong = longMA[i - 1];
    const currShort = alignedShort[i];
    const currLong = longMA[i];

    if (prevShort <= prevLong && currShort > currLong) {
      crossover.push('bullish');
    } else if (prevShort >= prevLong && currShort < currLong) {
      crossover.push('bearish');
    } else {
      crossover.push('none');
    }
  }

  return { shortMA: alignedShort, longMA, crossover };
}

// ============================================================
// RSI
// ============================================================

export interface RSIResult {
  values: number[];
  overbought: boolean;
  oversold: boolean;
  current: number;
}

export function calculateRSI(candles: Candle[], period: number = 14): RSIResult {
  const closes = candles.map(c => c.close);
  const values = RSI.calculate({ period, values: closes });
  const current = values[values.length - 1] || 50;

  return {
    values,
    overbought: current >= 70,
    oversold: current <= 30,
    current,
  };
}

// ============================================================
// MACD
// ============================================================

export interface MACDResult {
  macd: number[];
  signal: number[];
  histogram: number[];
  crossover: ('bullish' | 'bearish' | 'none');
  currentMACD: number;
  currentSignal: number;
  currentHistogram: number;
}

export function calculateMACD(
  candles: Candle[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9,
): MACDResult {
  const closes = candles.map(c => c.close);
  const result = MACD.calculate({
    fastPeriod,
    slowPeriod,
    signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
    values: closes,
  });

  const macdValues = result.map(r => r.MACD ?? 0);
  const signalValues = result.map(r => r.signal ?? 0);
  const histogramValues = result.map(r => r.histogram ?? 0);

  const len = result.length;
  let crossover: 'bullish' | 'bearish' | 'none' = 'none';

  if (len >= 2) {
    const prevHist = histogramValues[len - 2];
    const currHist = histogramValues[len - 1];
    if (prevHist <= 0 && currHist > 0) crossover = 'bullish';
    else if (prevHist >= 0 && currHist < 0) crossover = 'bearish';
  }

  return {
    macd: macdValues,
    signal: signalValues,
    histogram: histogramValues,
    crossover,
    currentMACD: macdValues[len - 1] || 0,
    currentSignal: signalValues[len - 1] || 0,
    currentHistogram: histogramValues[len - 1] || 0,
  };
}

// ============================================================
// Bollinger Bands
// ============================================================

export interface BollingerResult {
  upper: number[];
  middle: number[];
  lower: number[];
  currentUpper: number;
  currentMiddle: number;
  currentLower: number;
  bandwidth: number;
  percentB: number; // 0 = at lower band, 1 = at upper band
}

export function calculateBollinger(
  candles: Candle[],
  period: number = 20,
  stdDev: number = 2,
): BollingerResult {
  const closes = candles.map(c => c.close);
  const result = BollingerBands.calculate({ period, values: closes, stdDev });

  const upper = result.map(r => r.upper);
  const middle = result.map(r => r.middle);
  const lower = result.map(r => r.lower);

  const len = result.length;
  const currentUpper = upper[len - 1] || 0;
  const currentMiddle = middle[len - 1] || 0;
  const currentLower = lower[len - 1] || 0;
  const currentClose = closes[closes.length - 1];

  const bandwidth = currentMiddle !== 0 ? (currentUpper - currentLower) / currentMiddle : 0;
  const percentB = (currentUpper - currentLower) !== 0
    ? (currentClose - currentLower) / (currentUpper - currentLower)
    : 0.5;

  return {
    upper, middle, lower,
    currentUpper, currentMiddle, currentLower,
    bandwidth,
    percentB,
  };
}

// ============================================================
// ATR (Average True Range) - for risk management
// ============================================================

export function calculateATR(candles: Candle[], period: number = 14): number[] {
  const high = candles.map(c => c.high);
  const low = candles.map(c => c.low);
  const close = candles.map(c => c.close);
  return ATR.calculate({ period, high, low, close });
}
