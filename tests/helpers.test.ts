import {
  generateId, pipValue, pipsToPrice, priceToPips,
  roundToDecimals, formatCurrency, percentChange,
} from '../src/utils/helpers';

describe('Helper Functions', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId();
      const id2 = generateId();
      expect(id1).not.toBe(id2);
    });

    it('should return a string', () => {
      expect(typeof generateId()).toBe('string');
    });
  });

  describe('pipValue', () => {
    it('should return 0.0001 for non-JPY pairs', () => {
      expect(pipValue('EUR_USD', 1.1)).toBe(0.0001);
      expect(pipValue('GBP_USD', 1.3)).toBe(0.0001);
    });

    it('should return 0.01 for JPY pairs', () => {
      expect(pipValue('USD_JPY', 110)).toBe(0.01);
      expect(pipValue('EUR_JPY', 130)).toBe(0.01);
    });
  });

  describe('pipsToPrice', () => {
    it('should convert pips to price for non-JPY pairs', () => {
      expect(pipsToPrice(50, 'EUR_USD')).toBeCloseTo(0.005);
    });

    it('should convert pips to price for JPY pairs', () => {
      expect(pipsToPrice(50, 'USD_JPY')).toBeCloseTo(0.5);
    });
  });

  describe('priceToPips', () => {
    it('should convert price to pips', () => {
      expect(priceToPips(0.005, 'EUR_USD')).toBeCloseTo(50);
      expect(priceToPips(0.5, 'USD_JPY')).toBeCloseTo(50);
    });
  });

  describe('roundToDecimals', () => {
    it('should round correctly', () => {
      expect(roundToDecimals(1.12345, 2)).toBe(1.12);
      expect(roundToDecimals(1.12345, 4)).toBe(1.1235);
    });
  });

  describe('formatCurrency', () => {
    it('should format USD amounts', () => {
      const result = formatCurrency(1234.56);
      expect(result).toContain('1,234.56');
    });
  });

  describe('percentChange', () => {
    it('should calculate percent change', () => {
      expect(percentChange(100, 110)).toBeCloseTo(10);
      expect(percentChange(100, 90)).toBeCloseTo(-10);
    });

    it('should handle zero', () => {
      expect(percentChange(0, 100)).toBe(0);
    });
  });
});
