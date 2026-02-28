# Larissa Forex Trading Bot

A full-suite TypeScript Forex trading bot featuring multi-strategy signal analysis, paper and live trading, backtesting on historical data, a real-time performance dashboard, and configurable alerts.

## Features

- **Multi-Strategy Engine** — Combines Moving Average Crossover, RSI, MACD, and Bollinger Bands with configurable weights
- **Paper & Live Trading** — Practice with simulated funds or trade real money via OANDA
- **Backtesting** — Test strategies against historical data with full performance metrics
- **Risk Management** — Per-trade risk limits, max positions, daily loss caps, automatic stop-loss/take-profit
- **Performance Dashboard** — Real-time web dashboard with account metrics, open positions, trade history, and equity curve
- **Notifications** — Email (SMTP) and webhook (Slack) alerts for trades, signals, and errors

## Quick Start

```bash
# Install dependencies
npm install

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your OANDA API key and preferences

# Run in paper trading mode
npm run paper

# Run with dashboard enabled
npx ts-node src/index.ts trade --mode paper --dashboard

# Backtest a strategy
npx ts-node src/index.ts backtest --start 2024-01-01 --end 2024-12-31 --instruments EUR_USD --dashboard

# Run tests
npm test
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── types/                # TypeScript interfaces and types
├── config/               # Environment-based configuration
├── connectors/
│   ├── oanda.ts          # OANDA REST API connector
│   └── paper.ts          # Paper trading simulator
├── indicators/           # Technical indicators (SMA, EMA, RSI, MACD, Bollinger, ATR)
├── strategies/
│   ├── index.ts          # Multi-strategy engine with weighted signal combination
│   ├── ma-crossover.ts   # Moving Average Crossover strategy
│   ├── rsi.ts            # RSI with divergence detection
│   ├── macd.ts           # MACD with histogram momentum
│   └── bollinger.ts      # Bollinger Bands mean-reversion
├── risk/                 # Risk management (position sizing, SL/TP, daily limits)
├── engine/               # Core trading loop
├── backtesting/          # Historical backtesting engine
├── performance/          # Trade tracking and metrics (Sharpe, Sortino, drawdown, etc.)
├── dashboard/            # Express web dashboard
├── notifications/        # Email and webhook alerts
└── utils/                # Logger, helpers
tests/                    # Jest test suite
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `trade --mode paper` | Start paper trading |
| `trade --mode live` | Start live trading (requires OANDA API key) |
| `trade --dashboard` | Enable web dashboard alongside trading |
| `backtest --start DATE --end DATE` | Run a backtest on historical data |
| `backtest --dashboard` | View backtest results in the dashboard |
| `dashboard` | Start the dashboard server in view-only mode |

## Configuration

All configuration is via environment variables (see `.env.example`):

- **OANDA credentials** — API key, account ID, and API URL
- **Trading pairs** — Comma-separated instruments (e.g., `EUR_USD,GBP_USD`)
- **Strategy weights** — Adjust how much each strategy contributes (must sum to 1.0)
- **Risk parameters** — Max risk per trade, max positions, daily loss limit, SL/TP in pips
- **Notifications** — SMTP email or Slack webhook configuration

## Strategies

Each strategy produces a signal with a confidence score (0-1). The multi-strategy engine combines them using weighted scoring:

- **MA Crossover** — EMA crossover detection with trend strength measurement
- **RSI** — Overbought/oversold levels with bullish/bearish divergence detection
- **MACD** — Histogram crossover signals with momentum acceleration
- **Bollinger Bands** — Mean reversion using %B, with squeeze breakout detection

## License

MIT
