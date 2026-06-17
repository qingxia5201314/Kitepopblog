import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAccountingCategory,
  createAccountingEntry,
  deleteAccountingCategory,
  getAccountingMonth,
  loginAccounting,
  updateAccountingCategory,
  updateAccountingSettings
} from './accountingApi';

describe('accounting api client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('logs in through the accounting endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, token: 'accounting-token', expiresAt: '2026-07-13T00:00:00.000Z' })
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await loginAccounting('secret');

    expect(result.token).toBe('accounting-token');
    expect(fetchMock).toHaveBeenCalledWith('/api/accounting/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: 'secret' })
    });
  });

  it('uses bearer tokens for private accounting reads and writes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [], summary: {}, settings: {}, savingGoal: null })
    });
    vi.stubGlobal('fetch', fetchMock);

    await getAccountingMonth({ token: 'accounting-token', month: '2026-06' });
    await createAccountingEntry(
      {
        type: 'expense',
        amountYuan: '25',
        category: 'food',
        account: '支付宝',
        spentAt: '2026-06-13',
        note: '午饭',
        includeInSaving: true
      },
      'accounting-token'
    );
    await updateAccountingSettings(
      {
        monthlyBudgetYuan: '3000',
        savingGoal: {
          name: '六月存钱',
          targetYuan: '5000',
          savedYuan: '1200',
          startDate: '2026-06-01',
          endDate: '2026-06-30'
        }
      },
      'accounting-token'
    );
    await createAccountingCategory({ name: '咖啡', type: 'expense' }, 'accounting-token');
    await updateAccountingCategory('custom-1', { name: '咖啡馆', type: 'both' }, 'accounting-token');
    await deleteAccountingCategory('custom-1', 'accounting-token');

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/accounting/month?month=2026-06', {
      headers: { Authorization: 'Bearer accounting-token' }
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/accounting/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer accounting-token' },
      body: expect.any(String)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/accounting/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer accounting-token' },
      body: expect.any(String)
    });
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/accounting/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer accounting-token' },
      body: JSON.stringify({ name: '咖啡', type: 'expense' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/accounting/categories/custom-1', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer accounting-token' },
      body: JSON.stringify({ name: '咖啡馆', type: 'both' })
    });
    expect(fetchMock).toHaveBeenNthCalledWith(6, '/api/accounting/categories/custom-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer accounting-token' }
    });
  });
});
