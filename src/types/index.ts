// ============================================================
// Core Trading Types
// ============================================================

export type TradingMode = 'paper' | 'live' | 'backtest';
export type OrderSide = 'buy' | 'sell';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'rejected';
export type PositionStatus = 'open' | 'closed';
export type SignalAction = 'buy' | 'sell' | 'hold';
export type Timeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D' | 'W';

// ============================================================
// Market Data
// ============================================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Tick {
  instrument: string;
  timestamp: number;
  bid: number;
  ask: number;
  spread: number;
}

export interface PriceData {
  instrument: string;
  timeframe: Timeframe;
  candles: Candle[];
}

// ============================================================
// Trading Signals & Strategies
// ============================================================

export interface Signal {
  action: SignalAction;
  confidence: number; // 0-1
  strategy: string;
  instrument: string;
  timestamp: number;
  metadata?: Record<string, number>;
}

export interface CompositeSignal {
  action: SignalAction;
  confidence: number;
  signals: Signal[];
  instrument: string;
  timestamp: number;
}

export interface StrategyConfig {
  name: string;
  enabled: boolean;
  weight: number;
  params: Record<string, number>;
}

export interface StrategyResult {
  signal: Signal;
  indicators: Record<string, number | number[]>;
}

// ============================================================
// Orders & Positions
// ============================================================

export interface Order {
  id: string;
  instrument: string;
  side: OrderSide;
  type: OrderType;
  units: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  status: OrderStatus;
  filledPrice?: number;
  filledAt?: number;
  createdAt: number;
  pnl?: number;
}

export interface Position {
  id: string;
  instrument: string;
  side: OrderSide;
  units: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  unrealizedPnl: number;
  realizedPnl: number;
  status: PositionStatus;
  openedAt: number;
  closedAt?: number;
  strategy: string;
}

// ============================================================
// Risk Management
// ============================================================

export interface RiskConfig {
  maxRiskPerTrade: number;     // fraction of account (e.g. 0.02 = 2%)
  maxOpenPositions: number;
  maxDailyLoss: number;        // fraction of account
  defaultStopLossPercent: number;  // percentage distance for stop loss (e.g. 2 = 2%)
  defaultTakeProfitPercent: number; // percentage distance for take profit (e.g. 4 = 4%)
  maxPositionSize: number;     // max units (fractional for crypto, e.g. 0.5 BTC)
  trailingStopPercent?: number;
}

export interface RiskAssessment {
  approved: boolean;
  positionSize: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  riskRewardRatio: number;
  reason?: string;
}

// ============================================================
// Account
// ============================================================

export interface AccountInfo {
  id: string;
  balance: number;
  unrealizedPnl: number;
  realizedPnl: number;
  marginUsed: number;
  marginAvailable: number;
  openPositionCount: number;
  currency: string;
}

// ============================================================
// Backtesting
// ============================================================

export interface BacktestConfig {
  startDate: string;          // ISO date string
  endDate: string;
  instruments: string[];
  timeframe: Timeframe;
  initialBalance: number;
  strategies: StrategyConfig[];
  riskConfig: RiskConfig;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: Position[];
  metrics: PerformanceMetrics;
  equityCurve: { timestamp: number; equity: number }[];
  drawdownCurve: { timestamp: number; drawdown: number }[];
}

// ============================================================
// Performance Metrics
// ============================================================

export interface PerformanceMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  averageWin: number;
  averageLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  maxDrawdownPercent: number;
  sharpeRatio: number;
  sortinoRatio: number;
  averageHoldingPeriod: number; // milliseconds
  expectancy: number;
  consecutiveWins: number;
  consecutiveLosses: number;
}

// ============================================================
// Notifications
// ============================================================

export interface AlertConfig {
  enableEmail: boolean;
  enableWebhook: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  alertEmail?: string;
  webhookUrl?: string;
}

export interface Alert {
  type: 'trade_opened' | 'trade_closed' | 'signal' | 'risk_warning' | 'error' | 'daily_summary';
  title: string;
  message: string;
  timestamp: number;
  data?: Record<string, unknown>;
}

// ============================================================
// Configuration
// ============================================================

export interface BotConfig {
  mode: TradingMode;
  kraken: {
    apiKey: string;
    apiSecret: string;
    apiUrl: string;
  };
  instruments: string[];
  timeframe: Timeframe;
  strategies: StrategyConfig[];
  risk: RiskConfig;
  alerts: AlertConfig;
  dashboardPort: number;
  logLevel: string;
}

// ============================================================
// Connector Interface
// ============================================================

export interface BrokerConnector {
  getAccount(): Promise<AccountInfo>;
  getCandles(instrument: string, timeframe: Timeframe, count: number): Promise<Candle[]>;
  getCandlesRange(instrument: string, timeframe: Timeframe, from: string, to: string): Promise<Candle[]>;
  getCurrentPrice(instrument: string): Promise<Tick>;
  placeOrder(order: Omit<Order, 'id' | 'status' | 'createdAt'>): Promise<Order>;
  closePosition(positionId: string): Promise<Position>;
  getOpenPositions(): Promise<Position[]>;
  modifyPosition(positionId: string, updates: { stopLoss?: number; takeProfit?: number }): Promise<Position>;
}
