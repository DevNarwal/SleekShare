/**
 * Formats a numeric amount with the respective currency symbol and localization rules.
 */
export function formatCurrency(amount: number, currencyCode: string = 'INR'): string {
  const code = currencyCode.toUpperCase();
  const formatters: Record<string, Intl.NumberFormat> = {
    INR: new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }),
    USD: new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }),
    EUR: new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }),
    GBP: new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }),
    SGD: new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD' }),
    AED: new Intl.NumberFormat('ar-AE', { style: 'currency', currency: 'AED' }),
  };

  const formatter = formatters[code] || new Intl.NumberFormat('en-US', { style: 'currency', currency: code });
  return formatter.format(amount);
}

/**
 * Checks if a user's membership was active on a given target date.
 */
export function checkTimelineActive(
  joinedAt: string | Date,
  leftAt: string | Date | null,
  targetDate: string | Date
): boolean {
  const check = new Date(targetDate);
  check.setHours(0, 0, 0, 0);

  const join = new Date(joinedAt);
  join.setHours(0, 0, 0, 0);

  const left = leftAt ? new Date(leftAt) : null;
  if (left) {
    left.setHours(0, 0, 0, 0);
  }

  return join <= check && (left === null || left >= check);
}

/**
 * Distributes a total amount equally among a list of participant IDs,
 * sorting them alphabetically and applying the rounding remainder to the last participant.
 */
export function calculateEqualSplit(amount: number, participantIds: string[]): Record<string, number> {
  const count = participantIds.length;
  if (count === 0) return {};
  
  // Sort alphabetically to match backend deterministic rounding
  const sortedIds = [...participantIds].sort((a, b) => a.localeCompare(b));
  
  const baseShare = Math.floor((amount / count) * 100) / 100;
  const results: Record<string, number> = {};
  
  let sum = 0;
  for (const id of sortedIds) {
    results[id] = baseShare;
    sum += baseShare;
  }
  
  // Apply the rounding remainder to the last participant
  const remainder = Math.round((amount - sum) * 100) / 100;
  if (remainder > 0) {
    const lastId = sortedIds[sortedIds.length - 1];
    results[lastId] = Math.round((results[lastId] + remainder) * 100) / 100;
  }
  
  return results;
}
