import axios, { AxiosInstance } from 'axios';
import crypto from 'crypto';
import {
  BrokerConnector, AccountInfo, Candle, Tick, Order, Position,
  Timeframe, OrderSide,
} from '../types';
import { logger } from '../utils/logger';
import { generateId } from '../utils/helpers';

const TIMEFRAME_MAP: Record<Timeframe, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30,
  H1: 60, H4: 240, D: 1440, W: 10080,
};

// Map user-friendly pair names to Kraken API pair names
const PAIR_MAP: Record<string, string> = {
  BTC_USD: 'XXBTZUSD',
  ETH_USD: 'XETHZUSD',
  XRP_USD: 'XXRPZUSD',
  SOL_USD: 'SOLUSD',
  ADA_USD: 'ADAUSD',
  DOT_USD: 'DOTUSD',
  DOGE_USD: 'XDGUSD',
  LINK_USD: 'LINKUSD',
  AVAX_USD: 'AVAXUSD',
  MATIC_USD: 'MATICUSD',
  LTC_USD: 'XLTCZUSD',
  ATOM_USD: 'ATOMUSD',
  UNI_USD: 'UNIUSD',
  XLM_USD: 'XXLMZUSD',
};

function toKrakenPair(instrument: string): string {
  return PAIR_MAP[instrument] || instrument.replace('_', '');
}

export class KrakenConnector implements BrokerConnector {
  private client: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  // Track positions in memory for spot trading
  private positions: Map<string, Position> = new Map();
  private balance: number = 0;
  private realizedPnl: number = 0;

  constructor(apiKey: string, apiSecret: string, apiUrl: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.client = axios.create({
      baseURL: apiUrl,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'json',
    });

    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          const status = error.response.status;
          const data = error.response.data;
          const message = typeof data === 'object'
            ? JSON.stringify(data, null, 2)
            : String(data);
          logger.error(`Kraken API error (${status}): ${message}`);
          throw new Error(`Kraken API ${status}: ${message}`);
        }
        throw error;
      },
    );
  }

  private getSignature(urlPath: string, postData: string, nonce: number): string {
    const sha256 = crypto.createHash('sha256')
      .update(nonce + postData)
      .digest();
    const hmac = crypto.createHmac('sha512', Buffer.from(this.apiSecret, 'base64'));
    hmac.update(Buffer.concat([Buffer.from(urlPath), sha256]));
    return hmac.digest('base64');
  }

  private async privateRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const urlPath = `/0/private/${endpoint}`;
    const nonce = Date.now() * 1000;
    const postData = new URLSearchParams({ nonce: nonce.toString(), ...params }).toString();
    const signature = this.getSignature(urlPath, postData, nonce);

    const response = await this.client.post(urlPath, postData, {
      headers: {
        'API-Key': this.apiKey,
        'API-Sign': signature,
      },
    });

    if (response.data.error && response.data.error.length > 0) {
      const errMsg = response.data.error.join(', ');
      logger.error(`Kraken API error: ${errMsg}`);
      throw new Error(`Kraken API: ${errMsg}`);
    }

    return response.data.result;
  }

  private async publicRequest(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const urlPath = `/0/public/${endpoint}`;
    const queryString = new URLSearchParams(params).toString();
    const url = queryString ? `${urlPath}?${queryString}` : urlPath;

    const response = await this.client.get(url);

    if (response.data.error && response.data.error.length > 0) {
      const errMsg = response.data.error.join(', ');
      logger.error(`Kraken API error: ${errMsg}`);
      throw new Error(`Kraken API: ${errMsg}`);
    }

    return response.data.result;
  }

  async getAccount(): Promise<AccountInfo> {
    const balances = await this.privateRequest('Balance');

    // Sum up USD-equivalent balance
    const usdBalance = parseFloat(balances['ZUSD'] || balances['USD'] || '0');

    // Calculate unrealized PnL from tracked positions
    let unrealizedPnl = 0;
    for (const pos of this.positions.values()) {
      unrealizedPnl += pos.unrealizedPnl;
    }

    // Use fetched balance if we haven't cached one yet
    if (this.balance === 0 && usdBalance > 0) {
      this.balance = usdBalance;
    }

    return {
      id: 'kraken',
      balance: this.balance || usdBalance,
      unrealizedPnl,
      realizedPnl: this.realizedPnl,
      marginUsed: 0,
      marginAvailable: this.balance || usdBalance,
      openPositionCount: this.positions.size,
      currency: 'USD',
    };
  }

  async getCandles(
    instrument: string,
    timeframe: Timeframe,
    count: number,
  ): Promise<Candle[]> {
    const pair = toKrakenPair(instrument);
    const interval = TIMEFRAME_MAP[timeframe];

    // Kraken returns candles from a given timestamp forward.
    // To get the latest N candles, calculate a start time.
    const intervalMs = interval * 60 * 1000;
    const since = Math.floor((Date.now() - count * intervalMs) / 1000);

    const result = await this.publicRequest('OHLC', {
      pair,
      interval: interval.toString(),
      since: since.toString(),
    });

    // Result keys can vary (XXBTZUSD, XBTUSD, etc.), grab the first array
    const dataKey = Object.keys(result).find(k => k !== 'last');
    if (!dataKey) return [];

    const rawCandles = result[dataKey] as any[];

    return rawCandles
      .slice(-count)
      .map((c: any) => ({
        timestamp: c[0] * 1000, // Kraken returns unix seconds
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[6]),
      }));
  }

  async getCandlesRange(
    instrument: string,
    timeframe: Timeframe,
    from: string,
    to: string,
  ): Promise<Candle[]> {
    const pair = toKrakenPair(instrument);
    const interval = TIMEFRAME_MAP[timeframe];
    const fromTs = Math.floor(new Date(from).getTime() / 1000);
    const toTs = Math.floor(new Date(to).getTime() / 1000);

    const allCandles: Candle[] = [];
    let since = fromTs;

    // Kraken returns max 720 candles per request, so paginate
    while (since < toTs) {
      const result = await this.publicRequest('OHLC', {
        pair,
        interval: interval.toString(),
        since: since.toString(),
      });

      const dataKey = Object.keys(result).find(k => k !== 'last');
      if (!dataKey) break;

      const rawCandles = result[dataKey] as any[];
      if (!rawCandles || rawCandles.length === 0) break;

      const mapped = rawCandles
        .filter((c: any) => c[0] <= toTs)
        .map((c: any) => ({
          timestamp: c[0] * 1000,
          open: parseFloat(c[1]),
          high: parseFloat(c[2]),
          low: parseFloat(c[3]),
          close: parseFloat(c[4]),
          volume: parseFloat(c[6]),
        }));

      allCandles.push(...mapped);

      // Move past the last candle we received
      const lastTs = rawCandles[rawCandles.length - 1][0];
      if (lastTs <= since) break; // No progress, stop
      since = lastTs;
    }

    return allCandles;
  }

  async getCurrentPrice(instrument: string): Promise<Tick> {
    const pair = toKrakenPair(instrument);

    const result = await this.publicRequest('Ticker', { pair });

    const dataKey = Object.keys(result)[0];
    const ticker = result[dataKey];

    const bid = parseFloat(ticker.b[0]); // best bid
    const ask = parseFloat(ticker.a[0]); // best ask

    return {
      instrument,
      timestamp: Date.now(),
      bid,
      ask,
      spread: ask - bid,
    };
  }

  async placeOrder(
    order: Omit<Order, 'id' | 'status' | 'createdAt'>,
  ): Promise<Order> {
    const pair = toKrakenPair(order.instrument);

    const params: Record<string, string> = {
      pair,
      type: order.side === 'buy' ? 'buy' : 'sell',
      ordertype: order.type === 'market' ? 'market' : order.type,
      volume: order.units.toString(),
    };

    if (order.type === 'limit' && order.price) {
      params.price = order.price.toString();
    }

    // Kraken supports close orders for SL/TP via close[ordertype] and close[price]
    if (order.stopLoss) {
      params['close[ordertype]'] = 'stop-loss';
      params['close[price]'] = order.stopLoss.toString();
    }

    try {
      const result = await this.privateRequest('AddOrder', params);

      const txIds = result.txid;
      const orderId = txIds ? txIds[0] : generateId();

      logger.info(`Order placed: ${order.side} ${order.units} ${order.instrument} (${orderId})`);

      // For market orders, assume filled at current market price
      let filledPrice: number | undefined;
      if (order.type === 'market') {
        try {
          const tick = await this.getCurrentPrice(order.instrument);
          filledPrice = order.side === 'buy' ? tick.ask : tick.bid;
        } catch {
          // Use 0 if we can't get current price
        }
      }

      const filledOrder: Order = {
        id: orderId,
        instrument: order.instrument,
        side: order.side,
        type: order.type,
        units: order.units,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        status: 'filled',
        filledPrice,
        filledAt: Date.now(),
        createdAt: Date.now(),
      };

      // Track position in memory
      if (filledPrice) {
        const position: Position = {
          id: orderId,
          instrument: order.instrument,
          side: order.side,
          units: order.units,
          entryPrice: filledPrice,
          currentPrice: filledPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          unrealizedPnl: 0,
          realizedPnl: 0,
          status: 'open',
          openedAt: Date.now(),
          strategy: '',
        };
        this.positions.set(orderId, position);
      }

      return filledOrder;
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
    const position = this.positions.get(positionId);
    if (!position) throw new Error(`Position ${positionId} not found`);

    // Close by placing an opposite order
    const closeSide: OrderSide = position.side === 'buy' ? 'sell' : 'buy';
    const pair = toKrakenPair(position.instrument);

    const params: Record<string, string> = {
      pair,
      type: closeSide,
      ordertype: 'market',
      volume: position.units.toString(),
    };

    await this.privateRequest('AddOrder', params);

    const tick = await this.getCurrentPrice(position.instrument);
    const closePrice = position.side === 'buy' ? tick.bid : tick.ask;
    const direction = position.side === 'buy' ? 1 : -1;
    const pnl = (closePrice - position.entryPrice) * direction * position.units;

    position.currentPrice = closePrice;
    position.realizedPnl = pnl;
    position.unrealizedPnl = 0;
    position.status = 'closed';
    position.closedAt = Date.now();

    this.realizedPnl += pnl;
    this.balance += pnl;
    this.positions.delete(positionId);

    logger.info(`Position closed: ${position.instrument} PnL: $${pnl.toFixed(2)}`);

    return position;
  }

  async getOpenPositions(): Promise<Position[]> {
    // Update prices for all tracked positions
    for (const position of this.positions.values()) {
      try {
        const tick = await this.getCurrentPrice(position.instrument);
        const currentPrice = position.side === 'buy' ? tick.bid : tick.ask;
        position.currentPrice = currentPrice;
        const direction = position.side === 'buy' ? 1 : -1;
        position.unrealizedPnl = (currentPrice - position.entryPrice) * direction * position.units;
      } catch {
        // Keep last known price if fetch fails
      }
    }

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
}
