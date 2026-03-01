import {
  BrokerConnector, AccountInfo, Candle, Tick, Order, Position,
  Timeframe, OrderSide,
} from '../types';
import { generateId } from '../utils/helpers';
import { logger } from '../utils/logger';

/**
 * Paper trading connector that simulates order execution
 * without connecting to a real broker. Uses an exchange connector for price data
 * but executes trades in-memory.
 */
export class PaperConnector implements BrokerConnector {
  private balance: number;
  private initialBalance: number;
  private positions: Map<string, Position> = new Map();
  private orders: Order[] = [];
  private realizedPnl: number = 0;
  private priceSource: BrokerConnector;
  private priceCache: Map<string, Tick> = new Map();

  constructor(initialBalance: number, priceSource: BrokerConnector) {
    this.balance = initialBalance;
    this.initialBalance = initialBalance;
    this.priceSource = priceSource;
  }

  async getAccount(): Promise<AccountInfo> {
    let unrealizedPnl = 0;
    for (const pos of this.positions.values()) {
      unrealizedPnl += pos.unrealizedPnl;
    }

    return {
      id: 'paper-account',
      balance: this.balance,
      unrealizedPnl,
      realizedPnl: this.realizedPnl,
      marginUsed: 0,
      marginAvailable: this.balance,
      openPositionCount: this.positions.size,
      currency: 'USD',
    };
  }

  async getCandles(instrument: string, timeframe: Timeframe, count: number): Promise<Candle[]> {
    return this.priceSource.getCandles(instrument, timeframe, count);
  }

  async getCandlesRange(instrument: string, timeframe: Timeframe, from: string, to: string): Promise<Candle[]> {
    return this.priceSource.getCandlesRange(instrument, timeframe, from, to);
  }

  async getCurrentPrice(instrument: string): Promise<Tick> {
    const tick = await this.priceSource.getCurrentPrice(instrument);
    this.priceCache.set(instrument, tick);
    await this.updatePositionPrices();
    return tick;
  }

  async placeOrder(order: Omit<Order, 'id' | 'status' | 'createdAt'>): Promise<Order> {
    const id = generateId();
    const tick = this.priceCache.get(order.instrument)
      || await this.getCurrentPrice(order.instrument);

    const fillPrice = order.side === 'buy' ? tick.ask : tick.bid;

    const filledOrder: Order = {
      id,
      instrument: order.instrument,
      side: order.side,
      type: order.type,
      units: order.units,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      status: 'filled',
      filledPrice: fillPrice,
      filledAt: Date.now(),
      createdAt: Date.now(),
    };

    this.orders.push(filledOrder);

    // Create position
    const position: Position = {
      id: generateId(),
      instrument: order.instrument,
      side: order.side,
      units: order.units,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: 'open',
      openedAt: Date.now(),
      strategy: '',
    };

    this.positions.set(position.id, position);
    logger.info(`[PAPER] Order filled: ${order.side} ${order.units} ${order.instrument} @ ${fillPrice}`);

    return filledOrder;
  }

  async closePosition(positionId: string): Promise<Position> {
    const position = this.positions.get(positionId);
    if (!position) throw new Error(`Position ${positionId} not found`);

    const tick = this.priceCache.get(position.instrument)
      || await this.getCurrentPrice(position.instrument);

    const closePrice = position.side === 'buy' ? tick.bid : tick.ask;
    const pnl = this.calculatePnl(position, closePrice);

    position.currentPrice = closePrice;
    position.realizedPnl = pnl;
    position.unrealizedPnl = 0;
    position.status = 'closed';
    position.closedAt = Date.now();

    this.realizedPnl += pnl;
    this.balance += pnl;

    this.positions.delete(positionId);
    logger.info(`[PAPER] Position closed: ${position.instrument} PnL: ${pnl.toFixed(2)}`);

    return position;
  }

  async getOpenPositions(): Promise<Position[]> {
    return Array.from(this.positions.values());
  }

  async modifyPosition(
    positionId: string,
    updates: { stopLoss?: number; takeProfit?: number },
  ): Promise<Position> {
    const position = this.positions.get(positionId);
    if (!position) throw new Error(`Position ${positionId} not found`);

    if (updates.stopLoss !== undefined) position.stopLoss = updates.stopLoss;
    if (updates.takeProfit !== undefined) position.takeProfit = updates.takeProfit;

    return position;
  }

  // Check if any positions hit SL/TP
  async checkStopLossTakeProfit(): Promise<Position[]> {
    const closedPositions: Position[] = [];

    for (const [id, position] of this.positions) {
      const tick = this.priceCache.get(position.instrument);
      if (!tick) continue;

      const currentPrice = position.side === 'buy' ? tick.bid : tick.ask;
      let shouldClose = false;

      if (position.stopLoss) {
        if (position.side === 'buy' && currentPrice <= position.stopLoss) shouldClose = true;
        if (position.side === 'sell' && currentPrice >= position.stopLoss) shouldClose = true;
      }

      if (position.takeProfit) {
        if (position.side === 'buy' && currentPrice >= position.takeProfit) shouldClose = true;
        if (position.side === 'sell' && currentPrice <= position.takeProfit) shouldClose = true;
      }

      if (shouldClose) {
        const closed = await this.closePosition(id);
        closedPositions.push(closed);
      }
    }

    return closedPositions;
  }

  private async updatePositionPrices(): Promise<void> {
    for (const position of this.positions.values()) {
      const tick = this.priceCache.get(position.instrument);
      if (!tick) continue;

      const currentPrice = position.side === 'buy' ? tick.bid : tick.ask;
      position.currentPrice = currentPrice;
      position.unrealizedPnl = this.calculatePnl(position, currentPrice);
    }
  }

  private calculatePnl(position: Position, closePrice: number): number {
    const direction = position.side === 'buy' ? 1 : -1;
    const priceDiff = (closePrice - position.entryPrice) * direction;
    // PnL = price difference * direction * units
    return priceDiff * position.units;
  }

  getTradeHistory(): Position[] {
    return this.orders.map((o, i) => ({
      id: o.id,
      instrument: o.instrument,
      side: o.side,
      units: o.units,
      entryPrice: o.filledPrice || 0,
      currentPrice: o.filledPrice || 0,
      unrealizedPnl: 0,
      realizedPnl: o.pnl || 0,
      status: o.status === 'filled' ? 'closed' as const : 'open' as const,
      openedAt: o.createdAt,
      strategy: '',
    }));
  }
}
