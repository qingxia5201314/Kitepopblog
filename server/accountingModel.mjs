import { randomUUID } from 'node:crypto';

export const ACCOUNTING_CATEGORIES = [
  'food',
  'transport',
  'shopping',
  'study',
  'entertainment',
  'rent',
  'salary',
  'saving',
  'other'
];

export function createAccountingId() {
  return `acc-${randomUUID()}`;
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function monthOf(date) {
  return String(date || today()).slice(0, 7);
}

export function parseMoneyToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new Error('Invalid amount');
  }

  const [yuan, cents = ''] = normalized.split('.');
  return Number(yuan) * 100 + Number(cents.padEnd(2, '0'));
}

export function centsToYuan(cents) {
  return (Number(cents || 0) / 100).toFixed(2);
}

export function assertEntryDraft(draft) {
  if (!['income', 'expense'].includes(draft.type)) throw new Error('Invalid entry type');
  if (!ACCOUNTING_CATEGORIES.includes(draft.category)) throw new Error('Invalid category');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(draft.spentAt || ''))) throw new Error('Invalid date');
  if (!String(draft.account || '').trim()) throw new Error('Account is required');
}

export function summarizeEntries(entries, { monthlyBudgetCents = 0 } = {}) {
  const incomeCents = entries
    .filter((entry) => entry.type === 'income')
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseCents = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((total, entry) => total + entry.amountCents, 0);
  const expenseByCategory = entries
    .filter((entry) => entry.type === 'expense')
    .reduce((groups, entry) => {
      groups[entry.category] = (groups[entry.category] || 0) + entry.amountCents;
      return groups;
    }, {});
  const topExpense = Object.entries(expenseByCategory).sort((left, right) => right[1] - left[1])[0];

  return {
    incomeCents,
    expenseCents,
    balanceCents: incomeCents - expenseCents,
    dailyExpenseCents: Math.round(expenseCents / Math.max(new Date().getDate(), 1)),
    budgetUsedPercent: monthlyBudgetCents > 0 ? Math.min(999, Math.round((expenseCents / monthlyBudgetCents) * 100)) : 0,
    budgetRemainingCents: monthlyBudgetCents > 0 ? monthlyBudgetCents - expenseCents : 0,
    topExpenseCategory: topExpense ? { category: topExpense[0], amountCents: topExpense[1] } : null
  };
}

function daysBetweenInclusive(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86400000) + 1;
}

export function calculateSavingGoal(goal, { today: currentDate = today() } = {}) {
  if (!goal) return null;

  const remainingCents = Math.max(goal.targetCents - goal.savedCents, 0);
  const daysLeft = Math.max(daysBetweenInclusive(currentDate, goal.endDate), 0);

  return {
    ...goal,
    progressPercent: goal.targetCents > 0 ? Math.min(100, Math.round((goal.savedCents / goal.targetCents) * 100)) : 0,
    remainingCents,
    daysLeft,
    dailyRequiredCents: daysLeft > 0 ? Math.ceil(remainingCents / daysLeft) : remainingCents
  };
}
