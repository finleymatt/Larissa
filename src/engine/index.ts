import { BotConfig, BrokerConnector, Position, CompositeSignal } from '../types';
import { StrategyEngine } from '../strategies';
import { RiskManager } from '../risk';
import { PerformanceTracker } from '../performance';
import { NotificationService } from '../notifications';
import { logger } from '../utils/logger';
import { sleep } from '../utils/helpers';
import { PaperConnector } from '../connectors/paper';

export class TradingEngine {
  private config: BotConfig;
  private connector: BrokerConnector;
  private strategyEngine: StrategyEngine;
  private riskManager: RiskManager;
  private performanceTracker: PerformanceTracker;
  private notifications: NotificationService;
  private running: boolean = false;
  private tickInterval: number = 60000; // 1 minute default

  constructor(
    config: BotConfig,
    connector: BrokerConnector,
    notifications: NotificationService,
  ) {
    this.config = config;
    this.connector = connector;
    this.strategyEngine = new StrategyEngine(config.strategies);
    this.riskManager = new RiskManager(config.risk);
    this.performanceTracker = new PerformanceTracker();
    this.notifications = notifications;

    // Set tick interval based on timeframe
    const intervals: Record<string, number> = {
      M1: 60000, M5: 300000, M15: 900000, M30: 1800000,
      H1: 3600000, H4: 14400000, D: 86400000, W: 604800000,
    };
    this.tickInterval = intervals[config.timeframe] || 60000;
  }

  async start(): Promise<void> {
    this.running = true;
    logger.info(`Trading engine started in ${this.config.mode} mode`);
    logger.info(`Instruments: ${this.config.instruments.join(', ')}`);
    logger.info(`Timeframe: ${this.config.timeframe}`);
    logger.info(`Tick interval: ${this.tickInterval / 1000}s`);

    await this.notifications.send({
      type: 'signal',
      title: 'Trading Bot Started',
      message: `Mode: ${this.config.mode} | Instruments: ${this.config.instruments.join(', ')}`,
      timestamp: Date.now(),
    });

    while (this.running) {
      try {
        await this.tick();
      } catch (error: any) {
        logger.error(`Tick error: ${error.message}`);
        await this.notifications.send({
          type: 'error',
          title: 'Trading Error',
          message: error.message,
          timestamp: Date.now(),
        });
      }

      if (this.running) {
        await sleep(this.tickInterval);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info('Trading engine stopping...');

    // Send daily summary
    const metrics = this.performanceTracker.getMetrics();
    await this.notifications.send({
      type: 'daily_summary',
      title: 'Trading Session Summary',
      message: this.performanceTracker.formatSummary(metrics),
      timestamp: Date.now(),
      data: metrics as unknown as Record<string, unknown>,
    });

    logger.info('Trading engine stopped');
  }

  private async tick(): Promise<void> {
    const account = await this.connector.getAccount();
    const openPositions = await this.connector.getOpenPositions();

    // Check SL/TP for paper trading
    if (this.connector instanceof PaperConnector) {
      const closed = await this.connector.checkStopLossTakeProfit();
      for (const pos of closed) {
        this.riskManager.updateDailyPnl(pos.realizedPnl);
        this.performanceTracker.recordTrade(pos);
        await this.notifications.send({
          type: 'trade_closed',
          title: `Position Closed: ${pos.instrument}`,
          message: `${pos.side.toUpperCase()} ${pos.units} @ ${pos.currentPrice} | PnL: ${pos.realizedPnl.toFixed(2)}`,
          timestamp: Date.now(),
        });
      }
    }

    // Evaluate each instrument
    for (const instrument of this.config.instruments) {
      try {
        await this.evaluateInstrument(instrument, account, openPositions);
      } catch (error: any) {
        logger.error(`Error evaluating ${instrument}: ${error.message}`);
      }
    }
  }

  private async evaluateInstrument(
    instrument: string,
    account: any,
    openPositions: Position[],
  ): Promise<void> {
    // Fetch candles for analysis
    const candles = await this.connector.getCandles(instrument, this.config.timeframe, 200);

    if (candles.length < 50) {
      logger.warn(`Not enough candles for ${instrument}: ${candles.length}`);
      return;
    }

    // Run strategy engine
    const signal = this.strategyEngine.evaluate(candles, instrument);

    if (signal.action === 'hold') return;

    // Get current price
    const tick = await this.connector.getCurrentPrice(instrument);
    const currentPrice = signal.action === 'buy' ? tick.ask : tick.bid;

    // Risk assessment
    const assessment = this.riskManager.assess(signal, account, openPositions, currentPrice);

    if (!assessment.approved) {
      logger.debug(`Trade rejected for ${instrument}: ${assessment.reason}`);
      return;
    }

    // Place order
    if (this.config.mode === 'live') {
      logger.warn(`LIVE ORDER: ${signal.action} ${assessment.positionSize} ${instrument}`);
    }

    const order = await this.connector.placeOrder({
      instrument,
      side: signal.action as 'buy' | 'sell',
      type: 'market',
      units: assessment.positionSize,
      stopLoss: assessment.stopLoss,
      takeProfit: assessment.takeProfit,
    });

    if (order.status === 'filled') {
      await this.notifications.send({
        type: 'trade_opened',
        title: `New Trade: ${instrument}`,
        message: `${signal.action.toUpperCase()} ${assessment.positionSize} @ ${order.filledPrice} ` +
          `| SL: ${assessment.stopLoss.toFixed(2)} | TP: ${assessment.takeProfit.toFixed(2)} ` +
          `| Confidence: ${(signal.confidence * 100).toFixed(0)}%`,
        timestamp: Date.now(),
        data: {
          instrument,
          side: signal.action,
          units: assessment.positionSize,
          price: order.filledPrice,
          stopLoss: assessment.stopLoss,
          takeProfit: assessment.takeProfit,
          signals: signal.signals.map(s => ({
            strategy: s.strategy,
            action: s.action,
            confidence: s.confidence,
          })),
        } as any,
      });
    }
  }

  getPerformanceTracker(): PerformanceTracker {
    return this.performanceTracker;
  }

  getRiskManager(): RiskManager {
    return this.riskManager;
  }

  isRunning(): boolean {
    return this.running;
  }
}
