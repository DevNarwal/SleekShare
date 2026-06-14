import { NormalizedRow } from './csv-parser';
import {
  AnomalyContext,
  AnomalyHandler,
  AnomalyResult,
  MalformedRowHandler,
  InvalidDateHandler,
  NegativeAmountHandler,
  UnknownCurrencyHandler,
  ForeignCurrencyNoRateHandler,
  MissingMemberHandler,
  UnsupportedSplitTypeHandler,
  DuplicateExpenseHandler,
  DuplicateSettlementHandler,
  SettlementAsExpenseHandler,
  InactiveMemberHandler,
  ParticipantMismatchHandler,
  FutureDateHandler,
  PreMembershipDateHandler,
  LargeAmountHandler,
  SplitMismatchHandler,
} from './anomaly-handlers';

export class AnomalyDetector {
  private readonly handlers: AnomalyHandler[] = [];

  constructor() {
    this.handlers = [
      new MalformedRowHandler(),
      new InvalidDateHandler(),
      new NegativeAmountHandler(),
      new UnknownCurrencyHandler(),
      new ForeignCurrencyNoRateHandler(),
      new MissingMemberHandler(),
      new UnsupportedSplitTypeHandler(),
      new DuplicateExpenseHandler(),
      new DuplicateSettlementHandler(),
      new SettlementAsExpenseHandler(),
      new InactiveMemberHandler(),
      new ParticipantMismatchHandler(),
      new FutureDateHandler(),
      new PreMembershipDateHandler(),
      new LargeAmountHandler(),
      new SplitMismatchHandler(),
    ];
  }

  detect(row: NormalizedRow, context: AnomalyContext): AnomalyResult[] {
    const results: AnomalyResult[] = [];
    
    // First check malformed row; if there are severe parsing errors, return early
    const malformed = new MalformedRowHandler().detect(row, context);
    if (malformed.length > 0) {
      return malformed;
    }

    // Run all other handlers
    for (const handler of this.handlers) {
      if (handler instanceof MalformedRowHandler) continue;
      
      try {
        const handlerResults = handler.detect(row, context);
        results.push(...handlerResults);
      } catch (err) {
        console.error(`Error in anomaly handler ${handler.constructor.name}:`, err);
      }
    }

    return results;
  }
}
