import { Candle, Signal, StrategyConfig, StrategyResult } from '../types';
import { calculateMACD } from '../indicators';

export function macdStrategy(
  candles: Candle[],
  instrument: string,
  config: StrategyConfig,
): StrategyResult {
  const fastPeriod = config.params.fastPeriod || 12;
  const slowPeriod = config.params.slowPeriod || 26;
  const signalPeriod = config.params.signalPeriod || 9;

  const result = calculateMACD(candles, fastPeriod, slowPeriod, signalPeriod);

  let action: Signal['action'] = 'hold';
  let confidence = 0;

  // Primary signal: histogram crossover
  if (result.crossover === 'bullish') {
    action = 'buy';
    confidence = 0.7;
  } else if (result.crossover === 'bearish') {
    action = 'sell';
    confidence = 0.7;
  }

  // Secondary: MACD line position relative to zero
  if (result.currentMACD > 0 && result.currentHistogram > 0) {
    if (action === 'hold') {
      action = 'buy';
      confidence = 0.3;
    } else if (action === 'buy') {
      confidence = Math.min(confidence + 0.15, 1);
    }
  } else if (result.currentMACD < 0 && result.currentHistogram < 0) {
    if (action === 'hold') {
      action = 'sell';
      confidence = 0.3;
    } else if (action === 'sell') {
      confidence = Math.min(confidence + 0.15, 1);
    }
  }

  // Histogram momentum: growing or shrinking
  const histLen = result.histogram.length;
  if (histLen >= 3) {
    const h1 = result.histogram[histLen - 3];
    const h2 = result.histogram[histLen - 2];
    const h3 = result.histogram[histLen - 1];

    // Accelerating momentum
    if (h3 > h2 && h2 > h1 && h3 > 0) {
      if (action === 'buy') confidence = Math.min(confidence + 0.1, 1);
    } else if (h3 < h2 && h2 < h1 && h3 < 0) {
      if (action === 'sell') confidence = Math.min(confidence + 0.1, 1);
    }
  }

  return {
    signal: {
      action,
      confidence,
      strategy: 'macd',
      instrument,
      timestamp: Date.now(),
      metadata: {
        macd: result.currentMACD,
        signal: result.currentSignal,
        histogram: result.currentHistogram,
      },
    },
    indicators: {
      macd: result.macd,
      signal: result.signal,
      histogram: result.histogram,
    },
  };
}
