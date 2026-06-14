import { describe, it, expect } from 'vitest';
import { calculateEqualSplit, checkTimelineActive, formatCurrency } from './utils';

describe('Frontend Utility Helpers', () => {
  
  describe('calculateEqualSplit - Alphabetical Rounding Remainder', () => {
    it('should split amount equally and apply the remainder to the last participant alphabetically', () => {
      const participants = ['user-Z', 'user-U', 'user-V'];
      const result = calculateEqualSplit(100.0, participants);

      // Sorted alphabetically: user-U, user-V, user-Z
      // 100 / 3 = 33.33 each with 0.01 remainder applied to last (user-Z)
      expect(result['user-U']).toBe(33.33);
      expect(result['user-V']).toBe(33.33);
      expect(result['user-Z']).toBe(33.34);
    });

    it('should handle splits with no remainder', () => {
      const participants = ['user-B', 'user-A'];
      const result = calculateEqualSplit(100.0, participants);

      expect(result['user-A']).toBe(50.0);
      expect(result['user-B']).toBe(50.0);
    });

    it('should return empty record if there are no participants', () => {
      const result = calculateEqualSplit(100.0, []);
      expect(result).toEqual({});
    });
  });

  describe('checkTimelineActive - Membership Timeline Checks', () => {
    it('should return true if target date falls within the joinedAt and leftAt window', () => {
      const active = checkTimelineActive('2026-06-01', '2026-06-30', '2026-06-15');
      expect(active).toBe(true);
    });

    it('should return true if user is active and leftAt is null', () => {
      const active = checkTimelineActive('2026-06-01', null, '2026-06-15');
      expect(active).toBe(true);
    });

    it('should return false if target date is before joinedAt', () => {
      const active = checkTimelineActive('2026-06-10', null, '2026-06-05');
      expect(active).toBe(false);
    });

    it('should return false if target date is after leftAt', () => {
      const active = checkTimelineActive('2026-06-01', '2026-06-10', '2026-06-15');
      expect(active).toBe(false);
    });

    it('should return true on the boundary join date (inclusive)', () => {
      const active = checkTimelineActive('2026-06-15', null, '2026-06-15');
      expect(active).toBe(true);
    });

    it('should return true on the boundary leave date (inclusive)', () => {
      const active = checkTimelineActive('2026-06-01', '2026-06-15', '2026-06-15');
      expect(active).toBe(true);
    });
  });

  describe('formatCurrency - Currency Formatters', () => {
    it('should format INR currency correctly', () => {
      const formatted = formatCurrency(1234.56, 'INR');
      // Format checks for the currency code or currency symbol
      expect(formatted).toContain('₹');
      expect(formatted).toContain('1,234.56');
    });

    it('should format USD currency correctly', () => {
      const formatted = formatCurrency(1234.56, 'USD');
      expect(formatted).toContain('$');
      expect(formatted).toContain('1,234.56');
    });

    it('should format EUR currency correctly', () => {
      const formatted = formatCurrency(1234.56, 'EUR');
      expect(formatted).toContain('€');
    });
  });
});
