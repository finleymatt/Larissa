import { Command } from 'commander';
import { loadConfig } from './config';
import { OandaConnector } from './connectors/oanda';
import { PaperConnector } from './connectors/paper';
import { TradingEngine } from './engine';
import { BacktestEngine } from './backtesting';
import { NotificationService } from './notifications';
import { DashboardServer } from './dashboard/server';
import { PerformanceTracker } from './performance';
import { RiskManager } from './risk';
import { createLogger, logger } from './utils/logger';
import { BrokerConnector, TradingMode, Timeframe } from './types';

const program = new Command();

program
  .name('larissa')
  .description('Larissa Forex Trading Bot - Multi-strategy trading with backtesting and analytics')
  .version('1.0.0');

program
  .command('trade')
  .description('Start live or paper trading')
  .option('-m, --mode <mode>', 'Trading mode: paper or live', 'paper')
  .option('-i, --instruments <pairs>', 'Comma-separated currency pairs', 'EUR_USD,GBP_USD')
  .option('-t, --timeframe <tf>', 'Candle timeframe', 'H1')
  .option('-d, --dashboard', 'Enable dashboard', false)
  .action(async (options) => {
    const config = loadConfig({
      mode: options.mode as TradingMode,
      instruments: options.instruments.split(','),
      timeframe: options.timeframe as Timeframe,
    });

    if (config.mode === 'live' && !config.oanda.apiKey) {
      logger.error('OANDA_API_KEY is required for live trading. Set it in .env');
      process.exit(1);
    }

    const oandaConnector = new OandaConnector(
      config.oanda.apiKey,
      config.oanda.accountId,
      config.oanda.apiUrl,
    );

    let connector: BrokerConnector;
    if (config.mode === 'paper') {
      connector = new PaperConnector(10000, oandaConnector);
      logger.info('Starting in PAPER trading mode with $10,000 virtual balance');
    } else {
      connector = oandaConnector;
      logger.warn('Starting in LIVE trading mode - real money at risk!');
    }

    const notifications = new NotificationService(config.alerts);
    const engine = new TradingEngine(config, connector, notifications);

    if (options.dashboard) {
      const dashboard = new DashboardServer(
        config.dashboardPort,
        engine.getPerformanceTracker(),
        engine.getRiskManager(),
        connector,
      );
      dashboard.start();
    }

    // Graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down...');
      await engine.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    await engine.start();
  });

program
  .command('backtest')
  .description('Run a backtest on historical data')
  .requiredOption('-s, --start <date>', 'Start date (YYYY-MM-DD)')
  .requiredOption('-e, --end <date>', 'End date (YYYY-MM-DD)')
  .option('-i, --instruments <pairs>', 'Comma-separated currency pairs', 'EUR_USD')
  .option('-t, --timeframe <tf>', 'Candle timeframe', 'H1')
  .option('-b, --balance <amount>', 'Initial balance', '10000')
  .option('-d, --dashboard', 'Show results in dashboard', false)
  .action(async (options) => {
    const config = loadConfig();

    if (!config.oanda.apiKey) {
      logger.error('OANDA_API_KEY is required for fetching historical data. Set it in .env');
      process.exit(1);
    }

    const oandaConnector = new OandaConnector(
      config.oanda.apiKey,
      config.oanda.accountId,
      config.oanda.apiUrl,
    );

    const backtestEngine = new BacktestEngine(oandaConnector);

    const result = await backtestEngine.run({
      startDate: options.start,
      endDate: options.end,
      instruments: options.instruments.split(','),
      timeframe: options.timeframe as Timeframe,
      initialBalance: parseFloat(options.balance),
      strategies: config.strategies,
      riskConfig: config.risk,
    });

    // Print results
    console.log('\n========================================');
    console.log('         BACKTEST RESULTS');
    console.log('========================================\n');

    const m = result.metrics;
    console.log(`Total Trades:      ${m.totalTrades}`);
    console.log(`Winning Trades:    ${m.winningTrades}`);
    console.log(`Losing Trades:     ${m.losingTrades}`);
    console.log(`Win Rate:          ${(m.winRate * 100).toFixed(1)}%`);
    console.log(`Total P&L:         $${m.totalPnl.toFixed(2)}`);
    console.log(`Avg Win:           $${m.averageWin.toFixed(2)}`);
    console.log(`Avg Loss:          $${m.averageLoss.toFixed(2)}`);
    console.log(`Profit Factor:     ${m.profitFactor.toFixed(2)}`);
    console.log(`Max Drawdown:      ${(m.maxDrawdownPercent * 100).toFixed(1)}%`);
    console.log(`Sharpe Ratio:      ${m.sharpeRatio.toFixed(2)}`);
    console.log(`Sortino Ratio:     ${m.sortinoRatio.toFixed(2)}`);
    console.log(`Expectancy:        $${m.expectancy.toFixed(2)}`);
    console.log(`Consecutive Wins:  ${m.consecutiveWins}`);
    console.log(`Consecutive Losses:${m.consecutiveLosses}`);
    console.log('\n========================================\n');

    if (options.dashboard) {
      const performanceTracker = new PerformanceTracker();
      const riskManager = new RiskManager(config.risk);

      // Populate tracker with backtest data
      for (const trade of result.trades) {
        performanceTracker.recordTrade(trade);
      }
      for (const point of result.equityCurve) {
        performanceTracker.recordEquity(point.timestamp, point.equity);
      }

      const dashboard = new DashboardServer(
        config.dashboardPort,
        performanceTracker,
        riskManager,
        oandaConnector,
      );
      dashboard.setBacktestResults(result);
      dashboard.start();

      logger.info(`Backtest dashboard at http://localhost:${config.dashboardPort}`);
      logger.info('Press Ctrl+C to exit');

      // Keep process alive
      await new Promise(() => {});
    }
  });

program
  .command('dashboard')
  .description('Start the dashboard server (view-only)')
  .option('-p, --port <port>', 'Dashboard port', '3000')
  .action(async (options) => {
    const config = loadConfig({ dashboardPort: parseInt(options.port, 10) });

    const oandaConnector = new OandaConnector(
      config.oanda.apiKey,
      config.oanda.accountId,
      config.oanda.apiUrl,
    );

    const performanceTracker = new PerformanceTracker();
    const riskManager = new RiskManager(config.risk);

    const dashboard = new DashboardServer(
      config.dashboardPort,
      performanceTracker,
      riskManager,
      oandaConnector,
    );
    dashboard.start();
  });

program.parse(process.argv);
