import * as Papa from 'papaparse';

export interface ParsedCsvRow {
  date?: string;
  description?: string;
  amount?: string;
  currency?: string;
  paid_by?: string;
  split_method?: string;
  participants?: string;
}

export interface NormalizedParticipant {
  nameOrEmail: string;
  value?: number; // amount, percentage, or share ratio
}

export interface NormalizedRow {
  rowNumber: number;
  rawData: Record<string, string>;
  date: string;
  description: string;
  amount: number;
  currency: string;
  paidBy: string;
  splitMethod: string;
  participants: NormalizedParticipant[];
}

export class CsvParser {
  static parse(csvContent: string): NormalizedRow[] {
    const parseResult = Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0 && parseResult.data.length === 0) {
      throw new Error(`CSV Parsing Failed: ${parseResult.errors[0].message}`);
    }

    return parseResult.data.map((row: any, index: number) => {
      const rowNumber = index + 2; // CSV headers are row 1, index 0 is row 2
      const rawData: Record<string, string> = {};
      
      // Store original key-values for rawData
      for (const key of Object.keys(row)) {
        rawData[key] = String(row[key] ?? '').trim();
      }

      // Case-insensitive header matching
      const getVal = (possibleKeys: string[]): string => {
        for (const k of Object.keys(row)) {
          if (possibleKeys.includes(k.toLowerCase().trim())) {
            return String(row[k] ?? '').trim();
          }
        }
        return '';
      };

      const dateStr = getVal(['date']);
      const description = getVal(['description', 'desc']);
      const amountStr = getVal(['amount', 'price', 'cost']);
      const currency = getVal(['currency', 'curr', 'currency_code', 'currencycode']) || 'INR';
      const paidBy = getVal(['paid_by', 'paidby', 'payer', 'paid by']);
      const splitMethod = getVal(['split_method', 'splitmethod', 'split', 'split method']) || 'equal';
      const participantsStr = getVal(['participants', 'members', 'people']);

      // Parse participants: delimiter supports ",", ";", "|"
      const participants: NormalizedParticipant[] = [];
      if (participantsStr) {
        // Replace ; and | with ,
        const normalizedParticipantsStr = participantsStr.replace(/[;|]/g, ',');
        const tokens = normalizedParticipantsStr.split(',').map((t) => t.trim()).filter(Boolean);

        for (const token of tokens) {
          // Check if it's name:value or name(value)
          // We support User:Value or User(Value)
          let nameOrEmail = token;
          let value: number | undefined = undefined;

          const colonIndex = token.indexOf(':');
          if (colonIndex !== -1) {
            nameOrEmail = token.substring(0, colonIndex).trim();
            const valStr = token.substring(colonIndex + 1).replace('%', '').trim();
            const valNum = parseFloat(valStr);
            if (!isNaN(valNum)) {
              value = valNum;
            }
          }

          participants.push({ nameOrEmail, value });
        }
      }

      return {
        rowNumber,
        rawData,
        date: dateStr,
        description,
        amount: parseFloat(amountStr) || 0,
        currency: currency.toUpperCase(),
        paidBy,
        splitMethod: splitMethod.toLowerCase(),
        participants,
      };
    });
  }
}
