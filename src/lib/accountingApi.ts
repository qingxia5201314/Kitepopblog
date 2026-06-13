import { AccountingEntry, AccountingEntryDraft, AccountingMonthData, AccountingSettingsDraft } from './accounting';

export interface AccountingLoginResult {
  token: string;
  expiresAt: string;
}

function authHeaders(token?: string): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }
  return payload as T;
}

export async function loginAccounting(password: string): Promise<AccountingLoginResult> {
  return parseResponse<AccountingLoginResult>(
    await fetch('/api/accounting/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password })
    })
  );
}

export async function getAccountingMonth({
  token,
  month,
  type,
  category
}: {
  token: string;
  month: string;
  type?: string;
  category?: string;
}): Promise<AccountingMonthData> {
  const params = new URLSearchParams({ month });
  if (type && type !== 'all') params.set('type', type);
  if (category && category !== 'all') params.set('category', category);
  return parseResponse<AccountingMonthData>(
    await fetch(`/api/accounting/month?${params.toString()}`, {
      headers: authHeaders(token)
    })
  );
}

export async function createAccountingEntry(draft: AccountingEntryDraft, token: string): Promise<AccountingEntry> {
  const payload = await parseResponse<{ entry: AccountingEntry }>(
    await fetch('/api/accounting/entries', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(draft)
    })
  );
  return payload.entry;
}

export async function updateAccountingEntry(
  id: string,
  patch: Partial<AccountingEntryDraft>,
  token: string
): Promise<AccountingEntry> {
  const payload = await parseResponse<{ entry: AccountingEntry }>(
    await fetch(`/api/accounting/entries/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(patch)
    })
  );
  return payload.entry;
}

export async function deleteAccountingEntry(id: string, token: string): Promise<void> {
  await parseResponse<{ ok: boolean }>(
    await fetch(`/api/accounting/entries/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: authHeaders(token)
    })
  );
}

export async function updateAccountingSettings(
  settings: AccountingSettingsDraft,
  token: string
): Promise<AccountingMonthData> {
  return parseResponse<AccountingMonthData>(
    await fetch('/api/accounting/settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', ...authHeaders(token) },
      body: JSON.stringify(settings)
    })
  );
}
