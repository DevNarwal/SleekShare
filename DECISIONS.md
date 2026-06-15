# Architectural Decision Log

This document records the major design and engineering decisions made during the development of **SleekShare** (SplitSmart).

---

## 1. Database Engine: Relational PostgreSQL (SQL) vs Document MongoDB (NoSQL)
* **Significant Decision:** Choosing PostgreSQL as the core database storage engine.
* **Options Considered:** 
  1. **MongoDB (NoSQL):** Highly flexible schemas, faster initial prototype writing.
  2. **PostgreSQL (SQL):** Strict schemas, transaction support, foreign key constraints.
* **Why Chosen:** SleekShare handles shared finances. It requires bulletproof consistency, ACID transaction guarantees, and complex relationships (Users, Groups, Memberships, Expenses, Settlements, Ledger Entries). Relational PostgreSQL prevents issues like orphan transactions, invalid user records, or broken ledger links. Using **Prisma ORM** provides type safety and simplifies migrations.

---

## 2. Timeline-Aware Group Memberships
* **Significant Decision:** Designing memberships with `joinedAt` and `leftAt` timestamps rather than a standard many-to-many association.
* **Options Considered:**
  1. **Standard Join Table:** A user is either in a group or not.
  2. **Timeline-Aware Table:** Association records have explicit `joinedAt` and optional `leftAt` timestamps.
* **Why Chosen:** Group participants change over time. When a new member joins an apartment group, they should not inherit historical debts (e.g. rent from six months ago). Similarly, members who leave should not be billed for future trips. Timeline-aware memberships enable the split engine to determine active members for any historical date, ensuring accurate financial allocation.

---

## 3. Real-Time Sync with WebSockets (Socket.io)
* **Significant Decision:** Implementing Socket.io to synchronize group transactions and import progress in real time.
* **Options Considered:**
  1. **Short/Long Polling:** Clients make periodic HTTP requests to check for updates.
  2. **Server-Sent Events (SSE):** One-way real-time push from server to client.
  3. **WebSockets (Socket.io):** Bidirectional real-time channel.
* **Why Chosen:** SleekShare features shared group actions. If User A logs an expense or uploads a CSV, User B should see updates immediately. Socket.io was chosen because it handles bidirectional communication (useful for chat messages on expenses), provides automatic reconnection, and seamlessly pushes real-time CSV import processing steps (rows approved, imported, or progress updates) to the client.

---

## 4. Ledger Architecture: Double-Entry Ledger Table vs On-the-Fly Aggregation
* **Significant Decision:** Creating a `ledger_entries` table that writes static debt/credit records upon expense events.
* **Options Considered:**
  1. **On-the-Fly Calculation:** Scan and compute balances by checking all expenses and settlements in a group dynamically.
  2. **Double-Entry Ledger entries:** Write separate debt/credit records (`LedgerEntry`) whenever an expense or settlement is created, updated, or deleted.
* **Why Chosen:** On-the-fly scanning degrades in performance as transaction volume grows (e.g. loading thousands of expenses to compute user balance is expensive). The `LedgerEntry` table acts as a read-optimized financial log. Calculating a user's balance is reduced to a fast database query: `SUM(amountInr) WHERE debtorId = userId` minus `SUM(amountInr) WHERE creditorId = userId`, resolving scales instantly.

---

## 5. CSV Import Pipeline: Staged DB Drafts vs Inline Parsing
* **Significant Decision:** Implementing a staged CSV import engine (`ImportJob` and `ImportRow` database tables) instead of parsing and committing lines inline.
* **Options Considered:**
  1. **Inline Parser:** Parse the CSV uploaded by the user, match members, and immediately write to the `expenses` table.
  2. **Staged Pipeline:** Store raw file upload details in `ImportJob` (enforcing deduplication via SHA-256 hashing), save rows as `ImportRow` drafts, scan for anomalies, and let users resolve warnings before writing to the ledger.
* **Why Chosen:** Raw CSV uploads are prone to data corruption (e.g., misspelled emails, missing users, double uploads, split method conflicts). Inline parsing leads to partial failures (half the rows are committed, half fail), leaving the database in an inconsistent state. The staged pipeline keeps drafts isolated, flags the 16 anomaly checks, lets users selectively apply resolutions (like creating retroactive memberships), and processes actual imports inside a transaction.

---

## 6. Config URL Normalization in Frontend Clients
* **Significant Decision:** Implementing an automated URL sanitizer for `API_URL` and `BACKEND_URL` on the client.
* **Options Considered:**
  1. **Strict Variable Rules:** Enforce clean URLs in `.env` files (e.g., no trailing slashes, exact `/api` suffix).
  2. **Normalizer Helper:** Clean and structure the URL programmatically upon startup.
* **Why Chosen:** Environment variables are highly prone to human input error (like entering double slashes `https://domain//api` or forgetting `/api`). Adding a normalization function on startup guarantees that URLs collapse duplicate slashes and ensure proper API route matching, eliminating 404/500 routing errors.
