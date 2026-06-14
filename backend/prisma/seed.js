const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const aishaId = '11111111-1111-1111-1111-111111111111';
const rohanId = '22222222-2222-2222-2222-222222222222';
const priyaId = '33333333-3333-3333-3333-333333333333';
const samId = '44444444-4444-4444-4444-444444444444';
const meeraId = '55555555-5555-5555-5555-555555555555';

const flatGroupId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const goaGroupId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

async function createMembership(groupId, userId, role, joinedAt, leftAt = null) {
  const m = await prisma.membership.create({
    data: {
      groupId,
      userId,
      role,
      joinedAt: new Date(joinedAt),
      leftAt: leftAt ? new Date(leftAt) : null,
    }
  });

  // Create member.joined Audit Log
  await prisma.auditLog.create({
    data: {
      groupId,
      actorId: userId,
      eventType: 'member.joined',
      entityType: 'membership',
      entityId: m.id,
      metadata: {
        role,
        joinedAt,
      },
      createdAt: new Date(joinedAt),
    }
  });

  // If left, create member.left Audit Log
  if (leftAt) {
    await prisma.auditLog.create({
      data: {
        groupId,
        actorId: userId,
        eventType: 'member.left',
        entityType: 'membership',
        entityId: m.id,
        metadata: {
          leftAt,
        },
        createdAt: new Date(leftAt),
      }
    });
  }

  return m;
}

async function createExpense({
  groupId,
  description,
  amountOriginal,
  currencyCode = 'INR',
  exchangeRate = 1.0,
  paidBy,
  expenseDate,
  splitMethod = 'equal',
  createdBy,
  participants,
}) {
  const amountBaseInr = Math.round(amountOriginal * exchangeRate * 100) / 100;
  const count = participants.length;
  
  // Calculate standard shares and handle remainders to avoid floating point issues
  const shareOriginal = Math.floor((amountOriginal / count) * 100) / 100;
  const remainderOriginal = Math.round((amountOriginal - (shareOriginal * count)) * 100) / 100;
  
  const shareInr = Math.floor((amountBaseInr / count) * 100) / 100;
  const remainderInr = Math.round((amountBaseInr - (shareInr * count)) * 100) / 100;

  const sortedParticipants = [...participants].sort();

  const expense = await prisma.expense.create({
    data: {
      groupId,
      description,
      amountOriginal,
      currencyCode: currencyCode.toUpperCase(),
      exchangeRate,
      amountBaseInr,
      paidBy,
      expenseDate: new Date(expenseDate),
      splitMethod: splitMethod.toUpperCase(),
      createdBy,
    }
  });

  const participantRecords = [];
  const ledgerRecords = [];

  for (let i = 0; i < sortedParticipants.length; i++) {
    const userId = sortedParticipants[i];
    const isLast = i === sortedParticipants.length - 1;

    // Add remainder to last participant
    const finalShareOriginal = isLast ? (shareOriginal + remainderOriginal) : shareOriginal;
    const finalShareInr = isLast ? (shareInr + remainderInr) : shareInr;

    participantRecords.push({
      expenseId: expense.id,
      userId,
      shareAmountInr: finalShareInr,
      shareUnits: null,
      isSettled: false,
    });

    if (userId !== paidBy) {
      ledgerRecords.push({
        groupId,
        entryType: 'expense_split',
        debtorId: userId,
        creditorId: paidBy,
        amountInr: finalShareInr,
        entryDate: new Date(expenseDate),
        note: description,
        expenseId: expense.id,
        createdBy,
      });
    }
  }

  await prisma.expenseParticipant.createMany({
    data: participantRecords
  });

  if (ledgerRecords.length > 0) {
    await prisma.ledgerEntry.createMany({
      data: ledgerRecords
    });
  }

  // Create audit log
  await prisma.auditLog.create({
    data: {
      groupId,
      actorId: createdBy,
      eventType: 'expense.created',
      entityType: 'expense',
      entityId: expense.id,
      metadata: {
        description,
        amountBaseInr,
      },
      createdAt: new Date(expenseDate),
    }
  });

  return expense;
}

async function createSettlement({
  groupId,
  fromUserId,
  toUserId,
  amountInr,
  settlementDate,
  note,
  createdBy,
}) {
  const settlement = await prisma.settlement.create({
    data: {
      groupId,
      fromUserId,
      toUserId,
      amountInr,
      settlementDate: new Date(settlementDate),
      note,
      createdBy,
    }
  });

  // Sync ledger entries
  await prisma.ledgerEntry.create({
    data: {
      groupId,
      entryType: 'settlement',
      debtorId: toUserId,
      creditorId: fromUserId,
      amountInr,
      entryDate: new Date(settlementDate),
      note: note || 'Settlement',
      settlementId: settlement.id,
      createdBy,
    }
  });

  // Create audit log
  await prisma.auditLog.create({
    data: {
      groupId,
      actorId: createdBy,
      eventType: 'settlement.created',
      entityType: 'settlement',
      entityId: settlement.id,
      metadata: {
        fromUserId,
        toUserId,
        amountInr,
      },
      createdAt: new Date(settlementDate),
    }
  });

  return settlement;
}

async function main() {
  console.log('Clearing database tables...');
  await prisma.message.deleteMany();
  await prisma.ledgerEntry.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.expenseParticipant.deleteMany();
  await prisma.importAnomaly.deleteMany();
  await prisma.importRow.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.group.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.exchangeRate.deleteMany();
  await prisma.currency.deleteMany();

  console.log('Seeding currencies...');
  await prisma.currency.createMany({
    data: [
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', isBase: true },
      { code: 'USD', name: 'US Dollar', symbol: '$', isBase: false },
      { code: 'EUR', name: 'Euro', symbol: '€', isBase: false },
      { code: 'GBP', name: 'British Pound', symbol: '£', isBase: false },
      { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', isBase: false },
      { code: 'AED', name: 'UAE Dirham', symbol: 'د.إ', isBase: false },
    ],
  });

  console.log('Seeding daily exchange rates for USD, EUR, GBP, SGD, AED to INR...');
  const exchangeRatesData = [];
  const startDate = new Date('2026-02-01');
  const endDate = new Date('2026-06-01');

  const rates = {
    USD: 83.50,
    EUR: 90.00,
    GBP: 105.00,
    SGD: 61.50,
    AED: 22.70,
  };

  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const rateDate = new Date(d);
    for (const [code, rate] of Object.entries(rates)) {
      exchangeRatesData.push({
        fromCode: code,
        toCode: 'INR',
        rate: rate,
        rateDate: rateDate,
        source: 'manual',
      });
    }
  }

  await prisma.exchangeRate.createMany({
    data: exchangeRatesData,
  });

  console.log('Hashing passwords...');
  const passwordHash = await bcrypt.hash('password123', 10);

  console.log('Seeding users...');
  await prisma.user.createMany({
    data: [
      {
        id: aishaId,
        email: 'aisha@flat.co',
        passwordHash,
        displayName: 'Aisha Khan',
        avatarInitials: 'AK',
        avatarColor: '#E11D48',
      },
      {
        id: rohanId,
        email: 'rohan@flat.co',
        passwordHash,
        displayName: 'Rohan Mehta',
        avatarInitials: 'RM',
        avatarColor: '#2563EB',
      },
      {
        id: priyaId,
        email: 'priya@flat.co',
        passwordHash,
        displayName: 'Priya Iyer',
        avatarInitials: 'PI',
        avatarColor: '#16A34A',
      },
      {
        id: samId,
        email: 'sam@flat.co',
        passwordHash,
        displayName: 'Sam Patel',
        avatarInitials: 'SP',
        avatarColor: '#D97706',
      },
      {
        id: meeraId,
        email: 'meera@flat.co',
        passwordHash,
        displayName: 'Meera Joshi',
        avatarInitials: 'MJ',
        avatarColor: '#7C3AED',
      },
    ],
  });

  console.log('Seeding groups...');
  await prisma.group.createMany({
    data: [
      {
        id: flatGroupId,
        slug: 'flat-302-bandra',
        name: 'Flat 302 · Bandra',
        icon: '🏠',
        createdBy: aishaId,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      },
      {
        id: goaGroupId,
        slug: 'goa-long-weekend',
        name: 'Goa Long Weekend',
        icon: '🌴',
        createdBy: aishaId,
        createdAt: new Date('2026-05-02T00:00:00Z'),
      },
    ],
  });

  console.log('Seeding group memberships...');
  // Flat 302 memberships
  await createMembership(flatGroupId, aishaId, 'admin', '2026-02-01T00:00:00Z');
  await createMembership(flatGroupId, rohanId, 'member', '2026-02-01T00:00:00Z');
  await createMembership(flatGroupId, priyaId, 'member', '2026-02-01T00:00:00Z');
  await createMembership(flatGroupId, meeraId, 'member', '2026-02-01T00:00:00Z', '2026-03-31T23:59:59Z');
  await createMembership(flatGroupId, samId, 'member', '2026-04-15T00:00:00Z');

  // Goa Long Weekend memberships
  await createMembership(goaGroupId, aishaId, 'admin', '2026-05-02T00:00:00Z');
  await createMembership(goaGroupId, rohanId, 'member', '2026-05-02T00:00:00Z');
  await createMembership(goaGroupId, priyaId, 'member', '2026-05-02T00:00:00Z');
  await createMembership(goaGroupId, samId, 'member', '2026-05-02T00:00:00Z');

  console.log('Seeding expenses for Flat 302...');
  // 1. Feb Rent
  await createExpense({
    groupId: flatGroupId,
    description: 'February Rent',
    amountOriginal: 60000,
    paidBy: aishaId,
    expenseDate: '2026-02-01',
    createdBy: aishaId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 2. Setup Costs
  await createExpense({
    groupId: flatGroupId,
    description: 'Apartment Setup Costs',
    amountOriginal: 12888,
    paidBy: priyaId,
    expenseDate: '2026-02-05',
    createdBy: priyaId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 3. Feb Groceries
  await createExpense({
    groupId: flatGroupId,
    description: 'Feb Groceries',
    amountOriginal: 8000,
    paidBy: rohanId,
    expenseDate: '2026-02-15',
    createdBy: rohanId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 4. Feb Elec
  await createExpense({
    groupId: flatGroupId,
    description: 'Electricity Feb 2026',
    amountOriginal: 4500,
    paidBy: priyaId,
    expenseDate: '2026-02-20',
    createdBy: priyaId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 5. Mar Rent
  await createExpense({
    groupId: flatGroupId,
    description: 'March Rent',
    amountOriginal: 60000,
    paidBy: aishaId,
    expenseDate: '2026-03-01',
    createdBy: aishaId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 6. Mar Groceries
  await createExpense({
    groupId: flatGroupId,
    description: 'March Groceries',
    amountOriginal: 9500,
    paidBy: rohanId,
    expenseDate: '2026-03-15',
    createdBy: rohanId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 7. Move-out Dinner
  await createExpense({
    groupId: flatGroupId,
    description: 'Move-out Dinner',
    amountOriginal: 12000,
    paidBy: meeraId,
    expenseDate: '2026-03-28',
    createdBy: meeraId,
    participants: [aishaId, rohanId, priyaId, meeraId],
  });

  // 8. April Rent (Meera has left, Sam hasn't joined yet)
  await createExpense({
    groupId: flatGroupId,
    description: 'April Rent',
    amountOriginal: 60000,
    paidBy: rohanId,
    expenseDate: '2026-04-01',
    createdBy: rohanId,
    participants: [aishaId, rohanId, priyaId],
  });

  // 9. House warming dinner (Sam joined, Meera left)
  await createExpense({
    groupId: flatGroupId,
    description: 'House warming dinner',
    amountOriginal: 15000,
    paidBy: priyaId,
    expenseDate: '2026-04-22',
    createdBy: priyaId,
    participants: [aishaId, rohanId, priyaId, samId],
  });

  // 10. May Rent
  await createExpense({
    groupId: flatGroupId,
    description: 'May Rent',
    amountOriginal: 60000,
    paidBy: aishaId,
    expenseDate: '2026-05-01',
    createdBy: aishaId,
    participants: [aishaId, rohanId, priyaId, samId],
  });

  // 11. Internet
  await createExpense({
    groupId: flatGroupId,
    description: 'Internet & Wi-Fi',
    amountOriginal: 1500,
    paidBy: samId,
    expenseDate: '2026-05-10',
    createdBy: samId,
    participants: [aishaId, rohanId, priyaId, samId],
  });

  console.log('Seeding settlements for Flat 302...');
  await createSettlement({
    groupId: flatGroupId,
    fromUserId: rohanId,
    toUserId: aishaId,
    amountInr: 18000,
    settlementDate: '2026-02-28',
    note: 'Feb dues',
    createdBy: rohanId,
  });

  await createSettlement({
    groupId: flatGroupId,
    fromUserId: meeraId,
    toUserId: rohanId,
    amountInr: 9000,
    settlementDate: '2026-03-31',
    note: 'move-out',
    createdBy: meeraId,
  });

  await createSettlement({
    groupId: flatGroupId,
    fromUserId: samId,
    toUserId: priyaId,
    amountInr: 5000,
    settlementDate: '2026-04-16',
    note: 'welcome',
    createdBy: samId,
  });

  console.log('Seeding expenses for Goa Long Weekend...');
  await createExpense({
    groupId: goaGroupId,
    description: 'Villa booking',
    amountOriginal: 32000,
    paidBy: aishaId,
    expenseDate: '2026-05-03',
    createdBy: aishaId,
    participants: [aishaId, rohanId, priyaId, samId],
  });

  await createExpense({
    groupId: goaGroupId,
    description: 'Scooter rentals',
    amountOriginal: 4800,
    paidBy: rohanId,
    expenseDate: '2026-05-05',
    createdBy: rohanId,
    participants: [aishaId, rohanId, priyaId, samId],
  });

  console.log('Database seeded successfully!');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
