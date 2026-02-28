import { RiskManager } from '../src/risk';
import { RiskConfig, CompositeSignal, AccountInfo, Position } from '../src/types';

describe('RiskManager', () => {
  const riskConfig: RiskConfig = {
    maxRiskPerTrade: 0.02,
    maxOpenPositions: 5,
    maxDailyLoss: 0.05,
    defaultStopLossPips: 50,
    defaultTakeProfitPips: 100,
    maxPositionSize: 100000,
  };

  const account: AccountInfo = {
    id: 'test',
    balance: 10000,
    unrealizedPnl: 0,
    realizedPnl: 0,
    marginUsed: 0,
    marginAvailable: 10000,
    openPositionCount: 0,
    currency: 'USD',
  };

  const makeSignal = (action: 'buy' | 'sell', confidence: number): CompositeSignal => ({
    action,
    confidence,
    signals: [],
    instrument: 'EUR_USD',
    timestamp: Date.now(),
  });

  it('should approve a valid trade', () => {
    const manager = new RiskManager(riskConfig);
    const signal = makeSignal('buy', 0.8);
    const result = manager.assess(signal, account, [], 1.1000);

    expect(result.approved).toBe(true);
    expect(result.positionSize).toBeGreaterThan(0);
    expect(result.stopLoss).toBeLessThan(1.1000);
    expect(result.takeProfit).toBeGreaterThan(1.1000);
    expect(result.riskRewardRatio).toBe(2); // 100/50
  });

  it('should reject when max positions reached', () => {
    const manager = new RiskManager(riskConfig);
    const signal = makeSignal('buy', 0.8);

    const positions: Position[] = Array(5).fill(null).map((_, i) => ({
      id: `pos-${i}`,
      instrument: `PAIR_${i}`,
      side: 'buy' as const,
      units: 1000,
      entryPrice: 1.1,
      currentPrice: 1.1,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: 'open' as const,
      openedAt: Date.now(),
      strategy: 'test',
    }));

    const result = manager.assess(signal, account, positions, 1.1);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('Max open positions');
  });

  it('should reject duplicate instrument/side positions', () => {
    const manager = new RiskManager(riskConfig);
    const signal = makeSignal('buy', 0.8);

    const positions: Position[] = [{
      id: 'existing',
      instrument: 'EUR_USD',
      side: 'buy',
      units: 1000,
      entryPrice: 1.1,
      currentPrice: 1.1,
      unrealizedPnl: 0,
      realizedPnl: 0,
      status: 'open',
      openedAt: Date.now(),
      strategy: 'test',
    }];

    const result = manager.assess(signal, account, positions, 1.1);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('Already have');
  });

  it('should reject when daily loss exceeded', () => {
    const manager = new RiskManager(riskConfig);

    // First call initializes the daily reset date
    const signal = makeSignal('buy', 0.8);
    manager.assess(signal, account, [], 1.1);

    // Simulate daily losses exceeding 5% of 10000 = 500
    manager.updateDailyPnl(-600);

    const result = manager.assess(signal, account, [], 1.1);

    expect(result.approved).toBe(false);
    expect(result.reason).toContain('daily loss');
  });

  it('should scale position size by confidence', () => {
    const manager = new RiskManager(riskConfig);
    const highConf = makeSignal('buy', 1.0);
    const lowConf = makeSignal('buy', 0.5);

    const highResult = manager.assess(highConf, account, [], 1.1);
    const lowResult = manager.assess(lowConf, account, [], 1.1);

    expect(highResult.positionSize).toBeGreaterThan(lowResult.positionSize);
  });

  it('should set correct SL/TP for sell orders', () => {
    const manager = new RiskManager(riskConfig);
    const signal = makeSignal('sell', 0.8);
    const result = manager.assess(signal, account, [], 1.1);

    expect(result.approved).toBe(true);
    expect(result.stopLoss).toBeGreaterThan(1.1);
    expect(result.takeProfit).toBeLessThan(1.1);
  });
});
