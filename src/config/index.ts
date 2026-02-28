import dotenv from 'dotenv';
import { BotConfig, StrategyConfig, Timeframe } from '../types';

dotenv.config();

function envOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function envFloat(key: string, defaultValue: number): number {
  const val = process.env[key];
  return val ? parseFloat(val) : defaultValue;
}

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  return val ? parseInt(val, 10) : defaultValue;
}

function envBool(key: string, defaultValue: boolean): boolean {
  const val = process.env[key];
  if (!val) return defaultValue;
  return val.toLowerCase() === 'true';
}

export function loadConfig(overrides?: Partial<BotConfig>): BotConfig {
  const strategies: StrategyConfig[] = [
    {
      name: 'ma_crossover',
      enabled: true,
      weight: envFloat('WEIGHT_MA_CROSSOVER', 0.25),
      params: {
        shortPeriod: 10,
        longPeriod: 50,
      },
    },
    {
      name: 'rsi',
      enabled: true,
      weight: envFloat('WEIGHT_RSI', 0.25),
      params: {
        period: 14,
        overbought: 70,
        oversold: 30,
      },
    },
    {
      name: 'macd',
      enabled: true,
      weight: envFloat('WEIGHT_MACD', 0.25),
      params: {
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
    },
    {
      name: 'bollinger',
      enabled: true,
      weight: envFloat('WEIGHT_BOLLINGER', 0.25),
      params: {
        period: 20,
        stdDev: 2,
      },
    },
  ];

  const config: BotConfig = {
    mode: envOrDefault('TRADING_MODE', 'paper') as BotConfig['mode'],
    oanda: {
      apiKey: envOrDefault('OANDA_API_KEY', ''),
      accountId: envOrDefault('OANDA_ACCOUNT_ID', ''),
      apiUrl: envOrDefault('OANDA_API_URL', 'https://api-fxpractice.oanda.com'),
    },
    instruments: envOrDefault('CURRENCY_PAIRS', 'EUR_USD,GBP_USD,USD_JPY,AUD_USD').split(','),
    timeframe: envOrDefault('TIMEFRAME', 'H1') as Timeframe,
    strategies,
    risk: {
      maxRiskPerTrade: envFloat('MAX_RISK_PER_TRADE', 0.02),
      maxOpenPositions: envInt('MAX_OPEN_POSITIONS', 5),
      maxDailyLoss: envFloat('MAX_DAILY_LOSS', 0.05),
      defaultStopLossPips: envFloat('DEFAULT_STOP_LOSS_PIPS', 50),
      defaultTakeProfitPips: envFloat('DEFAULT_TAKE_PROFIT_PIPS', 100),
      maxPositionSize: envInt('MAX_POSITION_SIZE', 100000),
      trailingStopPips: envFloat('TRAILING_STOP_PIPS', 0) || undefined,
    },
    alerts: {
      enableEmail: envBool('ENABLE_EMAIL_ALERTS', false),
      enableWebhook: envBool('ENABLE_WEBHOOK_ALERTS', false),
      smtpHost: process.env.SMTP_HOST,
      smtpPort: envInt('SMTP_PORT', 587),
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      alertEmail: process.env.ALERT_EMAIL,
      webhookUrl: process.env.WEBHOOK_URL,
    },
    dashboardPort: envInt('DASHBOARD_PORT', 3000),
    logLevel: envOrDefault('LOG_LEVEL', 'info'),
  };

  return { ...config, ...overrides };
}
