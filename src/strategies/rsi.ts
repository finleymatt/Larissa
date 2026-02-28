import { Candle, Signal, StrategyConfig, StrategyResult } from '../types';
import { calculateRSI } from '../indicators';

export function rsiStrategy(
  candles: Candle[],
  instrument: string,
  config: StrategyConfig,
): StrategyResult {
  const period = config.params.period || 14;
  const overbought = config.params.overbought || 70;
  const oversold = config.params.oversold || 30;

  const result = calculateRSI(candles, period);
  const currentRSI = result.current;

  let action: Signal['action'] = 'hold';
  let confidence = 0;

  if (currentRSI <= oversold) {
    // Oversold - potential buy signal
    action = 'buy';
    // More extreme = higher confidence
    confidence = Math.min((oversold - currentRSI) / oversold, 1);
    confidence = Math.max(confidence, 0.5);
  } else if (currentRSI >= overbought) {
    // Overbought - potential sell signal
    action = 'sell';
    confidence = Math.min((currentRSI - overbought) / (100 - overbought), 1);
    confidence = Math.max(confidence, 0.5);
  } else {
    // Neutral zone - slight directional bias
    if (currentRSI < 45) {
      action = 'buy';
      confidence = 0.2;
    } else if (currentRSI > 55) {
      action = 'sell';
      confidence = 0.2;
    }
  }

  // Check for RSI divergence (previous vs current)
  const values = result.values;
  if (values.length >= 2) {
    const prevRSI = values[values.length - 2];
    const prevClose = candles[candles.length - 2].close;
    const currClose = candles[candles.length - 1].close;

    // Bullish divergence: price makes lower low but RSI makes higher low
    if (currClose < prevClose && currentRSI > prevRSI && currentRSI < 50) {
      action = 'buy';
      confidence = Math.max(confidence, 0.7);
    }
    // Bearish divergence: price makes higher high but RSI makes lower high
    if (currClose > prevClose && currentRSI < prevRSI && currentRSI > 50) {
      action = 'sell';
      confidence = Math.max(confidence, 0.7);
    }
  }

  return {
    signal: {
      action,
      confidence,
      strategy: 'rsi',
      instrument,
      timestamp: Date.now(),
      metadata: { rsi: currentRSI },
    },
    indicators: {
      rsi: result.values,
    },
  };
}
