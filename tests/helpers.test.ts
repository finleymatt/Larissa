import {
  generateId, roundToDecimals, formatCurrency, percentChange,
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
