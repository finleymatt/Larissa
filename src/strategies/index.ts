import { Candle, StrategyConfig, StrategyResult, CompositeSignal, SignalAction } from '../types';
import { maCrossoverStrategy } from './ma-crossover';
import { rsiStrategy } from './rsi';
import { macdStrategy } from './macd';
import { bollingerStrategy } from './bollinger';
import { logger } from '../utils/logger';

type StrategyFunction = (
  candles: Candle[],
  instrument: string,
  config: StrategyConfig,
) => StrategyResult;

const STRATEGY_MAP: Record<string, StrategyFunction> = {
  ma_crossover: maCrossoverStrategy,
  rsi: rsiStrategy,
  macd: macdStrategy,
  bollinger: bollingerStrategy,
};

/**
 * Multi-strategy engine that combines signals from multiple strategies
 * using configurable weights to produce a composite trading signal.
 */
export class StrategyEngine {
  private strategies: StrategyConfig[];

  constructor(strategies: StrategyConfig[]) {
    this.strategies = strategies;
    this.validateWeights();
  }

  private validateWeights(): void {
    const enabledStrategies = this.strategies.filter(s => s.enabled);
    const totalWeight = enabledStrategies.reduce((sum, s) => sum + s.weight, 0);

    if (Math.abs(totalWeight - 1.0) > 0.01) {
      logger.warn(`Strategy weights sum to ${totalWeight}, normalizing to 1.0`);
      const factor = 1.0 / totalWeight;
      enabledStrategies.forEach(s => { s.weight *= factor; });
    }
  }

  evaluate(candles: Candle[], instrument: string): CompositeSignal {
    const results: StrategyResult[] = [];
    const enabledStrategies = this.strategies.filter(s => s.enabled);

    for (const stratConfig of enabledStrategies) {
      const strategyFn = STRATEGY_MAP[stratConfig.name];
      if (!strategyFn) {
        logger.warn(`Unknown strategy: ${stratConfig.name}`);
        continue;
      }

      try {
        const result = strategyFn(candles, instrument, stratConfig);
        results.push(result);
        logger.debug(
          `${stratConfig.name}: ${result.signal.action} (confidence: ${result.signal.confidence.toFixed(2)})`,
        );
      } catch (error: any) {
        logger.error(`Strategy ${stratConfig.name} failed: ${error.message}`);
      }
    }

    return this.combineSignals(results, enabledStrategies, instrument);
  }

  private combineSignals(
    results: StrategyResult[],
    configs: StrategyConfig[],
    instrument: string,
  ): CompositeSignal {
    if (results.length === 0) {
      return {
        action: 'hold',
        confidence: 0,
        signals: [],
        instrument,
        timestamp: Date.now(),
      };
    }

    // Calculate weighted score for each action
    const scores: Record<SignalAction, number> = { buy: 0, sell: 0, hold: 0 };

    for (let i = 0; i < results.length; i++) {
      const signal = results[i].signal;
      const config = configs.find(c => c.name === signal.strategy);
      const weight = config?.weight || 0;

      scores[signal.action] += signal.confidence * weight;
    }

    // Determine the winning action
    let bestAction: SignalAction = 'hold';
    let bestScore = 0;

    for (const [action, score] of Object.entries(scores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAction = action as SignalAction;
      }
    }

    // If buy and sell signals are nearly equal, hold
    if (
      Math.abs(scores.buy - scores.sell) < 0.1 &&
      scores.buy > 0.1 &&
      scores.sell > 0.1
    ) {
      bestAction = 'hold';
      bestScore = 0;
    }

    // Minimum confidence threshold
    const confidenceThreshold = 0.3;
    if (bestScore < confidenceThreshold && bestAction !== 'hold') {
      logger.debug(`Composite signal below threshold (${bestScore.toFixed(2)} < ${confidenceThreshold}), holding`);
      bestAction = 'hold';
    }

    const signals = results.map(r => r.signal);

    logger.info(
      `[${instrument}] Composite: ${bestAction.toUpperCase()} ` +
      `(confidence: ${bestScore.toFixed(2)}) ` +
      `[buy: ${scores.buy.toFixed(2)}, sell: ${scores.sell.toFixed(2)}, hold: ${scores.hold.toFixed(2)}]`,
    );

    return {
      action: bestAction,
      confidence: bestScore,
      signals,
      instrument,
      timestamp: Date.now(),
    };
  }

  updateWeights(newWeights: Record<string, number>): void {
    for (const strategy of this.strategies) {
      if (newWeights[strategy.name] !== undefined) {
        strategy.weight = newWeights[strategy.name];
      }
    }
    this.validateWeights();
  }
}

export { maCrossoverStrategy, rsiStrategy, macdStrategy, bollingerStrategy };
