import { Candle, Signal, StrategyConfig, StrategyResult } from '../types';
import { calculateMACrossover, calculateEMA } from '../indicators';

export function maCrossoverStrategy(
  candles: Candle[],
  instrument: string,
  config: StrategyConfig,
): StrategyResult {
  const shortPeriod = config.params.shortPeriod || 10;
  const longPeriod = config.params.longPeriod || 50;

  const result = calculateMACrossover(candles, shortPeriod, longPeriod);
  const lastCrossover = result.crossover[result.crossover.length - 1];
  const prevCrossover = result.crossover[result.crossover.length - 2];

  const lastShort = result.shortMA[result.shortMA.length - 1];
  const lastLong = result.longMA[result.longMA.length - 1];

  // Calculate confidence based on MA separation
  const maSeparation = Math.abs(lastShort - lastLong) / lastLong;
  let confidence = Math.min(maSeparation * 100, 1); // Normalize to 0-1

  let action: Signal['action'] = 'hold';

  if (lastCrossover === 'bullish') {
    action = 'buy';
    confidence = Math.max(confidence, 0.6);
  } else if (lastCrossover === 'bearish') {
    action = 'sell';
    confidence = Math.max(confidence, 0.6);
  } else {
    // Trend strength even without crossover
    if (lastShort > lastLong) {
      action = 'buy';
      confidence *= 0.5; // Lower confidence for trend continuation
    } else if (lastShort < lastLong) {
      action = 'sell';
      confidence *= 0.5;
    }
  }

  return {
    signal: {
      action,
      confidence,
      strategy: 'ma_crossover',
      instrument,
      timestamp: Date.now(),
      metadata: { shortMA: lastShort, longMA: lastLong },
    },
    indicators: {
      shortMA: result.shortMA,
      longMA: result.longMA,
    },
  };
}
