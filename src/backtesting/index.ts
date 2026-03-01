import {
  BacktestConfig, BacktestResult, Candle, Position,
  BrokerConnector, Timeframe, PerformanceMetrics,
} from '../types';
import { StrategyEngine } from '../strategies';
import { RiskManager } from '../risk';
import { PerformanceTracker } from '../performance';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

interface SimulatedPosition {
  id: string;
  instrument: string;
  side: 'buy' | 'sell';
  units: number;
  entryPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAt: number;
  strategy: string;
}

export class BacktestEngine {
  private connector: BrokerConnector;

  constructor(connector: BrokerConnector) {
    this.connector = connector;
  }

  async run(config: BacktestConfig): Promise<BacktestResult> {
    logger.info('Starting backtest...');
    logger.info(`Period: ${config.startDate} to ${config.endDate}`);
    logger.info(`Instruments: ${config.instruments.join(', ')}`);
    logger.info(`Initial Balance: $${config.initialBalance}`);

    const strategyEngine = new StrategyEngine(config.strategies);
    const riskManager = new RiskManager(config.riskConfig);
    const performanceTracker = new PerformanceTracker();

    let balance = config.initialBalance;
    const openPositions: SimulatedPosition[] = [];
    const closedTrades: Position[] = [];
    const equityCurve: { timestamp: number; equity: number }[] = [];

    // Fetch historical data for all instruments
    const historicalData: Map<string, Candle[]> = new Map();
    for (const instrument of config.instruments) {
      const candles = await this.connector.getCandlesRange(
        instrument,
        config.timeframe,
        config.startDate,
        config.endDate,
      );
      historicalData.set(instrument, candles);
      logger.info(`Loaded ${candles.length} candles for ${instrument}`);
    }

    // Determine simulation range from the first instrument
    const firstInstrumentCandles = historicalData.values().next().value as Candle[];
    if (!firstInstrumentCandles || firstInstrumentCandles.length < 200) {
      throw new Error('Not enough historical data for backtesting');
    }

    const lookback = 200; // Candles needed for indicator calculation

    // Iterate through candles
    for (let i = lookback; i < firstInstrumentCandles.length; i++) {
      const currentTimestamp = firstInstrumentCandles[i].timestamp;

      // Check SL/TP for open positions
      for (let p = openPositions.length - 1; p >= 0; p--) {
        const pos = openPositions[p];
        const candles = historicalData.get(pos.instrument);
        if (!candles) continue;

        const candle = candles[i];
        if (!candle) continue;

        let closedPrice: number | null = null;

        if (pos.side === 'buy') {
          if (candle.low <= pos.stopLoss) closedPrice = pos.stopLoss;
          else if (candle.high >= pos.takeProfit) closedPrice = pos.takeProfit;
        } else {
          if (candle.high >= pos.stopLoss) closedPrice = pos.stopLoss;
          else if (candle.low <= pos.takeProfit) closedPrice = pos.takeProfit;
        }

        if (closedPrice !== null) {
          const direction = pos.side === 'buy' ? 1 : -1;
          const pnl = (closedPrice - pos.entryPrice) * direction * pos.units;

          const closedPosition: Position = {
            id: pos.id,
            instrument: pos.instrument,
            side: pos.side,
            units: pos.units,
            entryPrice: pos.entryPrice,
            currentPrice: closedPrice,
            stopLoss: pos.stopLoss,
            takeProfit: pos.takeProfit,
            unrealizedPnl: 0,
            realizedPnl: pnl,
            status: 'closed',
            openedAt: pos.openedAt,
            closedAt: currentTimestamp,
            strategy: pos.strategy,
          };

          closedTrades.push(closedPosition);
          performanceTracker.recordTrade(closedPosition);
          balance += pnl;
          riskManager.updateDailyPnl(pnl);
          openPositions.splice(p, 1);
        }
      }

      // Evaluate signals for each instrument
      for (const instrument of config.instruments) {
        const allCandles = historicalData.get(instrument);
        if (!allCandles) continue;

        const windowCandles = allCandles.slice(i - lookback, i + 1);
        if (windowCandles.length < lookback) continue;

        const signal = strategyEngine.evaluate(windowCandles, instrument);

        if (signal.action === 'hold') continue;

        const currentCandle = allCandles[i];
        const currentPrice = currentCandle.close;

        // Build account info for risk assessment
        const accountInfo = {
          id: 'backtest',
          balance,
          unrealizedPnl: 0,
          realizedPnl: 0,
          marginUsed: 0,
          marginAvailable: balance,
          openPositionCount: openPositions.length,
          currency: 'USD',
        };

        const existingPositions: Position[] = openPositions.map(p => ({
          id: p.id,
          instrument: p.instrument,
          side: p.side,
          units: p.units,
          entryPrice: p.entryPrice,
          currentPrice: currentPrice,
          stopLoss: p.stopLoss,
          takeProfit: p.takeProfit,
          unrealizedPnl: 0,
          realizedPnl: 0,
          status: 'open' as const,
          openedAt: p.openedAt,
          strategy: p.strategy,
        }));

        const assessment = riskManager.assess(signal, accountInfo, existingPositions, currentPrice);

        if (!assessment.approved) continue;

        // Open position
        const newPosition: SimulatedPosition = {
          id: generateId(),
          instrument,
          side: signal.action as 'buy' | 'sell',
          units: assessment.positionSize,
          entryPrice: currentPrice,
          stopLoss: assessment.stopLoss,
          takeProfit: assessment.takeProfit,
          openedAt: currentTimestamp,
          strategy: signal.signals.map(s => s.strategy).join('+'),
        };

        openPositions.push(newPosition);
      }

      // Record equity
      let unrealizedPnl = 0;
      for (const pos of openPositions) {
        const candles = historicalData.get(pos.instrument);
        if (!candles || !candles[i]) continue;
        const direction = pos.side === 'buy' ? 1 : -1;
        unrealizedPnl += (candles[i].close - pos.entryPrice) * direction * pos.units;
      }

      equityCurve.push({
        timestamp: currentTimestamp,
        equity: balance + unrealizedPnl,
      });
      performanceTracker.recordEquity(currentTimestamp, balance + unrealizedPnl);
    }

    // Close any remaining open positions at last price
    for (const pos of openPositions) {
      const candles = historicalData.get(pos.instrument);
      if (!candles) continue;
      const lastCandle = candles[candles.length - 1];
      const direction = pos.side === 'buy' ? 1 : -1;
      const pnl = (lastCandle.close - pos.entryPrice) * direction * pos.units;

      const closedPosition: Position = {
        id: pos.id,
        instrument: pos.instrument,
        side: pos.side,
        units: pos.units,
        entryPrice: pos.entryPrice,
        currentPrice: lastCandle.close,
        stopLoss: pos.stopLoss,
        takeProfit: pos.takeProfit,
        unrealizedPnl: 0,
        realizedPnl: pnl,
        status: 'closed',
        openedAt: pos.openedAt,
        closedAt: lastCandle.timestamp,
        strategy: pos.strategy,
      };

      closedTrades.push(closedPosition);
      performanceTracker.recordTrade(closedPosition);
      balance += pnl;
    }

    const metrics = performanceTracker.getMetrics();
    const drawdownCurve = this.calculateDrawdownCurve(equityCurve);

    logger.info('Backtest complete!');
    logger.info(performanceTracker.formatSummary(metrics));

    return {
      config,
      trades: closedTrades,
      metrics,
      equityCurve,
      drawdownCurve,
    };
  }

  private calculateDrawdownCurve(
    equityCurve: { timestamp: number; equity: number }[],
  ): { timestamp: number; drawdown: number }[] {
    let peak = 0;
    return equityCurve.map(point => {
      if (point.equity > peak) peak = point.equity;
      const drawdown = peak > 0 ? (peak - point.equity) / peak : 0;
      return { timestamp: point.timestamp, drawdown };
    });
  }
}
