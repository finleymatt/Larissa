import {
  RiskConfig, RiskAssessment, AccountInfo, CompositeSignal,
  Position, OrderSide,
} from '../types';
import { logger } from '../utils/logger';

export class RiskManager {
  private config: RiskConfig;
  private dailyPnl: number = 0;
  private dailyPnlResetDate: string = '';

  constructor(config: RiskConfig) {
    this.config = config;
  }

  assess(
    signal: CompositeSignal,
    account: AccountInfo,
    openPositions: Position[],
    currentPrice: number,
  ): RiskAssessment {
    const instrument = signal.instrument;
    const side = signal.action as OrderSide;

    // Reset daily PnL tracking if new day
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.dailyPnlResetDate) {
      this.dailyPnl = 0;
      this.dailyPnlResetDate = today;
    }

    // Check max daily loss
    if (this.dailyPnl < -(account.balance * this.config.maxDailyLoss)) {
      return this.reject('Max daily loss limit reached');
    }

    // Check max open positions
    if (openPositions.length >= this.config.maxOpenPositions) {
      return this.reject('Max open positions limit reached');
    }

    // Check if we already have a position in the same instrument and direction
    const existingPosition = openPositions.find(
      p => p.instrument === instrument && p.side === side,
    );
    if (existingPosition) {
      return this.reject(`Already have a ${side} position in ${instrument}`);
    }

    // Calculate position size based on risk per trade
    const riskAmount = account.balance * this.config.maxRiskPerTrade;
    const slPercent = this.config.defaultStopLossPercent / 100;
    const slDistance = currentPrice * slPercent;

    // Position size = risk amount / stop loss distance per unit
    const positionSize = riskAmount / slDistance;

    // Cap position size
    const units = Math.min(positionSize, this.config.maxPositionSize);

    // Calculate stop loss and take profit prices using percentages
    const tpPercent = this.config.defaultTakeProfitPercent / 100;

    let stopLoss: number;
    let takeProfit: number;

    if (side === 'buy') {
      stopLoss = currentPrice * (1 - slPercent);
      takeProfit = currentPrice * (1 + tpPercent);
    } else {
      stopLoss = currentPrice * (1 + slPercent);
      takeProfit = currentPrice * (1 - tpPercent);
    }

    const riskRewardRatio = this.config.defaultTakeProfitPercent / this.config.defaultStopLossPercent;

    // Scale position size by signal confidence
    // For crypto, keep fractional precision (don't floor)
    const scaledUnits = parseFloat((units * signal.confidence).toFixed(8));

    if (scaledUnits <= 0) {
      return this.reject('Position size too small after confidence scaling');
    }

    logger.info(
      `Risk assessment: ${side} ${scaledUnits} ${instrument} ` +
      `SL: ${stopLoss.toFixed(2)} TP: ${takeProfit.toFixed(2)} ` +
      `RR: ${riskRewardRatio.toFixed(1)} Risk: $${riskAmount.toFixed(2)}`,
    );

    return {
      approved: true,
      positionSize: scaledUnits,
      stopLoss,
      takeProfit,
      riskAmount,
      riskRewardRatio,
    };
  }

  updateDailyPnl(pnl: number): void {
    this.dailyPnl += pnl;
  }

  getDailyPnl(): number {
    return this.dailyPnl;
  }

  private reject(reason: string): RiskAssessment {
    logger.warn(`Risk rejected: ${reason}`);
    return {
      approved: false,
      positionSize: 0,
      stopLoss: 0,
      takeProfit: 0,
      riskAmount: 0,
      riskRewardRatio: 0,
      reason,
    };
  }
}
