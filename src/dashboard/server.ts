import express from 'express';
import path from 'path';
import { PerformanceTracker } from '../performance';
import { RiskManager } from '../risk';
import { BrokerConnector, BacktestResult } from '../types';
import { logger } from '../utils/logger';

export class DashboardServer {
  private app: express.Application;
  private port: number;
  private performanceTracker: PerformanceTracker;
  private riskManager: RiskManager;
  private connector: BrokerConnector;
  private backtestResults: BacktestResult | null = null;

  constructor(
    port: number,
    performanceTracker: PerformanceTracker,
    riskManager: RiskManager,
    connector: BrokerConnector,
  ) {
    this.port = port;
    this.performanceTracker = performanceTracker;
    this.riskManager = riskManager;
    this.connector = connector;
    this.app = express();
    this.setupRoutes();
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Serve dashboard HTML
    this.app.get('/', (_req, res) => {
      res.send(this.getDashboardHtml());
    });

    // API endpoints
    this.app.get('/api/account', async (_req, res) => {
      try {
        const account = await this.connector.getAccount();
        res.json(account);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/positions', async (_req, res) => {
      try {
        const positions = await this.connector.getOpenPositions();
        res.json(positions);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/api/performance', (_req, res) => {
      const metrics = this.performanceTracker.getMetrics();
      res.json(metrics);
    });

    this.app.get('/api/trades', (_req, res) => {
      const trades = this.performanceTracker.getTrades();
      res.json(trades);
    });

    this.app.get('/api/equity', (_req, res) => {
      const curve = this.performanceTracker.getEquityCurve();
      res.json(curve);
    });

    this.app.get('/api/daily-pnl', (_req, res) => {
      res.json({ dailyPnl: this.riskManager.getDailyPnl() });
    });

    this.app.get('/api/backtest', (_req, res) => {
      if (this.backtestResults) {
        res.json(this.backtestResults);
      } else {
        res.status(404).json({ error: 'No backtest results available' });
      }
    });
  }

  setBacktestResults(results: BacktestResult): void {
    this.backtestResults = results;
  }

  start(): void {
    this.app.listen(this.port, () => {
      logger.info(`Dashboard running at http://localhost:${this.port}`);
    });
  }

  private getDashboardHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Larissa Trading Bot - Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f1923; color: #e0e0e0; }
    .header { background: #1a2332; padding: 20px 30px; border-bottom: 2px solid #2196F3; display: flex; justify-content: space-between; align-items: center; }
    .header h1 { font-size: 24px; color: #2196F3; }
    .header .status { padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .status.active { background: rgba(76,175,80,0.2); color: #4CAF50; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card { background: #1a2332; border-radius: 8px; padding: 20px; border: 1px solid #2a3a4a; }
    .card h3 { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
    .card .value { font-size: 28px; font-weight: 700; }
    .card .value.positive { color: #4CAF50; }
    .card .value.negative { color: #f44336; }
    .card .sub { color: #666; font-size: 13px; margin-top: 4px; }
    .table-card { grid-column: 1 / -1; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th { text-align: left; padding: 10px 12px; color: #888; font-size: 12px; text-transform: uppercase; border-bottom: 1px solid #2a3a4a; }
    td { padding: 10px 12px; border-bottom: 1px solid #1e2d3d; font-size: 14px; }
    .buy { color: #4CAF50; } .sell { color: #f44336; }
    .chart-placeholder { height: 200px; background: #0f1923; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #555; margin-top: 12px; font-size: 14px; }
    .refresh-btn { background: #2196F3; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-size: 14px; }
    .refresh-btn:hover { background: #1976D2; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Larissa Trading Bot</h1>
    <div>
      <span class="status active" id="status">Loading...</span>
      <button class="refresh-btn" onclick="loadAll()">Refresh</button>
    </div>
  </div>
  <div class="container">
    <div class="grid" id="metrics-grid"></div>
    <div class="grid">
      <div class="card table-card">
        <h3>Open Positions</h3>
        <table>
          <thead><tr><th>Instrument</th><th>Side</th><th>Units</th><th>Entry</th><th>Current</th><th>P&L</th></tr></thead>
          <tbody id="positions-body"><tr><td colspan="6">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="grid">
      <div class="card table-card">
        <h3>Recent Trades</h3>
        <table>
          <thead><tr><th>Instrument</th><th>Side</th><th>Units</th><th>Entry</th><th>Exit</th><th>P&L</th><th>Date</th></tr></thead>
          <tbody id="trades-body"><tr><td colspan="7">Loading...</td></tr></tbody>
        </table>
      </div>
    </div>
    <div class="grid">
      <div class="card" style="grid-column: 1 / -1;">
        <h3>Equity Curve</h3>
        <div class="chart-placeholder" id="equity-chart">
          Equity curve data will appear here once trades are recorded.
        </div>
      </div>
    </div>
  </div>
  <script>
    function fmt(n, d=2) { return typeof n === 'number' ? n.toFixed(d) : '-'; }
    function pnlClass(v) { return v >= 0 ? 'positive' : 'negative'; }

    async function fetchJson(url) {
      try { const r = await fetch(url); return await r.json(); } catch { return null; }
    }

    async function loadAll() {
      const [account, perf, positions, trades] = await Promise.all([
        fetchJson('/api/account'), fetchJson('/api/performance'),
        fetchJson('/api/positions'), fetchJson('/api/trades'),
      ]);

      if (account) {
        document.getElementById('status').textContent = 'Active';
      }

      const grid = document.getElementById('metrics-grid');
      grid.innerHTML = '';
      const cards = [
        { label: 'Balance', value: account ? '$' + fmt(account.balance) : '-', cls: '' },
        { label: 'Unrealized P&L', value: account ? '$' + fmt(account.unrealizedPnl) : '-', cls: account ? pnlClass(account.unrealizedPnl) : '' },
        { label: 'Total P&L', value: perf ? '$' + fmt(perf.totalPnl) : '-', cls: perf ? pnlClass(perf.totalPnl) : '' },
        { label: 'Win Rate', value: perf ? fmt(perf.winRate * 100, 1) + '%' : '-', cls: '' },
        { label: 'Total Trades', value: perf ? perf.totalTrades : '-', cls: '' },
        { label: 'Profit Factor', value: perf ? fmt(perf.profitFactor) : '-', cls: '' },
        { label: 'Max Drawdown', value: perf ? fmt(perf.maxDrawdownPercent * 100, 1) + '%' : '-', cls: 'negative' },
        { label: 'Sharpe Ratio', value: perf ? fmt(perf.sharpeRatio) : '-', cls: '' },
      ];
      for (const c of cards) {
        grid.innerHTML += '<div class="card"><h3>' + c.label + '</h3><div class="value ' + c.cls + '">' + c.value + '</div></div>';
      }

      const posBody = document.getElementById('positions-body');
      if (positions && positions.length) {
        posBody.innerHTML = positions.map(p =>
          '<tr><td>' + p.instrument + '</td><td class="' + p.side + '">' + p.side.toUpperCase() +
          '</td><td>' + p.units + '</td><td>' + fmt(p.entryPrice, 5) + '</td><td>' + fmt(p.currentPrice, 5) +
          '</td><td class="' + pnlClass(p.unrealizedPnl) + '">$' + fmt(p.unrealizedPnl) + '</td></tr>'
        ).join('');
      } else {
        posBody.innerHTML = '<tr><td colspan="6" style="color:#555">No open positions</td></tr>';
      }

      const trBody = document.getElementById('trades-body');
      if (trades && trades.length) {
        trBody.innerHTML = trades.slice(-20).reverse().map(t =>
          '<tr><td>' + t.instrument + '</td><td class="' + t.side + '">' + t.side.toUpperCase() +
          '</td><td>' + t.units + '</td><td>' + fmt(t.entryPrice, 5) + '</td><td>' + fmt(t.currentPrice, 5) +
          '</td><td class="' + pnlClass(t.realizedPnl) + '">$' + fmt(t.realizedPnl) +
          '</td><td>' + new Date(t.closedAt || t.openedAt).toLocaleString() + '</td></tr>'
        ).join('');
      } else {
        trBody.innerHTML = '<tr><td colspan="7" style="color:#555">No trades yet</td></tr>';
      }
    }

    loadAll();
    setInterval(loadAll, 30000);
  </script>
</body>
</html>`;
  }
}
