import axios, { AxiosInstance } from 'axios';
import {
  BrokerConnector, AccountInfo, Candle, Tick, Order, Position,
  Timeframe, OrderSide,
} from '../types';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

const TIMEFRAME_MAP: Record<Timeframe, string> = {
  M1: 'M1', M5: 'M5', M15: 'M15', M30: 'M30',
  H1: 'H1', H4: 'H4', D: 'D', W: 'W',
};

export class OandaConnector implements BrokerConnector {
  private client: AxiosInstance;
  private accountId: string;

  constructor(apiKey: string, accountId: string, apiUrl: string) {
    this.accountId = accountId;
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Datetime-Format': 'RFC3339',
      },
      responseType: 'json',
    });

    // Intercept errors to produce readable messages instead of raw buffers
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data;
          const message = typeof data === 'object'
            ? JSON.stringify(data, null, 2)
            : String(data);
          logger.error(`OANDA API error (${status}): ${message}`);
          throw new Error(`OANDA API ${status}: ${message}`);
        }
        throw error;
      },
    );
  }

  async getAccount(): Promise<AccountInfo> {
    const response = await this.client.get(`/v3/accounts/${this.accountId}/summary`);
    const acc = response.data.account;
    return {
      id: acc.id,
      balance: parseFloat(acc.balance),
      unrealizedPnl: parseFloat(acc.unrealizedPL),
      realizedPnl: parseFloat(acc.pl),
      marginUsed: parseFloat(acc.marginUsed),
      marginAvailable: parseFloat(acc.marginAvailable),
      openPositionCount: parseInt(acc.openPositionCount, 10),
      currency: acc.currency,
    };
  }

  async getCandles(
    instrument: string,
    timeframe: Timeframe,
    count: number,
  ): Promise<Candle[]> {
    const response = await this.client.get(
      `/v3/instruments/${instrument}/candles`,
      {
        params: {
          granularity: TIMEFRAME_MAP[timeframe],
          count,
          price: 'M', // midpoint
        },
      },
    );

    return response.data.candles
      .filter((c: any) => c.complete)
      .map((c: any) => ({
        timestamp: new Date(c.time).getTime(),
        open: parseFloat(c.mid.o),
        high: parseFloat(c.mid.h),
        low: parseFloat(c.mid.l),
        close: parseFloat(c.mid.c),
        volume: c.volume,
      }));
  }

  async getCandlesRange(
    instrument: string,
    timeframe: Timeframe,
    from: string,
    to: string,
  ): Promise<Candle[]> {
    const allCandles: Candle[] = [];
    let fromTime = from;

    // OANDA limits to 5000 candles per request, so we paginate
    while (true) {
      const response = await this.client.get(
        `/v3/instruments/${instrument}/candles`,
        {
          params: {
            granularity: TIMEFRAME_MAP[timeframe],
            from: fromTime,
            to,
            price: 'M',
            count: 5000,
          },
        },
      );

      const candles = response.data.candles;
      if (!candles || candles.length === 0) break;

      const mapped = candles
        .filter((c: any) => c.complete)
        .map((c: any) => ({
          timestamp: new Date(c.time).getTime(),
          open: parseFloat(c.mid.o),
          high: parseFloat(c.mid.h),
          low: parseFloat(c.mid.l),
          close: parseFloat(c.mid.c),
          volume: c.volume,
        }));

      allCandles.push(...mapped);

      if (candles.length < 5000) break;
      fromTime = candles[candles.length - 1].time;
    }

    return allCandles;
  }

  async getCurrentPrice(instrument: string): Promise<Tick> {
    const response = await this.client.get(
      `/v3/accounts/${this.accountId}/pricing`,
      { params: { instruments: instrument } },
    );

    const price = response.data.prices[0];
    const bid = parseFloat(price.bids[0].price);
    const ask = parseFloat(price.asks[0].price);

    return {
      instrument,
      timestamp: new Date(price.time).getTime(),
      bid,
      ask,
      spread: ask - bid,
    };
  }

  async placeOrder(
    order: Omit<Order, 'id' | 'status' | 'createdAt'>,
  ): Promise<Order> {
    const units = order.side === 'sell' ? -order.units : order.units;

    const orderRequest: any = {
      type: order.type === 'market' ? 'MARKET' : order.type.toUpperCase(),
      instrument: order.instrument,
      units: units.toString(),
      timeInForce: 'FOK',
    };

    if (order.stopLoss) {
      orderRequest.stopLossOnFill = { price: order.stopLoss.toString() };
    }
    if (order.takeProfit) {
      orderRequest.takeProfitOnFill = { price: order.takeProfit.toString() };
    }
    if (order.type === 'limit' && order.price) {
      orderRequest.price = order.price.toString();
      orderRequest.timeInForce = 'GTC';
    }

    try {
      const response = await this.client.post(
        `/v3/accounts/${this.accountId}/orders`,
        { order: orderRequest },
      );

      const fill = response.data.orderFillTransaction;
      if (fill) {
        logger.info(`Order filled: ${order.instrument} ${order.side} ${order.units} @ ${fill.price}`);
        return {
          id: fill.id,
          instrument: order.instrument,
          side: order.side,
          type: order.type,
          units: order.units,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          status: 'filled',
          filledPrice: parseFloat(fill.price),
          filledAt: new Date(fill.time).getTime(),
          createdAt: Date.now(),
        };
      }

      const created = response.data.orderCreateTransaction;
      return {
        id: created.id,
        instrument: order.instrument,
        side: order.side,
        type: order.type,
        units: order.units,
        price: order.price,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        status: 'pending',
        createdAt: Date.now(),
      };
    } catch (error: any) {
      logger.error(`Order placement failed: ${error.message}`);
      return {
        id: generateId(),
        instrument: order.instrument,
        side: order.side,
        type: order.type,
        units: order.units,
        status: 'rejected',
        createdAt: Date.now(),
      };
    }
  }

  async closePosition(positionId: string): Promise<Position> {
    const response = await this.client.put(
      `/v3/accounts/${this.accountId}/trades/${positionId}/close`,
      {},
    );

    const close = response.data.orderFillTransaction;
    return {
      id: positionId,
      instrument: close.instrument,
      side: parseFloat(close.units) > 0 ? 'sell' : 'buy', // closing side is opposite
      units: Math.abs(parseFloat(close.units)),
      entryPrice: 0, // filled from trade details
      currentPrice: parseFloat(close.price),
      unrealizedPnl: 0,
      realizedPnl: parseFloat(close.pl),
      status: 'closed',
      openedAt: 0,
      closedAt: new Date(close.time).getTime(),
      strategy: '',
    };
  }

  async getOpenPositions(): Promise<Position[]> {
    const response = await this.client.get(
      `/v3/accounts/${this.accountId}/openTrades`,
    );

    return response.data.trades.map((t: any) => ({
      id: t.id,
      instrument: t.instrument,
      side: parseFloat(t.currentUnits) > 0 ? 'buy' as OrderSide : 'sell' as OrderSide,
      units: Math.abs(parseFloat(t.currentUnits)),
      entryPrice: parseFloat(t.price),
      currentPrice: parseFloat(t.price), // will be updated with live price
      unrealizedPnl: parseFloat(t.unrealizedPL),
      realizedPnl: parseFloat(t.realizedPL),
      status: 'open' as const,
      openedAt: new Date(t.openTime).getTime(),
      strategy: '',
    }));
  }

  async modifyPosition(
    positionId: string,
    updates: { stopLoss?: number; takeProfit?: number },
  ): Promise<Position> {
    const body: any = {};
    if (updates.stopLoss) {
      body.stopLoss = { price: updates.stopLoss.toString() };
    }
    if (updates.takeProfit) {
      body.takeProfit = { price: updates.takeProfit.toString() };
    }

    await this.client.put(
      `/v3/accounts/${this.accountId}/trades/${positionId}/orders`,
      body,
    );

    // Return updated position
    const positions = await this.getOpenPositions();
    const position = positions.find(p => p.id === positionId);
    if (!position) throw new Error(`Position ${positionId} not found`);
    return position;
  }
}
