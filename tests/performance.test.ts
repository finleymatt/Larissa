import { PerformanceTracker } from '../src/performance';
import { Position } from '../src/types';

describe('PerformanceTracker', () => {
  function makeClosedTrade(pnl: number, instrument: string = 'EUR_USD'): Position {
    const now = Date.now();
    return {
      id: `trade-${Math.random()}`,
      instrument,
      side: pnl > 0 ? 'buy' : 'sell',
      units: 1000,
      entryPrice: 1.1,
      currentPrice: 1.1 + pnl / 1000,
      unrealizedPnl: 0,
      realizedPnl: pnl,
      status: 'closed',
      openedAt: now - 3600000,
      closedAt: now,
      strategy: 'test',
    };
  }

  it('should return empty metrics with no trades', () => {
    const tracker = new PerformanceTracker();
    const metrics = tracker.getMetrics();
    expect(metrics.totalTrades).toBe(0);
    expect(metrics.winRate).toBe(0);
    expect(metrics.totalPnl).toBe(0);
  });

  it('should calculate win rate correctly', () => {
    const tracker = new PerformanceTracker();
    tracker.recordTrade(makeClosedTrade(100));
    tracker.recordTrade(makeClosedTrade(50));
    tracker.recordTrade(makeClosedTrade(-30));
    tracker.recordTrade(makeClosedTrade(80));

    const metrics = tracker.getMetrics();
    expect(metrics.totalTrades).toBe(4);
    expect(metrics.winningTrades).toBe(3);
    expect(metrics.losingTrades).toBe(1);
    expect(metrics.winRate).toBeCloseTo(0.75);
  });

  it('should calculate total PnL', () => {
    const tracker = new PerformanceTracker();
    tracker.recordTrade(makeClosedTrade(100));
    tracker.recordTrade(makeClosedTrade(-50));
    tracker.recordTrade(makeClosedTrade(200));

    const metrics = tracker.getMetrics();
    expect(metrics.totalPnl).toBeCloseTo(250);
  });

  it('should calculate profit factor', () => {
    const tracker = new PerformanceTracker();
    tracker.recordTrade(makeClosedTrade(100));
    tracker.recordTrade(makeClosedTrade(200));
    tracker.recordTrade(makeClosedTrade(-100));

    const metrics = tracker.getMetrics();
    // Profit factor = gross profit / gross loss = 300 / 100 = 3
    expect(metrics.profitFactor).toBeCloseTo(3);
  });

  it('should calculate max drawdown', () => {
    const tracker = new PerformanceTracker();

    // Need at least one trade for getMetrics to calculate drawdown
    tracker.recordTrade(makeClosedTrade(100));

    // Simulate equity curve with a drawdown
    tracker.recordEquity(1, 10000);
    tracker.recordEquity(2, 10500); // peak
    tracker.recordEquity(3, 10200);
    tracker.recordEquity(4, 9800);  // trough
    tracker.recordEquity(5, 10300);

    const metrics = tracker.getMetrics();
    // Max drawdown from peak of 10500 to trough of 9800 = 700
    expect(metrics.maxDrawdown).toBeCloseTo(700);
    expect(metrics.maxDrawdownPercent).toBeCloseTo(700 / 10500, 2);
  });

  it('should track consecutive wins and losses', () => {
    const tracker = new PerformanceTracker();
    tracker.recordTrade(makeClosedTrade(50));
    tracker.recordTrade(makeClosedTrade(30));
    tracker.recordTrade(makeClosedTrade(80));
    tracker.recordTrade(makeClosedTrade(-20));
    tracker.recordTrade(makeClosedTrade(-40));

    const metrics = tracker.getMetrics();
    expect(metrics.consecutiveWins).toBe(3);
    expect(metrics.consecutiveLosses).toBe(2);
  });

  it('should format summary string', () => {
    const tracker = new PerformanceTracker();
    tracker.recordTrade(makeClosedTrade(100));
    tracker.recordTrade(makeClosedTrade(-50));

    const metrics = tracker.getMetrics();
    const summary = tracker.formatSummary(metrics);

    expect(summary).toContain('Total Trades: 2');
    expect(summary).toContain('Win Rate');
  });
});
