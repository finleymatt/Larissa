import { Candle, Signal, StrategyConfig, StrategyResult } from '../types';
import { calculateBollinger } from '../indicators';

export function bollingerStrategy(
  candles: Candle[],
  instrument: string,
  config: StrategyConfig,
): StrategyResult {
  const period = config.params.period || 20;
  const stdDev = config.params.stdDev || 2;

  const result = calculateBollinger(candles, period, stdDev);
  const currentClose = candles[candles.length - 1].close;
  const prevClose = candles[candles.length - 2]?.close || currentClose;

  let action: Signal['action'] = 'hold';
  let confidence = 0;

  // Mean reversion strategy using %B
  if (result.percentB <= 0) {
    // Price at or below lower band - buy signal
    action = 'buy';
    confidence = Math.min(Math.abs(result.percentB) + 0.6, 1);
  } else if (result.percentB >= 1) {
    // Price at or above upper band - sell signal
    action = 'sell';
    confidence = Math.min((result.percentB - 1) + 0.6, 1);
  } else if (result.percentB < 0.2) {
    // Near lower band
    action = 'buy';
    confidence = 0.4;
  } else if (result.percentB > 0.8) {
    // Near upper band
    action = 'sell';
    confidence = 0.4;
  }

  // Bollinger squeeze: low bandwidth indicates upcoming volatility
  if (result.bandwidth < 0.02) {
    // Squeeze detected - prepare for breakout
    // Direction from price action
    if (currentClose > result.currentMiddle) {
      if (action === 'hold') action = 'buy';
      confidence = Math.max(confidence, 0.5);
    } else {
      if (action === 'hold') action = 'sell';
      confidence = Math.max(confidence, 0.5);
    }
  }

  // Bounce off middle band (trend continuation)
  if (
    Math.abs(currentClose - result.currentMiddle) / result.currentMiddle < 0.001
  ) {
    if (prevClose > result.currentMiddle && currentClose > result.currentMiddle) {
      action = 'buy';
      confidence = Math.max(confidence, 0.35);
    } else if (prevClose < result.currentMiddle && currentClose < result.currentMiddle) {
      action = 'sell';
      confidence = Math.max(confidence, 0.35);
    }
  }

  return {
    signal: {
      action,
      confidence,
      strategy: 'bollinger',
      instrument,
      timestamp: Date.now(),
      metadata: {
        upper: result.currentUpper,
        middle: result.currentMiddle,
        lower: result.currentLower,
        percentB: result.percentB,
        bandwidth: result.bandwidth,
      },
    },
    indicators: {
      upper: result.upper,
      middle: result.middle,
      lower: result.lower,
    },
  };
}
