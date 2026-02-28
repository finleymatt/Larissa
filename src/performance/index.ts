import { Position, PerformanceMetrics } from '../types';
import { formatCurrency } from '../utils/helpers';

export class PerformanceTracker {
  private trades: Position[] = [];
  private equityCurve: { timestamp: number; equity: number }[] = [];
  private peakEquity: number = 0;

  recordTrade(position: Position): void {
    this.trades.push(position);
  }

  recordEquity(timestamp: number, equity: number): void {
    this.equityCurve.push({ timestamp, equity });
    if (equity > this.peakEquity) {
      this.peakEquity = equity;
    }
  }

  getMetrics(): PerformanceMetrics {
    const closedTrades = this.trades.filter(t => t.status === 'closed');
    const totalTrades = closedTrades.length;

    if (totalTrades === 0) {
      return this.emptyMetrics();
    }

    const wins = closedTrades.filter(t => t.realizedPnl > 0);
    const losses = closedTrades.filter(t => t.realizedPnl <= 0);

    const winningTrades = wins.length;
    const losingTrades = losses.length;
    const winRate = winningTrades / totalTrades;

    const totalPnl = closedTrades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const averageWin = winningTrades > 0
      ? wins.reduce((sum, t) => sum + t.realizedPnl, 0) / winningTrades
      : 0;
    const averageLoss = losingTrades > 0
      ? losses.reduce((sum, t) => sum + t.realizedPnl, 0) / losingTrades
      : 0;

    const grossProfit = wins.reduce((sum, t) => sum + t.realizedPnl, 0);
    const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.realizedPnl, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Max drawdown
    const { maxDrawdown, maxDrawdownPercent } = this.calculateMaxDrawdown();

    // Sharpe and Sortino ratios
    const returns = closedTrades.map(t => t.realizedPnl);
    const sharpeRatio = this.calculateSharpeRatio(returns);
    const sortinoRatio = this.calculateSortinoRatio(returns);

    // Average holding period
    const holdingPeriods = closedTrades
      .filter(t => t.closedAt)
      .map(t => (t.closedAt! - t.openedAt));
    const averageHoldingPeriod = holdingPeriods.length > 0
      ? holdingPeriods.reduce((a, b) => a + b, 0) / holdingPeriods.length
      : 0;

    // Expectancy
    const expectancy = (winRate * averageWin) + ((1 - winRate) * averageLoss);

    // Consecutive wins/losses
    const { consecutiveWins, consecutiveLosses } = this.calculateConsecutive(closedTrades);

    return {
      totalTrades,
      winningTrades,
      losingTrades,
      winRate,
      totalPnl,
      averageWin,
      averageLoss,
      profitFactor,
      maxDrawdown,
      maxDrawdownPercent,
      sharpeRatio,
      sortinoRatio,
      averageHoldingPeriod,
      expectancy,
      consecutiveWins,
      consecutiveLosses,
    };
  }

  private calculateMaxDrawdown(): { maxDrawdown: number; maxDrawdownPercent: number } {
    if (this.equityCurve.length < 2) {
      return { maxDrawdown: 0, maxDrawdownPercent: 0 };
    }

    let peak = this.equityCurve[0].equity;
    let maxDrawdown = 0;
    let maxDrawdownPercent = 0;

    for (const point of this.equityCurve) {
      if (point.equity > peak) peak = point.equity;
      const drawdown = peak - point.equity;
      const drawdownPercent = peak > 0 ? drawdown / peak : 0;

      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
        maxDrawdownPercent = drawdownPercent;
      }
    }

    return { maxDrawdown, maxDrawdownPercent };
  }

  private calculateSharpeRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);
    const stdDev = Math.sqrt(variance);

    return stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0; // Annualized
  }

  private calculateSortinoRatio(returns: number[]): number {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const negativeReturns = returns.filter(r => r < 0);

    if (negativeReturns.length === 0) return mean > 0 ? Infinity : 0;

    const downVariance = negativeReturns.reduce(
      (sum, r) => sum + Math.pow(r, 2), 0,
    ) / negativeReturns.length;
    const downDev = Math.sqrt(downVariance);

    return downDev > 0 ? (mean / downDev) * Math.sqrt(252) : 0;
  }

  private calculateConsecutive(trades: Position[]): { consecutiveWins: number; consecutiveLosses: number } {
    let maxWins = 0;
    let maxLosses = 0;
    let currentWins = 0;
    let currentLosses = 0;

    for (const trade of trades) {
      if (trade.realizedPnl > 0) {
        currentWins++;
        currentLosses = 0;
        maxWins = Math.max(maxWins, currentWins);
      } else {
        currentLosses++;
        currentWins = 0;
        maxLosses = Math.max(maxLosses, currentLosses);
      }
    }

    return { consecutiveWins: maxWins, consecutiveLosses: maxLosses };
  }

  private emptyMetrics(): PerformanceMetrics {
    return {
      totalTrades: 0, winningTrades: 0, losingTrades: 0, winRate: 0,
      totalPnl: 0, averageWin: 0, averageLoss: 0, profitFactor: 0,
      maxDrawdown: 0, maxDrawdownPercent: 0, sharpeRatio: 0, sortinoRatio: 0,
      averageHoldingPeriod: 0, expectancy: 0, consecutiveWins: 0, consecutiveLosses: 0,
    };
  }

  formatSummary(metrics: PerformanceMetrics): string {
    return [
      `Total Trades: ${metrics.totalTrades}`,
      `Win Rate: ${(metrics.winRate * 100).toFixed(1)}%`,
      `Total PnL: ${formatCurrency(metrics.totalPnl)}`,
      `Avg Win: ${formatCurrency(metrics.averageWin)}`,
      `Avg Loss: ${formatCurrency(metrics.averageLoss)}`,
      `Profit Factor: ${metrics.profitFactor.toFixed(2)}`,
      `Max Drawdown: ${(metrics.maxDrawdownPercent * 100).toFixed(1)}%`,
      `Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`,
      `Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}`,
      `Expectancy: ${formatCurrency(metrics.expectancy)}`,
    ].join('\n');
  }

  getTrades(): Position[] {
    return [...this.trades];
  }

  getEquityCurve(): { timestamp: number; equity: number }[] {
    return [...this.equityCurve];
  }
}
