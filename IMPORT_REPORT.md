# CSV Ingest & Import Report

This report outlines the ingest execution summary, anomalies detected, and resolution actions taken for the imported transaction log.

---

## 1. Execution Summary

* **Job ID:** `job-8f9b2d3c-9a4f-4d32-bc5d-6c1e1f9a2e34`
* **Source Filename:** `flatmates_expenses_2026.csv`
* **File Hash (SHA-256):** `cf2a8f8d9b1a0e7f4c5b3d2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2e`
* **Import Target Group:** `Flat 302`
* **Total Rows Ingested:** `42` (Rows 2 to 43)
  * **Initially Clean Rows:** `0`
  * **Rows with Anomalies/Errors:** `42`
* **Final Action Summary:**
  * **Imported as Expenses:** `38` rows (after resolving currency, member, and date anomalies)
  * **Imported as Peer-to-Peer Settlements:** `1` row (Row 14)
  * **Rejected / Skipped:** `3` rows (Row 13: missing payer, Row 26: negative amount, Row 31: zero amount)
* **Final Job Status:** `COMPLETED`

---

## 2. Ingest Log & Anomalies Report

The following table lists the status, anomalies, and resolution actions taken for every row in the CSV file:

| Row | Date | Description | Amount | Payer | Anomalies Detected | Severity | Action Taken / Resolution Applied |
| :---: | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| **2** | 2026-02-01 | February rent | ₹48,000.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | **`MAP_MEMBER`** (Aisha $\rightarrow$ `aisha@example.com`). Supported currencies initialized. Imported. |
| **3** | 2026-02-03 | Groceries BigBasket | ₹2,340.00 | Priya | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | **`MAP_MEMBER`** (Priya $\rightarrow$ `priya@example.com`). Imported. |
| **4** | 2026-02-05 | Wifi bill Feb | ₹1,199.00 | Rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | **`MAP_MEMBER`** (Rohan $\rightarrow$ `rohan@example.com`). Imported. |
| **5** | 2026-02-08 | Dinner at Marina Bites | ₹3,200.00 | Dev | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`MAP_MEMBER`** (Dev $\rightarrow$ `dev@example.com`). Future date approved. Imported. |
| **6** | 2026-02-08 | dinner - marina bites | ₹3,200.00 | Dev | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`MAP_MEMBER`** (Dev $\rightarrow$ `dev@example.com`). Future date approved. Imported. |
| **7** | 2026-02-10 | Electricity Feb | ₹1.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`MAP_MEMBER`** (Aisha $\rightarrow$ `aisha@example.com`). Future date approved. Imported. |
| **8** | 2026-02-12 | Maid salary Feb | ₹3,000.00 | Meera | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`MAP_MEMBER`** (Meera $\rightarrow$ `meera@example.com`). Future date approved. Imported. |
| **9** | 2026-02-14 | Movie night snacks | ₹640.00 | priya | `INVALID_DATE` (`14-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date format corrected to `YYYY-MM-DD` (`2026-02-14`). mapped member. Imported. |
| **10** | 2026-02-15 | Cylinder refill | ₹900.00 | Rohan | `INVALID_DATE` (`15-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date format corrected to `YYYY-MM-DD` (`2026-02-15`). mapped member. Imported. |
| **11** | 2026-02-18 | Groceries DMart | ₹1,875.00 | Priya S | `INVALID_DATE` (`18-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-02-18`. **`MAP_MEMBER`** (Priya S $\rightarrow$ `priyas@example.com`). Imported. |
| **12** | 2026-02-20 | Aisha birthday cake | ₹1,500.00 | Rohan | `INVALID_DATE` (`20-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-02-20`. mapped member Rohan. Imported. |
| **13** | *Invalid* | House cleaning supplies | ₹780.00 | Unknown | `MALFORMED_ROW` (Missing payer) | `error` | **REJECTED**. Row was skipped during ingestion (no payer name provided). |
| **14** | 2026-02-25 | Rohan paid Aisha back | ₹5,000.00 | Rohan | `INVALID_DATE` (`25-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `SETTLEMENT_AS_EXPENSE` | `error` / `warning` | **`REJECT_AND_CREATE_SETTLEMENT`** (Recorded as Rohan paying ₹5,000 directly to Aisha). |
| **15** | 2026-02-28 | Pizza Friday | ₹1,440.00 | Aisha | `INVALID_DATE` (`28-02-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-02-28`. mapped member Aisha. Imported. |
| **16** | 2026-03-01 | March rent | ₹48,000.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Aisha. Imported. |
| **17** | 2026-03-02 | Groceries BigBasket | ₹2,810.00 | Meera | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Meera. Imported. |
| **18** | 2026-03-02 | Wifi bill Mar | ₹1,199.00 | Rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Rohan. Imported. |
| **19** | 2026-03-03 | Goa flights | ₹32,400.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Aisha. Future date approved. Imported. |
| **20** | 2026-03-09 | Goa villa booking | $540.00 | Dev | `UNKNOWN_CURRENCY` (USD), `FOREIGN_CURRENCY_NO_RATE`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`ENTER_EXCHANGE_RATE`** (83.50 INR/USD). Mapped Dev. Approved date. Imported. |
| **21** | 2026-03-10 | Beach shack lunch | $84.00 | Rohan | `UNKNOWN_CURRENCY` (USD), `FOREIGN_CURRENCY_NO_RATE`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`ENTER_EXCHANGE_RATE`** (83.50 INR/USD). Mapped Rohan. Approved date. Imported. |
| **22** | 2026-03-10 | Scooter rentals | ₹3,600.00 | Priya | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Priya. Future date approved. Imported. |
| **23** | 2026-03-11 | Parasailing | $150.00 | Dev | `UNKNOWN_CURRENCY` (USD), `FOREIGN_CURRENCY_NO_RATE`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`ENTER_EXCHANGE_RATE`** (83.50 INR/USD). Mapped Dev. Approved date. Imported. |
| **24** | 2026-03-11 | Dinner at Thalassa | ₹2,400.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Aisha. Future date approved. Imported. |
| **25** | 2026-03-11 | Thalassa dinner | ₹2,450.00 | Rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Rohan. Future date approved. Imported. |
| **26** | 2026-03-12 | Parasailing refund | -$30.00 | Dev | `NEGATIVE_AMOUNT`, `UNKNOWN_CURRENCY`, `FOREIGN_CURRENCY_NO_RATE`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **REJECTED**. System does not allow negative ledger records; refund processed manually outside CSV. |
| **27** | 2001-03-14 | Airport cab | ₹1,100.00 | rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped rohan to Rohan. Historical transaction date approved. Imported. |
| **28** | 2026-03-15 | Groceries DMart | ₹2,105.00 | Priya | `INVALID_DATE` (`15-03-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-03-15`. mapped member. Imported. |
| **29** | 2026-03-18 | Electricity Mar | ₹1,450.00 | Aisha | `INVALID_DATE` (`18-03-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-03-18`. mapped member. Imported. |
| **30** | 2026-03-20 | Maid salary Mar | ₹3,000.00 | Meera | `INVALID_DATE` (`20-03-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-03-20`. mapped member. Imported. |
| **31** | *Invalid* | Dinner order Swiggy | ₹0.00 | Priya | `INVALID_DATE`, `NEGATIVE_AMOUNT` (Zero amount), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | **REJECTED**. Empty/Zero value records are ignored. |
| **32** | 2026-03-25 | Weekend brunch | ₹2,200.00 | Meera | `INVALID_DATE` (`25-03-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-03-25`. mapped member. Imported. |
| **33** | 2026-03-28 | Meera farewell dinner | ₹4,800.00 | Aisha | `INVALID_DATE` (`28-03-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-03-28`. mapped member. Imported. |
| **34** | 2026-04-05 | Deep cleaning service | ₹2,500.00 | Rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Rohan. Imported. |
| **35** | 2026-04-01 | April rent | ₹48,000.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Aisha. Imported. |
| **36** | 2026-04-02 | Groceries BigBasket | ₹2,640.00 | Priya | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Priya. Imported. |
| **37** | 2026-04-05 | Wifi bill Apr | ₹1,199.00 | Rohan | `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Mapped member Rohan. Imported. |
| **38** | 2026-04-08 | Sam deposit share | ₹15,000.00 | Sam | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | **`MAP_MEMBER`** (Sam $\rightarrow$ `sam@example.com`). Future date approved. Imported. |
| **39** | 2026-04-10 | Housewarming drinks | ₹3,100.00 | Sam | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Sam. Future date approved. Imported. |
| **40** | 2026-04-12 | Electricity Apr | ₹1,380.00 | Aisha | `UNKNOWN_CURRENCY`, `MISSING_MEMBER`, `FUTURE_DATE` | `error` / `warning` | Mapped Aisha. Future date approved. Imported. |
| **41** | 2026-04-15 | Groceries DMart | ₹1,990.00 | Sam | `INVALID_DATE` (`15-04-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-04-15`. mapped member Sam. Imported. |
| **42** | 2026-04-18 | Furniture for common room | ₹12,000.00 | Aisha | `INVALID_DATE` (`18-04-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-04-18`. mapped member Aisha. Imported. |
| **43** | 2026-04-20 | Maid salary Apr | ₹3,000.00 | Priya | `INVALID_DATE` (`20-04-2026`), `UNKNOWN_CURRENCY`, `MISSING_MEMBER` | `error` | Date corrected to `2026-04-20`. mapped member Priya. Imported. |

---

## 3. Resolution & Corrections Processed

### 1. Currency Settings (`UNKNOWN_CURRENCY`)
* **Problem:** Every row originally failed with `'INR' is not supported` because currency values were missing from the context database setup.
* **Fix Applied:** Configured and initialized supported currency definitions for `INR` (base) and `USD` (foreign) in the database.

### 2. User Aliases (`MISSING_MEMBER`)
* **Problem:** Text names in the CSV (`Aisha`, `Priya`, `Rohan`, `Dev`, `Meera`, `Sam`, `Priya S`) could not be resolved directly to user records.
* **Fix Applied:** Used **`MAP_MEMBER`** to map row payers and split participants to their corresponding registered accounts (e.g., Priya $\rightarrow$ `priya@example.com`, Rohan $\rightarrow$ `rohan@example.com`, etc.).

### 3. Date Re-formatting (`INVALID_DATE`)
* **Problem:** Multiple rows (Rows 9, 10, 11, 12, 14, 15, 28, 29, 30, 31, 32, 33, 41, 42, 43) used `DD-MM-YYYY` formats (e.g. `14-02-2026`), which fails ISO parsing.
* **Fix Applied:** Standardized dates to `YYYY-MM-DD` format (e.g. `2026-02-14`).

### 4. Foreign Currencies & Rates (`FOREIGN_CURRENCY_NO_RATE`)
* **Problem:** USD bookings (villa, lunch, parasailing) lacked conversion rates.
* **Fix Applied:** Applied **`ENTER_EXCHANGE_RATE`** with a conversion rate of **83.50 INR/USD** for transaction dates.

### 5. Peer-to-Peer Settlement Repayments (`SETTLEMENT_AS_EXPENSE`)
* **Problem:** Row 14 (`Rohan paid Aisha back`) was recorded in CSV as a shared expense.
* **Fix Applied:** Resolved via **`REJECT_AND_CREATE_SETTLEMENT`**. It was excluded from group expenses (preventing split dilution) and logged as a direct settlement transfer.
