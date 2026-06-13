# AI_CONTEXT.md — SplitSmart
> Master engineering context document. Update after every significant change.
> Last updated: 2026-06-13 | Version: 1.0.0

---

## 1. Product Understanding

SplitSmart is a **multi-tenant, group expense splitting application** for shared living arrangements, trips, and one-off shared costs. Users belong to multiple groups, record expenses with flexible split methods, settle debts peer-to-peer, and import historical data via CSV. Every financial event is immutably recorded in an audit log.

### Core Value Propositions
1. **Trust** — Every balance is explainable line-by-line; nothing is a black box.
2. **Accuracy** — Multi-currency, membership-timeline-aware, no silent modifications.
3. **Migration** — Import messy historical spreadsheets with anomaly detection and approval workflow.
4. **Real-time** — All group members see changes as they happen.

### Persona Requirements
| Persona | Key Requirement | System Implication |
|---|---|---|
| Aisha Khan | Simplified debt graph | `simplifyDebts()` min-cash-flow algorithm |
| Rohan Mehta | Every balance fully explainable | `explainBalance()` per-expense trace |
| Priya Iyer | Multi-currency + exchange rates | Locked FX rates at creation, `amount_base_inr` |
| Sam Patel | Pre-membership expenses excluded | Membership timeline gate on balance calc |
| Meera Joshi | Duplicate corrections need approval | Anomaly review queue, no silent apply |

---

## 2. Scope

### In Scope (MVP)
- Email + password authentication (JWT access + refresh tokens)
- Multi-tenant workspaces: users → many groups
- Group creation with member management (admin adds directly, no email invite)
- Expense CRUD with 4 split methods: Equal, Unequal, Percentage, Share (ratio)
- Multi-currency expenses with locked exchange rates → stored as INR base
- Membership timeline: `joined_at` / `left_at` gates eligibility per expense date
- Balance system: derived (never stored), Simplified / Raw / Why-You-Owe views
- Settlements: group-scoped peer-to-peer transfers, CRUD with audit trail
- CSV import: parser → validator → anomaly detector → review queue → approval → ledger
- Audit log: append-only, all members can view
- Per-expense chat: real-time via Socket.IO
- Dashboard: balance cards, recent activity, upcoming settlements, quick actions
- Expense flags: `duplicate_candidate`, `imported`, `foreign_currency`, `pre_membership`, `settlement_candidate`, `validation_warning`

### Out of Scope (MVP)
- Email verification / magic links
- Email invite flow for group membership
- Push notifications
- Mobile native app
- Role-based audit log access control
- Materialized balance views
- Redis / multi-server Socket.IO scaling
- Recurring expenses
- Receipt image upload

---

## 3. User Stories

### Authentication
- As a user, I can sign up with email + password and receive a JWT access token + refresh token.
- As a user, I can sign in and have my session persisted.
- As a user, my access token expires after 15 minutes; a silent refresh uses my refresh token.

### Groups
- As a user, I can create a group with a name, icon, and initial members.
- As a user, I can view all groups I belong to with volume and member list.
- As a group admin, I can add members to a group.
- As a group admin, I can remove members (sets `left_at`; does not delete historical data).
- As any member, I can see the membership timeline.

### Expenses
- As a group member, I can add an expense with description, amount, currency, date, payer, split method, and participants.
- As a group member, I can edit an existing expense (creates `expense.updated` audit event).
- As a group member, I can delete an expense (creates `expense.deleted` audit event).
- As a group member, I can view all expenses grouped by month.
- As a group member, I can search and filter expenses by description, member, flags.
- As Priya, expenses in USD/EUR/GBP auto-convert to INR at the locked rate for that date.

### Balances
- As Aisha, I see the minimum number of transfers to clear all debts (Simplified tab).
- As Rohan, I see the raw net position of every member (Raw tab).
- As Rohan, I can drill into any balance and see every expense that contributes to it (Why You Owe tab).
- As a member, the balance ignores expenses outside my membership window.

### Settlements
- As a member, I can record a peer-to-peer payment with amount, from, to, date, note.
- As a member, I can view the settlement history for a group.
- As a member, I can edit or delete a settlement (with audit trail).
- The Record Payment screen shows suggested settlements from the simplified graph.

### CSV Import
- As Aisha, I can upload a CSV of historical expenses.
- The system parses the CSV and flags all anomalies before applying anything.
- I can review each anomaly and approve or reject individually.
- I can bulk-approve clean rows while handling anomalies separately.
- Approved rows are imported using the original CSV dates.
- The audit log records every import decision.

### Audit Log
- As any group member, I can view the full append-only log of all events.
- Events are attributed (actor), typed (event kind), timestamped, and include metadata.

### Chat
- As a member, I can comment on a specific expense.
- Comments are delivered in real-time to other members viewing the same expense.
- I can edit and delete my own messages.

### Dashboard
- As a user, I see my net balance across all groups (You Owe / You Are Owed / Net).
- I see recent activity across all my groups.
- I see upcoming suggested settlements.
- Quick actions: Add Expense, Record Settlement, Import CSV.

---

## 4. Database Schema

```sql
-- USERS
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100) NOT NULL,
  avatar_initials CHAR(2),
  avatar_color  VARCHAR(7),    -- hex color
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- REFRESH TOKENS
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- GROUPS
CREATE TABLE groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  icon        VARCHAR(10),       -- emoji
  created_by  UUID NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- MEMBERSHIPS (timeline-aware)
CREATE TABLE memberships (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        VARCHAR(20) DEFAULT 'member',  -- 'admin' | 'member'
  joined_at   TIMESTAMPTZ NOT NULL,
  left_at     TIMESTAMPTZ,                  -- NULL = still active
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id, joined_at)      -- allows re-joining
);

-- CURRENCIES
CREATE TABLE currencies (
  code        CHAR(3) PRIMARY KEY,           -- 'INR', 'USD', 'EUR', 'GBP'
  name        VARCHAR(50) NOT NULL,
  symbol      VARCHAR(5) NOT NULL,
  is_base     BOOLEAN DEFAULT FALSE          -- TRUE for INR
);

-- EXCHANGE RATES (locked at event time)
CREATE TABLE exchange_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_code   CHAR(3) NOT NULL REFERENCES currencies(code),
  to_code     CHAR(3) NOT NULL REFERENCES currencies(code),
  rate        DECIMAL(18,6) NOT NULL,
  rate_date   DATE NOT NULL,
  source      VARCHAR(50) DEFAULT 'manual',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(from_code, to_code, rate_date)
);

-- EXPENSES
CREATE TABLE expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id          UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description       VARCHAR(500) NOT NULL,
  amount_original   DECIMAL(18,2) NOT NULL,
  currency_code     CHAR(3) NOT NULL REFERENCES currencies(code),
  exchange_rate     DECIMAL(18,6) NOT NULL DEFAULT 1.0,
  amount_base_inr   DECIMAL(18,2) NOT NULL,
  paid_by           UUID NOT NULL REFERENCES users(id),
  expense_date      DATE NOT NULL,
  split_method      VARCHAR(20) NOT NULL,    -- 'equal'|'unequal'|'percentage'|'share'
  category          VARCHAR(50),
  notes             TEXT,
  flags             TEXT[] DEFAULT '{}',    -- array of flag strings
  is_deleted        BOOLEAN DEFAULT FALSE,
  import_job_id     UUID,                   -- set if created via import
  created_by        UUID NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- EXPENSE PARTICIPANTS
CREATE TABLE expense_participants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id        UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id),
  share_amount_inr  DECIMAL(18,2) NOT NULL,  -- their portion in INR
  share_units       DECIMAL(18,4),            -- raw units (for share/percentage)
  is_settled        BOOLEAN DEFAULT FALSE,
  UNIQUE(expense_id, user_id)
);

-- SETTLEMENTS
CREATE TABLE settlements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_user_id  UUID NOT NULL REFERENCES users(id),
  to_user_id    UUID NOT NULL REFERENCES users(id),
  amount_inr    DECIMAL(18,2) NOT NULL,
  settlement_date DATE NOT NULL,
  note          TEXT,
  is_deleted    BOOLEAN DEFAULT FALSE,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- LEDGER ENTRIES (for import / manual adjustments — not auto-generated from expenses)
CREATE TABLE ledger_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  entry_type    VARCHAR(50) NOT NULL,   -- 'adjustment' | 'opening_balance'
  debtor_id     UUID NOT NULL REFERENCES users(id),
  creditor_id   UUID NOT NULL REFERENCES users(id),
  amount_inr    DECIMAL(18,2) NOT NULL,
  entry_date    DATE NOT NULL,
  note          TEXT,
  created_by    UUID NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- IMPORT JOBS
CREATE TABLE import_jobs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES groups(id),
  uploaded_by     UUID NOT NULL REFERENCES users(id),
  filename        VARCHAR(255) NOT NULL,
  file_hash       VARCHAR(64) NOT NULL,
  total_rows      INT NOT NULL DEFAULT 0,
  clean_rows      INT NOT NULL DEFAULT 0,
  anomaly_rows    INT NOT NULL DEFAULT 0,
  imported_rows   INT NOT NULL DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|reviewing|completed|failed
  created_at      TIMESTAMPTZ DEFAULT now(),
  completed_at    TIMESTAMPTZ
);

-- IMPORT ROWS (every parsed row)
CREATE TABLE import_rows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id          UUID NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number      INT NOT NULL,
  raw_data        JSONB NOT NULL,     -- original CSV row as-is
  parsed_data     JSONB,              -- normalized parsed values
  status          VARCHAR(20) DEFAULT 'pending',  -- pending|clean|anomaly|approved|rejected|imported
  created_expense_id UUID REFERENCES expenses(id)
);

-- IMPORT ANOMALIES (one or more per row)
CREATE TABLE import_anomalies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id          UUID NOT NULL REFERENCES import_rows(id) ON DELETE CASCADE,
  anomaly_type    VARCHAR(50) NOT NULL,   -- see anomaly type enum
  severity        VARCHAR(10) NOT NULL,  -- 'error'|'warning'
  detail          TEXT NOT NULL,
  suggested_fix   TEXT,
  resolved_by     UUID REFERENCES users(id),
  resolution      VARCHAR(20),           -- 'approved'|'rejected'|'modified'
  resolved_at     TIMESTAMPTZ
);

-- AUDIT LOGS
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id    UUID REFERENCES groups(id),
  actor_id    UUID NOT NULL REFERENCES users(id),
  event_type  VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   UUID,
  metadata    JSONB DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- MESSAGES (per-expense chat)
CREATE TABLE messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id  UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  is_deleted  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
```

### Key Indexes
```sql
CREATE INDEX idx_memberships_group_user ON memberships(group_id, user_id);
CREATE INDEX idx_memberships_timeline ON memberships(group_id, joined_at, left_at);
CREATE INDEX idx_expenses_group_date ON expenses(group_id, expense_date) WHERE is_deleted = FALSE;
CREATE INDEX idx_expenses_paid_by ON expenses(paid_by);
CREATE INDEX idx_expense_participants_expense ON expense_participants(expense_id);
CREATE INDEX idx_expense_participants_user ON expense_participants(user_id);
CREATE INDEX idx_settlements_group ON settlements(group_id) WHERE is_deleted = FALSE;
CREATE INDEX idx_audit_logs_group ON audit_logs(group_id, created_at DESC);
CREATE INDEX idx_messages_expense ON messages(expense_id, created_at ASC);
CREATE INDEX idx_import_rows_job ON import_rows(job_id, status);
```

---

## 5. API Contracts

### Base URL
- Development: `http://localhost:3001/api`
- Production: `https://splitsmart-api.railway.app/api`

### Auth Headers
All protected routes require: `Authorization: Bearer <access_token>`

---

#### AUTH MODULE

```
POST /auth/register
Body: { email, password, displayName }
Response: { user, accessToken, refreshToken }

POST /auth/login
Body: { email, password }
Response: { user, accessToken, refreshToken }

POST /auth/refresh
Body: { refreshToken }
Response: { accessToken, refreshToken }

POST /auth/logout
Body: { refreshToken }
Response: 204 No Content
```

#### USERS MODULE

```
GET /users/me
Response: { id, email, displayName, avatarInitials, avatarColor, createdAt }

PATCH /users/me
Body: { displayName?, avatarColor? }
Response: updated user

GET /users/search?q=<query>
Response: [ user, ... ]   -- for adding to groups
```

#### GROUPS MODULE

```
GET /groups
Response: [ { id, name, icon, memberCount, volume, members[], createdAt } ]

POST /groups
Body: { name, icon, memberIds[] }
Response: group

GET /groups/:id
Response: group with members and recent stats

PATCH /groups/:id
Body: { name?, icon? }
Response: updated group

GET /groups/:id/members
Response: [ { user, role, joinedAt, leftAt } ]

POST /groups/:id/members
Body: { userId, joinedAt? }
Response: membership

DELETE /groups/:id/members/:userId
Body: { leftAt? }
Response: updated membership (sets left_at)
```

#### EXPENSES MODULE

```
GET /groups/:groupId/expenses?page&limit&search&member&flags&month
Response: { data: expense[], total, page }

POST /groups/:groupId/expenses
Body: {
  description, amountOriginal, currencyCode, exchangeRate?,
  paidBy, expenseDate, splitMethod, category?, notes?,
  participants: [{ userId, shareAmount?, shareUnits? }]
}
Response: expense with participants

GET /groups/:groupId/expenses/:id
Response: expense with participants + messages

PATCH /groups/:groupId/expenses/:id
Body: (same as POST, partial)
Response: updated expense

DELETE /groups/:groupId/expenses/:id
Response: 204 No Content
```

#### BALANCES MODULE

```
GET /groups/:groupId/balances/simplified
Response: { transfers: [{ from, to, amount }] }

GET /groups/:groupId/balances/raw
Response: { members: [{ user, netBalance, totalPaid, totalOwed }] }

GET /groups/:groupId/balances/explain?userId=&targetUserId=
Response: {
  balance: number,
  breakdown: [{ expense, date, totalAmount, yourShare, outstanding }]
}
```

#### SETTLEMENTS MODULE

```
GET /groups/:groupId/settlements
Response: [ settlement ]

POST /groups/:groupId/settlements
Body: { fromUserId, toUserId, amountInr, settlementDate, note? }
Response: settlement

PATCH /groups/:groupId/settlements/:id
Body: partial settlement
Response: updated settlement

DELETE /groups/:groupId/settlements/:id
Response: 204 No Content
```

#### CSV IMPORT MODULE

```
POST /groups/:groupId/import
Content-Type: multipart/form-data
Body: file (CSV)
Response: { jobId, totalRows, cleanRows, anomalyRows, anomalies[] }

GET /groups/:groupId/import/:jobId
Response: full import job with rows and anomalies

POST /groups/:groupId/import/:jobId/approve-all
Response: { importedCount }

POST /groups/:groupId/import/:jobId/rows/:rowId/approve
Response: updated row

POST /groups/:groupId/import/:jobId/rows/:rowId/reject
Body: { reason? }
Response: updated row

POST /groups/:groupId/import/:jobId/import-clean
Response: { importedCount }
```

#### AUDIT LOG MODULE

```
GET /groups/:groupId/audit?page&limit&eventType&actorId
Response: { data: auditLog[], total, page }
```

#### MESSAGES MODULE

```
GET /expenses/:expenseId/messages
Response: [ message ]

POST /expenses/:expenseId/messages
Body: { content }
Response: message

PATCH /expenses/:expenseId/messages/:id
Body: { content }
Response: updated message

DELETE /expenses/:expenseId/messages/:id
Response: 204 No Content
```

#### DASHBOARD MODULE

```
GET /dashboard
Response: {
  youOwe: number,
  youAreOwed: number,
  netBalance: number,
  recentActivity: auditLog[],
  upcomingSettlements: transfer[],
  groupsSummary: [{ group, yourBalance }]
}
```

---

## 6. Frontend Architecture

### Stack
- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- shadcn/ui component library
- TanStack Query v5 (server state)
- Socket.IO Client
- React Hook Form + Zod (forms)
- next-themes (dark mode future)

### Directory Structure
```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              # AppShell with sidebar
│   │   ├── dashboard/page.tsx
│   │   ├── groups/
│   │   │   ├── page.tsx            # Groups grid
│   │   │   ├── new/page.tsx        # Create group
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # Group detail (redirects to expenses)
│   │   │       ├── expenses/page.tsx
│   │   │       ├── balances/page.tsx
│   │   │       ├── settlements/page.tsx
│   │   │       ├── import/page.tsx
│   │   │       └── audit/page.tsx
│   │   └── expenses/
│   │       └── [id]/page.tsx       # Expense detail + chat
│   └── layout.tsx                  # Root with QueryProvider, SocketProvider
├── components/
│   ├── ui/                         # shadcn auto-generated
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── AppShell.tsx
│   │   └── TopBar.tsx
│   ├── expenses/
│   │   ├── ExpenseList.tsx
│   │   ├── ExpenseRow.tsx
│   │   ├── AddExpenseForm.tsx
│   │   ├── ExpenseDetail.tsx
│   │   └── SplitMethodSelector.tsx
│   ├── balances/
│   │   ├── SimplifiedView.tsx
│   │   ├── RawView.tsx
│   │   └── WhyYouOweView.tsx
│   ├── groups/
│   │   ├── GroupCard.tsx
│   │   └── CreateGroupForm.tsx
│   ├── settlements/
│   │   ├── SettlementList.tsx
│   │   └── RecordPaymentForm.tsx
│   ├── import/
│   │   ├── CsvDropzone.tsx
│   │   ├── ImportReview.tsx
│   │   └── AnomalyRow.tsx
│   ├── audit/
│   │   └── AuditLogList.tsx
│   ├── chat/
│   │   ├── MessageThread.tsx
│   │   └── MessageInput.tsx
│   └── dashboard/
│       ├── BalanceSummaryCards.tsx
│       └── RecentActivity.tsx
├── hooks/
│   ├── useAuth.ts
│   ├── useSocket.ts
│   ├── useBalances.ts
│   └── useExpenses.ts
├── lib/
│   ├── api.ts                      # axios instance with interceptors
│   ├── queryKeys.ts
│   └── formatters.ts
├── providers/
│   ├── QueryProvider.tsx
│   └── SocketProvider.tsx
├── stores/
│   └── authStore.ts                # Zustand for auth state
└── types/
    └── index.ts                    # shared TypeScript types
```

### State Management Strategy
- **Server state**: TanStack Query (all API data, cache invalidation on mutations)
- **Auth state**: Zustand store + localStorage for token persistence
- **Real-time**: Socket.IO events → TanStack Query cache invalidation
- **Form state**: React Hook Form local state

### Real-time Integration
Socket.IO client connects on app mount with auth token. Events received:
```
expense.created  → invalidate expenses list, balances
expense.updated  → invalidate expense + balances
expense.deleted  → invalidate expenses list + balances
settlement.*     → invalidate settlements + balances
message.created  → append to message thread cache
balance.updated  → invalidate balances
member.*         → invalidate group members
import.completed → invalidate import job
```

---

## 7. Backend Architecture

### Stack
- NestJS 10 (modular, DI container)
- Prisma ORM (type-safe DB access)
- PostgreSQL 15
- Socket.IO (with NestJS gateway)
- Passport.js + JWT (auth strategy)
- class-validator + class-transformer (DTO validation)
- bcrypt (password hashing)
- multer (file upload)
- papaparse (CSV parsing — Node.js)

### Module Structure
```
src/
├── main.ts
├── app.module.ts
├── prisma/
│   ├── prisma.service.ts
│   └── schema.prisma
├── common/
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   └── group-member.guard.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── interceptors/
│   │   └── audit.interceptor.ts
│   └── filters/
│       └── http-exception.filter.ts
├── modules/
│   ├── auth/
│   │   ├── auth.module.ts
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── strategies/jwt.strategy.ts
│   │   └── dto/
│   ├── users/
│   ├── groups/
│   ├── memberships/
│   ├── expenses/
│   ├── balances/
│   │   ├── balances.module.ts
│   │   ├── balances.controller.ts
│   │   └── balances.service.ts       # Core algorithm logic
│   ├── settlements/
│   ├── ledger/
│   ├── import/
│   │   ├── import.module.ts
│   │   ├── import.controller.ts
│   │   ├── import.service.ts
│   │   ├── pipeline/
│   │   │   ├── csv-parser.ts
│   │   │   ├── validator.ts
│   │   │   ├── anomaly-detector.ts
│   │   │   └── import-applier.ts
│   │   └── anomaly-handlers/         # One file per anomaly type
│   ├── audit/
│   ├── messages/
│   └── events/
│       └── events.gateway.ts         # Socket.IO gateway
```

### Request Lifecycle
```
Request
  → JwtAuthGuard (verify token, attach user)
  → GroupMemberGuard (verify group membership for group routes)
  → Controller (parse, validate DTO)
  → Service (business logic)
  → Repository via Prisma (data access)
  → AuditInterceptor (log mutation events post-response)
  → EventsGateway.emit (broadcast to room)
  → Response
```

---

## 8. Import Architecture

### Pipeline Stages
```
1. UPLOAD     → Multer receives file, store raw bytes
2. PARSE      → PapaParse CSV → array of raw row objects
3. VALIDATE   → Schema validation (required fields, types, formats)
4. DETECT     → Anomaly detection pass over all rows
5. CLASSIFY   → Mark each row: clean | anomaly
6. PERSIST    → Save ImportJob + ImportRows + ImportAnomalies to DB
7. REVIEW     → Frontend presents queue for user decisions
8. APPLY      → Approved rows create Expense + ExpenseParticipants records
9. REPORT     → AuditLog event: import.completed with stats
```

### CSV Column Spec
Expected columns (order-independent, case-insensitive header match):
```
date          DATE     required  — expense date, original is preserved
description   STRING   required
amount        DECIMAL  required
currency      STRING   optional  — defaults to INR
paid_by       STRING   required  — display name or email
split_method  STRING   optional  — defaults to equal
participants  STRING   optional  — comma-separated names/emails
```

### Anomaly Types & Handling
| Type | Severity | Detection Logic | Suggested Fix |
|---|---|---|---|
| `duplicate_expense` | warning | Same date + description + amount within group | Skip or merge |
| `duplicate_settlement` | warning | Same date + from + to + amount | Skip |
| `settlement_as_expense` | warning | Description contains "paid", "transfer", "settlement", amount matches known debt | Re-classify as settlement |
| `invalid_date` | error | Cannot be parsed as date | Reject row |
| `future_date` | warning | date > today | Flag for review |
| `negative_amount` | error | amount <= 0 | Reject row |
| `unknown_currency` | error | Currency code not in currencies table | Reject or map |
| `missing_member` | error | paid_by or participant name/email not found | Reject row |
| `inactive_member` | warning | Member left group before expense_date | Exclude member or reject |
| `split_mismatch` | error | Participant amounts don't sum to total | Reject or auto-adjust |
| `participant_mismatch` | warning | Participant not in group at expense date | Flag |
| `malformed_row` | error | Missing required columns, unparseable | Reject row |
| `unsupported_split_type` | error | split_method not in allowed set | Reject or default |

Anomaly detector is **pluggable**: each anomaly type is a separate handler class implementing `AnomalyHandler` interface:
```typescript
interface AnomalyHandler {
  type: AnomalyType;
  detect(row: ParsedRow, context: ImportContext): AnomalyResult | null;
}
```

---

## 9. Balance Algorithms

### Data Sources (never stored balances)
```
calculateGroupBalances(groupId):
  1. Fetch all non-deleted expenses for group (with participants)
  2. Fetch all non-deleted settlements for group
  3. For each expense participant:
     - Check membership eligibility: joined_at <= expense_date <= (left_at ?? infinity)
     - If eligible: payer is owed share_amount_inr from participant
  4. For each settlement: from_user reduces debt to to_user by amount
  5. Aggregate net positions per user pair
```

### Raw Balances
```typescript
type RawBalance = {
  userId: string;
  totalPaid: number;    // sum of all expenses this user paid
  totalOwed: number;    // sum of all shares this user owes
  netBalance: number;   // totalPaid - totalOwed (positive = owed money back)
}
```

### Simplified Debt — Min-Cash-Flow Algorithm
```
Input: net position for each member (positive = creditor, negative = debtor)
Algorithm:
  1. Separate into creditors (net > 0) and debtors (net < 0)
  2. Use greedy approach:
     While creditors and debtors both non-empty:
       Take largest creditor C and largest debtor D
       payment = min(C.balance, abs(D.balance))
       Record transfer: D pays C, amount = payment
       C.balance -= payment
       D.balance += payment
       Remove from list if balance reaches 0
  3. Return list of transfers (minimum count)
```

### Why You Owe — Per-Pair Explanation
```
explainBalance(userId, targetUserId, groupId):
  1. Filter expenses where paidBy == targetUserId AND userId in participants
     → these are amounts userId owes targetUserId
  2. Filter expenses where paidBy == userId AND targetUserId in participants
     → these are amounts targetUserId owes userId
  3. Filter settlements between the pair
  4. Return line-by-line breakdown
```

### Membership Gate
```
isEligible(userId, groupId, expenseDate):
  Find membership where group_id = groupId AND user_id = userId
    AND joined_at <= expenseDate
    AND (left_at IS NULL OR left_at >= expenseDate)
  Return true if found
```

---

## 10. Currency Handling

### Storage Model
Every expense stores:
- `amount_original` — the entered amount in original currency
- `currency_code` — e.g., 'USD'
- `exchange_rate` — rate at creation date (original → INR)
- `amount_base_inr` — computed: `amount_original * exchange_rate`

### Rate Locking
- Rate is fetched/entered at expense creation time
- **Never recalculated** after creation
- Import: rate from CSV or fetched for historical date

### Frontend Behavior
- If user selects non-INR currency, show exchange rate input (pre-filled from a rates endpoint)
- Display: show original amount + "(≈ ₹X,XXX)" in UI
- Balance computations always use `amount_base_inr`

### Supported Currencies (MVP seed)
INR (base), USD, EUR, GBP, SGD, AED

---

## 11. Membership Timeline Rules

### Core Invariant
> A user's financial responsibility for an expense is determined by whether they were an active member of the group **on the date of the expense**.

```
Active = joined_at <= expense_date AND (left_at IS NULL OR left_at >= expense_date)
```

### Edge Cases
1. **Re-joining**: Multiple membership rows allowed per (group, user) — use the row whose window contains the expense date.
2. **Day of joining**: `joined_at <= expense_date` (inclusive).
3. **Day of leaving**: `left_at >= expense_date` (inclusive — last day is still active).
4. **Pre-membership expenses in import**: Flagged as `pre_membership` anomaly; user can approve (override) or reject.
5. **Balance calculation**: If a participant has no eligible membership, their share is excluded from that user's balance contribution.

---

## 12. Real-time Events

### Socket.IO Rooms
- Each group has a room: `group:{groupId}`
- Each expense has a room: `expense:{expenseId}` (for chat)
- User joins their group rooms on connect

### Event Payloads
```typescript
// expense.created
{ groupId, expense: ExpenseDto }

// expense.updated
{ groupId, expense: ExpenseDto }

// expense.deleted
{ groupId, expenseId: string }

// settlement.created
{ groupId, settlement: SettlementDto }

// balance.updated
{ groupId }   // client re-fetches balances

// message.created
{ expenseId, message: MessageDto }

// member.joined
{ groupId, membership: MembershipDto }

// member.left
{ groupId, userId: string }

// import.completed
{ groupId, jobId: string, summary: ImportSummaryDto }
```

---

## 13. Deployment Plan

### Frontend — Vercel
- Framework: Next.js
- Environment variables: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL`
- Build command: `next build`
- Auto-deploy on `main` branch push

### Backend — Railway
- Service: NestJS app
- Environment variables: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `PORT`
- Start command: `npm run start:prod`
- Dockerfile or Nixpacks auto-detection

### Database — Railway PostgreSQL
- Managed PostgreSQL service
- `DATABASE_URL` injected into backend service
- Migrations: `prisma migrate deploy` on each deploy

### CI/CD
- GitHub Actions workflow:
  1. `pnpm install`
  2. `pnpm test` (backend Jest)
  3. `prisma generate`
  4. Deploy to Railway (backend)
  5. Deploy to Vercel (frontend)

---

## 14. Testing Plan

### Backend (Jest)
| Test Suite | Coverage Target |
|---|---|
| `auth.service.spec.ts` | Register, login, refresh, logout |
| `balances.service.spec.ts` | calculateGroupBalances, simplifyDebts, explainBalance, membership gate |
| `import.service.spec.ts` | All 13 anomaly types, clean import, partial approval |
| `expenses.service.spec.ts` | CRUD, split calculations (all 4 methods) |
| `settlements.service.spec.ts` | CRUD, balance impact |

### Frontend (Vitest)
| Test | Coverage |
|---|---|
| Split calculation utils | Equal, Unequal, Percentage, Share |
| Currency formatter | INR, USD, EUR display |
| Date utilities | Membership window checks |

### E2E (Playwright — optional, critical flows)
1. Register → Create group → Add expense → View balance
2. Upload CSV → Review anomalies → Approve → Verify in expenses list
3. Record settlement → Verify balance updated

---

## 15. Tradeoffs & Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Balance storage | Derived only, never persisted | Correctness over performance; balances are always consistent with source data |
| Settlement scope | Group-scoped | Prevents cross-group balance contamination |
| Import date | Always original CSV date | Historical fidelity; import date would corrupt timeline |
| Anomaly handling | Pluggable handler per type | Extensible without modifying core pipeline |
| Re-join support | Multiple membership rows | Users can leave and rejoin; timeline handles it |
| FX rate locking | At creation time | Prevents historical recomputation instability |
| No Redis MVP | In-memory Socket.IO | Acceptable for single-instance MVP; add Redis later for scaling |
| Soft delete | `is_deleted` flag | Audit trail; expense can be referenced in audit log even after deletion |

---

## 16. Known Limitations (MVP)
1. Balance computation is O(n) on expenses — may be slow for large groups. Solution: add DB-level aggregation or caching layer post-MVP.
2. Socket.IO with no Redis adapter means real-time only works on single server instance.
3. Exchange rates are manually entered — no automatic rate API in MVP.
4. No email invite — admin must add users who already have accounts.
5. No role-based access control beyond admin/member distinction.
6. CSV import handles known columns only — custom column names need manual mapping.

---

## 17. Prompt History
| # | Date | Prompt Summary | Output |
|---|---|---|---|
| 1 | 2026-06-13 | Initial prototype analysis + 25 clarifying questions | Question document |
| 2 | 2026-06-13 | Received all answers + decision doc | AI_CONTEXT.md, BUILD_PLAN.md, all docs |

---

## 18. Change Log
| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-06-13 | Initial document generation from prototype + decisions |
| 1.1.0 | 2026-06-13 | Phase 2: Database Schema Design complete; updated schema.prisma with native PostgreSQL mappings and successfully executed migration. |
| 1.2.0 | 2026-06-13 | Phase 3: Authentication complete; implemented JWT and secure database-backed HttpOnly refresh token rotation (RTR) and verified via unit tests. |

---

## 19. CSV Anomaly Strategy (Pending CSV Upload)
> **NOTE**: The `expenses_export.csv` has not yet been uploaded.
> Once uploaded, this section will be updated with:
> - Actual column structure found
> - Specific anomalies detected in the file
> - Row-by-row anomaly inventory
> - Recommended handling per anomaly
> The import pipeline design above is based on the declared anomaly types from the requirements document and will be validated/extended against the actual CSV.
