import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createAccountingStore } from './accountingStore.mjs';
import { createAccountingSessions } from './accountingSession.mjs';

let tempDir;
let store;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-accounting-'));
  const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });
  store = createAccountingStore({ database });
});

afterEach(async () => {
  await rm(tempDir, { force: true, recursive: true });
});

describe('accounting store', () => {
  it('creates entries and calculates monthly summary from sqlite data', () => {
    const food = store.createEntry({
      type: 'expense',
      amountYuan: '32.50',
      category: 'food',
      account: '支付宝',
      spentAt: '2026-06-13',
      note: '午饭'
    });
    store.createEntry({
      type: 'income',
      amountYuan: '6800',
      category: 'salary',
      account: '银行卡',
      spentAt: '2026-06-01',
      note: '工资'
    });
    store.createEntry({
      type: 'expense',
      amountYuan: '12',
      category: 'transport',
      account: '微信',
      spentAt: '2026-05-28',
      note: '地铁'
    });

    const updated = store.updateEntry(food.id, { amountYuan: '35.00', note: '午饭和水' });
    const summary = store.getMonthData({ month: '2026-06' });

    expect(updated.amountCents).toBe(3500);
    expect(summary.entries).toHaveLength(2);
    expect(summary.summary.incomeCents).toBe(680000);
    expect(summary.summary.expenseCents).toBe(3500);
    expect(summary.summary.balanceCents).toBe(676500);
    expect(summary.summary.topExpenseCategory).toEqual({ category: 'food', amountCents: 3500 });
  });

  it('stores budget and one-month saving goal settings', () => {
    store.updateSettings({
      monthlyBudgetYuan: '3000',
      savingGoal: {
        name: '六月存钱',
        targetYuan: '5000',
        savedYuan: '1250',
        startDate: '2026-06-01',
        endDate: '2026-06-30'
      }
    });

    const monthData = store.getMonthData({ month: '2026-06', today: '2026-06-13' });

    expect(monthData.settings.monthlyBudgetCents).toBe(300000);
    expect(monthData.savingGoal.progressPercent).toBe(25);
    expect(monthData.savingGoal.remainingCents).toBe(375000);
    expect(monthData.savingGoal.dailyRequiredCents).toBe(20834);
  });

  it('removes entries by id', () => {
    const entry = store.createEntry({
      type: 'expense',
      amountYuan: '88',
      category: 'shopping',
      account: '现金',
      spentAt: '2026-06-10',
      note: '键盘'
    });

    expect(store.removeEntry(entry.id)).toBe(true);
    expect(store.getMonthData({ month: '2026-06' }).entries).toHaveLength(0);
  });
});

describe('accounting sessions', () => {
  it('keeps accounting login for thirty days and stores only token hashes', () => {
    const sessions = createAccountingSessions({ store, now: () => new Date('2026-06-13T00:00:00.000Z') });
    const session = sessions.issue();

    expect(session.token).toHaveLength(43);
    expect(store.debugListSessions()[0].tokenHash).not.toBe(session.token);
    expect(sessions.verify(`Bearer ${session.token}`)).toBe(true);

    const expiredSessions = createAccountingSessions({
      store,
      now: () => new Date('2026-07-14T00:00:01.000Z')
    });

    expect(expiredSessions.verify(`Bearer ${session.token}`)).toBe(false);
  });
});
