export type AccountingEntryType = 'income' | 'expense';

export type AccountingCategoryId =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'study'
  | 'entertainment'
  | 'rent'
  | 'salary'
  | 'saving'
  | 'other';

export interface AccountingCategory {
  id: AccountingCategoryId;
  name: string;
  type: AccountingEntryType | 'both';
  accent: string;
}

export interface AccountingEntry {
  id: string;
  type: AccountingEntryType;
  amountCents: number;
  category: AccountingCategoryId;
  account: string;
  spentAt: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountingEntryDraft {
  type: AccountingEntryType;
  amountYuan: string;
  category: AccountingCategoryId;
  account: string;
  spentAt: string;
  note: string;
}

export interface SavingGoalDraft {
  name: string;
  targetYuan: string;
  savedYuan: string;
  startDate: string;
  endDate: string;
}

export interface SavingGoal {
  name: string;
  targetCents: number;
  savedCents: number;
  startDate: string;
  endDate: string;
  progressPercent: number;
  remainingCents: number;
  daysLeft: number;
  dailyRequiredCents: number;
}

export interface AccountingSettings {
  monthlyBudgetCents: number;
  savingGoal: SavingGoal | null;
}

export interface AccountingSettingsDraft {
  monthlyBudgetYuan: string;
  savingGoal: SavingGoalDraft | null;
}

export interface AccountingSummary {
  incomeCents: number;
  expenseCents: number;
  balanceCents: number;
  dailyExpenseCents: number;
  budgetUsedPercent: number;
  budgetRemainingCents: number;
  topExpenseCategory: { category: AccountingCategoryId; amountCents: number } | null;
}

export interface AccountingMonthData {
  entries: AccountingEntry[];
  settings: AccountingSettings;
  summary: AccountingSummary;
  savingGoal: SavingGoal | null;
}

export const ACCOUNTING_CATEGORIES: AccountingCategory[] = [
  { id: 'food', name: '餐饮', type: 'expense', accent: '#b6423c' },
  { id: 'transport', name: '交通', type: 'expense', accent: '#4266b2' },
  { id: 'shopping', name: '购物', type: 'expense', accent: '#8a5a19' },
  { id: 'study', name: '学习', type: 'expense', accent: '#2f7d67' },
  { id: 'entertainment', name: '娱乐', type: 'expense', accent: '#7b5aa6' },
  { id: 'rent', name: '房租', type: 'expense', accent: '#5e625f' },
  { id: 'salary', name: '工资', type: 'income', accent: '#2f7d67' },
  { id: 'saving', name: '存钱', type: 'both', accent: '#c08a2c' },
  { id: 'other', name: '其他', type: 'both', accent: '#68706a' }
];

export function getAccountingCategory(id: AccountingCategoryId): AccountingCategory {
  return ACCOUNTING_CATEGORIES.find((category) => category.id === id) ?? ACCOUNTING_CATEGORIES[8];
}

export function todayDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthInput(): string {
  return todayDateInput().slice(0, 7);
}

export function formatMoney(cents = 0): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}¥${(absolute / 100).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
