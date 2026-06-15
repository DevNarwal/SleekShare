# Scope & Anomaly Log

This document lists all the database models, enums, and details the CSV import anomaly detection and resolution rules of **SleekShare** (SplitSmart).

---

## 1. Database Schema

The database is built on PostgreSQL with strict constraints, relations, and type safety managed through Prisma.

### Users & Authentication
* **`User`**: Core accounts containing credentials, display names, and avatar settings.
* **`RefreshToken`**: Tracks active login sessions and JWT refresh tokens.

### Groups & Memberships
* **`Group`**: Shared expense spaces. Identified uniquely by a URL-friendly `slug`.
* **`Membership`**: Tracks which users belong to which groups over time (timeline-aware with `joinedAt` and `leftAt`).
  * Has a `source` field of type `MembershipSource` (`MANUAL` or `IMPORT_RESOLUTION`).
  * Enforces a unique index: `@@unique([groupId, userId, joinedAt])`.

### Financial Transactions & Ledger
* **`Currency`**: Supported currencies (e.g. `INR`, `USD`, etc.) with `isBase` flag (where `INR` is base).
* **`ExchangeRate`**: Daily currency conversion rates to base INR (`fromCode`, `toCode`, `rateDate`, `rate`).
* **`Expense`**: Group expenses with exchange rate tracking, description, base INR amount, and payer.
* **`ExpenseParticipant`**: Maps users participating in an expense, tracking their specific share amount and ratios.
* **`Settlement`**: Record of peer-to-peer balance repayments (`fromUserId` to `toUserId`).
* **`LedgerEntry`**: Double-entry bookkeeping ledger mapping debts/credits between members for both expenses and settlements.

### CSV Import Subsystem
* **`ImportJob`**: Tracks uploaded CSV files, storing file hashes (for deduplication), status (`pending`, `reviewing`, `processing`, `completed`, `failed`), and stats.
* **`ImportRow`**: Represents parsed raw rows from the CSV, storing the final parsed JSON data and status (`pending`, `approved`, `imported`, `rejected`).
* **`ImportAnomaly`**: Tracks anomalies detected on specific rows, storing severity, description, and applied resolutions.

### Platform Support
* **`AuditLog`**: Logs structural operations (e.g., membership updates, CSV imports, resolution actions) for auditing.
* **`Message`**: Real-time group chat messages attached to individual expenses.

---

## 2. CSV Anomaly Log

When a CSV is uploaded, each row is parsed and run through the `AnomalyDetector` comprising **16 distinct handlers** that flag data problems and suggest resolutions.

### Category: Severe Malformation (Errors)
If a row fails any of these, it is flagged as an `error`. The system blocks import until a resolution is mapped or the row is rejected.

| Anomaly Type | Severity | Description / Trigger Criteria | Supported Resolution Actions |
| :--- | :--- | :--- | :--- |
| **`MALFORMED_ROW`** | `error` | Essential columns (date, description, amount, paid_by) are missing or blank. | Reject row. |
| **`INVALID_DATE`** | `error` | Date value is not parseable or format is corrupt. | Specify a valid `YYYY-MM-DD` date. |
| **`NEGATIVE_AMOUNT`** | `error` | Amount is zero or negative. | Correct the amount value to a positive figure. |
| **`UNKNOWN_CURRENCY`** | `error` | Currency code is not registered in the database. | Map code to a supported currency (e.g. `INR`). |
| **`FOREIGN_CURRENCY_NO_RATE`** | `error` | Foreign currency is used but no exchange rate is recorded for that date. | **`ENTER_EXCHANGE_RATE`**: Supply a manual FX conversion rate. |
| **`SPLIT_MISMATCH`** | `error` | Split method is `percentage` but sum of percentages $\neq 100\%$, or `unequal` and sum of shares $\neq$ total amount. | **`REMAP_SPLIT_METHOD`** / **`AUTO_ADJUST_SPLIT`**: Reset/adjust participants to equal split, or adjust values. |
| **`UNSUPPORTED_SPLIT_TYPE`** | `error` | Split method is not `'equal'`, `'unequal'`, `'percentage'`, or `'share'`. | **`REMAP_SPLIT_METHOD`**: Default back to an `'equal'` split. |
| **`MISSING_MEMBER`** | `error` | The payer or a participant does not have an active user account in the system. | **`MAP_MEMBER`**: Link the name/email alias to a registered user ID. |

### Category: Timeline & Membership Anomalies (Warnings)
These flag inconsistencies between group membership histories and transaction dates.

| Anomaly Type | Severity | Description / Trigger Criteria | Supported Resolution Actions |
| :--- | :--- | :--- | :--- |
| **`PARTICIPANT_MISMATCH`** | `warning` | A user is found in the system but has never joined this group. | <ul><li>**`CREATE_IMPORT_MEMBERSHIP`**: Register the user in the group from the transaction date.</li><li>**`IGNORE_PARTICIPANT`**: Remove the participant from the split calculation.</li></ul> |
| **`INACTIVE_MEMBER`** | `warning` | A group member was not an active member on the date of the transaction (e.g., transaction occurred after they left). | **`CREATE_IMPORT_MEMBERSHIP`**: Create a retroactive membership window starting on the transaction date. |
| **`PRE_MEMBERSHIP_DATE`** | `warning` | Transaction occurred before the member's first join date. | **`CREATE_IMPORT_MEMBERSHIP`**: Backdate their group membership starting on this transaction date. |
| **`FUTURE_DATE`** | `warning` | The transaction date is in the future. | Approve row directly (warning only) if it represents a scheduled expense, or reject it. |

### Category: Duplicates & Structural Flags (Warnings/Info)
These catch double-counting, peer-to-peer transfers, and unusually high values.

| Anomaly Type | Severity | Description / Trigger Criteria | Supported Resolution Actions |
| :--- | :--- | :--- | :--- |
| **`DUPLICATE_EXPENSE`** | `warning` | Date, description, and amount match an existing expense in the group. | Approve if it is an intentional separate charge, or reject it. |
| **`DUPLICATE_SETTLEMENT`** | `warning` | Date, payer, payee, and amount match an existing settlement record. | Reject the row to prevent double-counting. |
| **`SETTLEMENT_AS_EXPENSE`** | `warning` | Description implies a repayment (e.g. contains "settle", "repay", "transfer"). | **`REJECT_AND_CREATE_SETTLEMENT`**: Reject this as an expense and record it directly as a peer-to-peer settlement. |
| **`LARGE_AMOUNT`** | `info` | Total amount is unusually large ($> \text{₹50,000}$). | Informational warning: verify decimal points before approving. |
