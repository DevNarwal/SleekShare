import { NormalizedRow, NormalizedParticipant } from './csv-parser';

export interface AnomalyResult {
  anomalyType: string;
  severity: 'error' | 'warning' | 'info';
  detail: string;
  suggestedFix?: string;
}

export interface AnomalyContext {
  groupId: string;
  existingExpenses: { description: string; expenseDate: Date; amountBaseInr: number }[];
  existingSettlements: { fromUserId: string; toUserId: string; amountInr: number; settlementDate: Date }[];
  currencies: string[];
  exchangeRates: { fromCode: string; rateDate: Date; rate: number }[];
  resolvedUsers: Map<string, { id: string; displayName: string; email: string; memberships: { groupId: string; joinedAt: Date; leftAt: Date | null }[] }>;
  today: Date;
}

export interface AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[];
}

// Helper: parse date safely ignoring time zones
export function parseLocalDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
}

export function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

export class MalformedRowHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    if (!row.date) {
      results.push({
        anomalyType: 'MALFORMED_ROW',
        severity: 'error',
        detail: 'The date column is missing or empty.',
        suggestedFix: 'Add a valid date in YYYY-MM-DD format.',
      });
    }
    if (!row.description) {
      results.push({
        anomalyType: 'MALFORMED_ROW',
        severity: 'error',
        detail: 'The description column is missing or empty.',
        suggestedFix: 'Provide a description of the expense.',
      });
    }
    if (row.amount === undefined || isNaN(row.amount)) {
      results.push({
        anomalyType: 'MALFORMED_ROW',
        severity: 'error',
        detail: 'The amount column is missing or unparseable.',
        suggestedFix: 'Provide a valid numeric amount.',
      });
    }
    if (!row.paidBy) {
      results.push({
        anomalyType: 'MALFORMED_ROW',
        severity: 'error',
        detail: 'The paid_by column is missing or empty.',
        suggestedFix: 'Provide the name or email of the payer.',
      });
    }
    return results;
  }
}

export class InvalidDateHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (!row.date) return [];
    const d = parseLocalDate(row.date);
    if (!d) {
      return [{
        anomalyType: 'INVALID_DATE',
        severity: 'error',
        detail: `The date '${row.date}' is not a valid date format.`,
        suggestedFix: 'Use YYYY-MM-DD format (e.g., 2026-06-13).',
      }];
    }
    return [];
  }
}

export class NegativeAmountHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (row.amount !== undefined && !isNaN(row.amount) && row.amount <= 0) {
      return [{
        anomalyType: 'NEGATIVE_AMOUNT',
        severity: 'error',
        detail: `The amount (${row.amount}) must be greater than zero.`,
        suggestedFix: 'Enter a positive amount.',
      }];
    }
    return [];
  }
}

export class UnknownCurrencyHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (!row.currency) return [];
    const code = row.currency.toUpperCase();
    if (!context.currencies.includes(code)) {
      return [{
        anomalyType: 'UNKNOWN_CURRENCY',
        severity: 'error',
        detail: `The currency code '${row.currency}' is not supported.`,
        suggestedFix: `Use one of: ${context.currencies.join(', ')}.`,
      }];
    }
    return [];
  }
}

export class ForeignCurrencyNoRateHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (!row.currency || row.currency.toUpperCase() === 'INR') return [];
    const dateObj = parseLocalDate(row.date);
    if (!dateObj) return [];

    const currencyCode = row.currency.toUpperCase();
    
    // Check if a rate exists in context
    const dateStr = formatDateString(dateObj);
    const rateExists = context.exchangeRates.some(
      (r) => r.fromCode === currencyCode && formatDateString(r.rateDate) === dateStr
    );

    if (!rateExists) {
      return [{
        anomalyType: 'FOREIGN_CURRENCY_NO_RATE',
        severity: 'error',
        detail: `No exchange rate exists for ${currencyCode} on ${dateStr}.`,
        suggestedFix: 'Seed the exchange rate database table or enter the rate manually in the rates table.',
      }];
    }
    return [];
  }
}

export class MissingMemberHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    if (row.paidBy) {
      const payer = context.resolvedUsers.get(row.paidBy.toLowerCase());
      if (!payer) {
        results.push({
          anomalyType: 'MISSING_MEMBER',
          severity: 'error',
          detail: `The payer '${row.paidBy}' was not found in the system.`,
          suggestedFix: 'Ensure they have registered a user account first.',
        });
      }
    }

    for (const p of row.participants) {
      const resolved = context.resolvedUsers.get(p.nameOrEmail.toLowerCase());
      if (!resolved) {
        results.push({
          anomalyType: 'MISSING_MEMBER',
          severity: 'error',
          detail: `The participant '${p.nameOrEmail}' was not found in the system.`,
          suggestedFix: 'Ensure they have registered a user account first.',
        });
      }
    }
    return results;
  }
}

export class UnsupportedSplitTypeHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (!row.splitMethod) return [];
    const valid = ['equal', 'unequal', 'percentage', 'share'];
    if (!valid.includes(row.splitMethod.toLowerCase())) {
      return [{
        anomalyType: 'UNSUPPORTED_SPLIT_TYPE',
        severity: 'error',
        detail: `Split method '${row.splitMethod}' is unsupported.`,
        suggestedFix: "Use one of: 'equal', 'unequal', 'percentage', 'share'.",
      }];
    }
    return [];
  }
}

export class DuplicateExpenseHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj || !row.description || isNaN(row.amount) || row.amount <= 0) return [];

    // Calculate base INR for comparison
    let rate = 1.0;
    if (row.currency && row.currency.toUpperCase() !== 'INR') {
      const match = context.exchangeRates.find(
        (r) => r.fromCode === row.currency.toUpperCase() && formatDateString(r.rateDate) === formatDateString(dateObj)
      );
      if (match) rate = match.rate;
    }
    const baseInr = Math.round(row.amount * rate * 100) / 100;

    const formattedDate = formatDateString(dateObj);
    const isDuplicate = context.existingExpenses.some((exp) => {
      return (
        formatDateString(exp.expenseDate) === formattedDate &&
        exp.description.toLowerCase().trim() === row.description.toLowerCase().trim() &&
        Math.abs(exp.amountBaseInr - baseInr) < 0.05
      );
    });

    if (isDuplicate) {
      return [{
        anomalyType: 'DUPLICATE_EXPENSE',
        severity: 'warning',
        detail: `This expense matches an existing record in the group: '${row.description}' on ${formattedDate} for ₹${baseInr.toFixed(2)}.`,
        suggestedFix: 'Reject this row or approve if it is an intentionally separate matching charge.',
      }];
    }
    return [];
  }
}

export class DuplicateSettlementHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj || !row.description || isNaN(row.amount) || row.amount <= 0) return [];

    // Check if description implies a settlement
    const lowerDesc = row.description.toLowerCase();
    const matchesSettlementKeywords = ['settlement', 'repay', 'repayment', 'transfer', 'payment', 'paid'].some(
      (kw) => lowerDesc.includes(kw)
    );
    if (!matchesSettlementKeywords) return [];

    // Resolve payer and receiver
    const payer = context.resolvedUsers.get(row.paidBy.toLowerCase());
    if (!payer) return [];

    let receiverId: string | null = null;
    if (row.participants.length === 1) {
      const resolvedRecv = context.resolvedUsers.get(row.participants[0].nameOrEmail.toLowerCase());
      if (resolvedRecv) receiverId = resolvedRecv.id;
    }

    if (!receiverId) return [];

    const formattedDate = formatDateString(dateObj);
    const amountInr = row.amount; // settlements are strictly INR

    const isDuplicate = context.existingSettlements.some((set) => {
      return (
        formatDateString(set.settlementDate) === formattedDate &&
        set.fromUserId === payer.id &&
        set.toUserId === receiverId &&
        Math.abs(set.amountInr - amountInr) < 0.05
      );
    });

    if (isDuplicate) {
      return [{
        anomalyType: 'DUPLICATE_SETTLEMENT',
        severity: 'warning',
        detail: `This settlement matches an existing record: ${payer.displayName} paid ₹${amountInr.toFixed(2)} on ${formattedDate}.`,
        suggestedFix: 'Reject this row to avoid double counting.',
      }];
    }
    return [];
  }
}

export class SettlementAsExpenseHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (!row.description) return [];
    const lowerDesc = row.description.toLowerCase();
    const matchesSettlementKeywords = ['settlement', 'repay', 'repayment', 'transfer', 'payment', 'paid'].some(
      (kw) => lowerDesc.includes(kw)
    );
    
    if (matchesSettlementKeywords) {
      return [{
        anomalyType: 'SETTLEMENT_AS_EXPENSE',
        severity: 'warning',
        detail: `The description '${row.description}' suggests this is a peer-to-peer settlement, not a shared group expense.`,
        suggestedFix: 'Mark this row as rejected or record it explicitly in settlements.',
      }];
    }
    return [];
  }
}

export class InactiveMemberHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj) return [];

    const results: AnomalyResult[] = [];
    const startOfDay = new Date(dateObj);
    startOfDay.setHours(0, 0, 0, 0);

    const checkTimeline = (userKey: string, role: string) => {
      const resolved = context.resolvedUsers.get(userKey.toLowerCase());
      if (!resolved) return;

      const groupMemberships = resolved.memberships.filter((m) => m.groupId === context.groupId);
      if (groupMemberships.length === 0) return; // participant mismatch covers this

      // Check if any membership window covers the date
      const active = groupMemberships.some((m) => {
        const joinedAt = new Date(m.joinedAt);
        joinedAt.setHours(0, 0, 0, 0);
        const leftAt = m.leftAt ? new Date(m.leftAt) : null;
        if (leftAt) leftAt.setHours(0, 0, 0, 0);

        return joinedAt <= startOfDay && (!leftAt || leftAt >= startOfDay);
      });

      if (!active) {
        results.push({
          anomalyType: 'INACTIVE_MEMBER',
          severity: 'warning',
          detail: `The ${role} '${resolved.displayName}' was not an active member of the group on ${formatDateString(dateObj)}.`,
          suggestedFix: "Choose 'CREATE_IMPORT_MEMBERSHIP' to create an explicit membership starting on this date, or 'IGNORE_PARTICIPANT' (for participants only).",
        });
      }
    };

    if (row.paidBy) {
      checkTimeline(row.paidBy, 'payer');
    }
    for (const p of row.participants) {
      checkTimeline(p.nameOrEmail, 'participant');
    }

    return results;
  }
}

export class ParticipantMismatchHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    const checkMembership = (userKey: string, role: string) => {
      const resolved = context.resolvedUsers.get(userKey.toLowerCase());
      if (!resolved) return;

      const isMember = resolved.memberships.some((m) => m.groupId === context.groupId);
      if (!isMember) {
        results.push({
          anomalyType: 'PARTICIPANT_MISMATCH',
          severity: 'warning',
          detail: `The ${role} '${resolved.displayName}' is a user in the system but has never been a member of this group.`,
          suggestedFix: "Choose 'CREATE_IMPORT_MEMBERSHIP' to explicitly register them in the group, or 'IGNORE_PARTICIPANT' (for participants only).",
        });
      }
    };

    if (row.paidBy) {
      checkMembership(row.paidBy, 'payer');
    }
    for (const p of row.participants) {
      checkMembership(p.nameOrEmail, 'participant');
    }

    return results;
  }
}

export class FutureDateHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj) return [];

    const startOfToday = new Date(context.today);
    startOfToday.setHours(0, 0, 0, 0);

    const expenseDate = new Date(dateObj);
    expenseDate.setHours(0, 0, 0, 0);

    if (expenseDate > startOfToday) {
      return [{
        anomalyType: 'FUTURE_DATE',
        severity: 'warning',
        detail: `The expense date '${row.date}' is in the future relative to today.`,
        suggestedFix: 'Review the date and approve if this is a planned expense.',
      }];
    }
    return [];
  }
}

export class PreMembershipDateHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj) return [];

    const results: AnomalyResult[] = [];
    const checkPreMembership = (userKey: string, role: string) => {
      const resolved = context.resolvedUsers.get(userKey.toLowerCase());
      if (!resolved) return;

      const groupMemberships = resolved.memberships.filter((m) => m.groupId === context.groupId);
      if (groupMemberships.length === 0) return;

      // Find the earliest join date of memberships
      let earliestJoin: Date | null = null;
      for (const m of groupMemberships) {
        const j = new Date(m.joinedAt);
        if (!earliestJoin || j < earliestJoin) {
          earliestJoin = j;
        }
      }

      if (earliestJoin) {
        earliestJoin.setHours(0, 0, 0, 0);
        const startOfDay = new Date(dateObj);
        startOfDay.setHours(0, 0, 0, 0);

        if (startOfDay < earliestJoin) {
          results.push({
            anomalyType: 'PRE_MEMBERSHIP_DATE',
            severity: 'warning',
            detail: `The expense date '${row.date}' is before '${resolved.displayName}' first joined the group (${formatDateString(earliestJoin)}).`,
            suggestedFix: "Choose 'CREATE_IMPORT_MEMBERSHIP' to create an explicit membership starting on this date, or 'IGNORE_PARTICIPANT' (for participants only).",
          });
        }
      }
    };

    if (row.paidBy) {
      checkPreMembership(row.paidBy, 'payer');
    }
    for (const p of row.participants) {
      checkPreMembership(p.nameOrEmail, 'participant');
    }

    return results;
  }
}

export class LargeAmountHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const dateObj = parseLocalDate(row.date);
    if (!dateObj || isNaN(row.amount) || row.amount <= 0) return [];

    // Convert to base INR
    let rate = 1.0;
    if (row.currency && row.currency.toUpperCase() !== 'INR') {
      const match = context.exchangeRates.find(
        (r) => r.fromCode === row.currency.toUpperCase() && formatDateString(r.rateDate) === formatDateString(dateObj)
      );
      if (match) rate = match.rate;
    }
    const baseInr = row.amount * rate;

    // ₹50,000 threshold
    if (baseInr > 50000.0) {
      return [{
        anomalyType: 'LARGE_AMOUNT',
        severity: 'info',
        detail: `The total amount (₹${baseInr.toFixed(2)}) is unusually large (> ₹50,000).`,
        suggestedFix: 'Double check the figures for any misplaced decimal points.',
      }];
    }
    return [];
  }
}

export class SplitMismatchHandler implements AnomalyHandler {
  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    if (row.amount === undefined || isNaN(row.amount) || row.amount <= 0) return [];
    if (!row.splitMethod) return [];

    const method = row.splitMethod.toLowerCase();

    // Sum of shares or percentages
    let sum = 0;
    let hasUnits = false;

    for (const p of row.participants) {
      if (p.value !== undefined) {
        sum += p.value;
        hasUnits = true;
      }
    }

    if (method === 'unequal') {
      if (!hasUnits) return []; // participant values not specified in CSV
      // Sum must equal total amount (allowing tiny margin)
      if (Math.abs(sum - row.amount) > 0.05) {
        return [{
          anomalyType: 'SPLIT_MISMATCH',
          severity: 'error',
          detail: `Sum of unequal shares (${sum}) does not equal total expense amount (${row.amount}).`,
          suggestedFix: 'Update the participant shares in the CSV to sum to the total expense amount.',
        }];
      }
    } else if (method === 'percentage') {
      if (!hasUnits) return [];
      // Sum must equal 100%
      if (Math.abs(sum - 100) > 0.05) {
        return [{
          anomalyType: 'SPLIT_MISMATCH',
          severity: 'error',
          detail: `Sum of percentages (${sum}%) does not equal 100.00%.`,
          suggestedFix: 'Ensure percentages sum to exactly 100.',
        }];
      }
    }
    return [];
  }
}
