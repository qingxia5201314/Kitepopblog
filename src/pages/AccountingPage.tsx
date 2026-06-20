import React, { useState, FormEvent } from 'react';
import { useApp } from '../context/AppContext';
import { useAccounting } from '../hooks/useAccounting';
import { loginAccounting } from '../lib/accountingApi';
import {
  ACCOUNTING_CATEGORIES,
  ACCOUNTING_ENTRY_COLLAPSE_LIMIT,
  ACCOUNTING_PAYMENT_METHODS,
  AccountingCategory,
  AccountingCategoryId,
  AccountingEntry,
  AccountingEntryType,
  formatMoney,
  getAccountingCategory,
  getVisibleAccountingEntries,
  sanitizeMoneyInput,
  sortAccountingEntries,
  todayDateInput,
  currentMonthInput
} from '../lib/accounting';
import {
  createAccountingEntry,
  createAccountingCategory,
  deleteAccountingEntry,
  deleteAccountingCategory,
  updateAccountingCategory,
  updateAccountingEntry,
  updateAccountingSettings
} from '../lib/accountingApi';
import { formatBytes } from '../components/shared';
import accountingHeroImage from '../assets/accounting-hero.webp';

const ACCOUNTING_SESSION_KEY = 'kitepop-accounting-session';

const ACCOUNTING_CATEGORY_TYPE_LABELS: Record<AccountingCategory['type'], string> = {
  expense: '支出',
  income: '收入',
  both: '通用'
};

function getAccountingCategoryLabel(category: AccountingCategory, categories: AccountingCategory[]) {
  const hasDuplicateName = categories.some((item) => item.id !== category.id && item.name === category.name);
  return hasDuplicateName ? `${category.name} · ${ACCOUNTING_CATEGORY_TYPE_LABELS[category.type]}` : category.name;
}

function centsToInput(cents = 0): string {
  return cents > 0 ? String(cents / 100) : '';
}

function loadAccountingSession(): { token: string; expiresAt: string } | null {
  try {
    const raw = window.localStorage.getItem(ACCOUNTING_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: string; expiresAt?: string };
    if (!parsed.token || (parsed.expiresAt && Date.parse(parsed.expiresAt) <= Date.now())) {
      window.localStorage.removeItem(ACCOUNTING_SESSION_KEY);
      return null;
    }
    return { token: parsed.token, expiresAt: parsed.expiresAt || '' };
  } catch {
    return null;
  }
}

function saveAccountingSession(session: { token: string; expiresAt: string }) {
  window.localStorage.setItem(ACCOUNTING_SESSION_KEY, JSON.stringify(session));
}

function clearAccountingSession() {
  window.localStorage.removeItem(ACCOUNTING_SESSION_KEY);
}

export function AccountingPage() {
  const { notify } = useApp();
  const [accountingSession, setAccountingSession] = useState<{ token: string; expiresAt: string } | null>(() =>
    loadAccountingSession()
  );
  const [accountingPassword, setAccountingPassword] = useState('');

  const {
    accountingMonth,
    accountingData,
    accountingForm,
    accountingTypeFilter,
    accountingCategoryFilter,
    setAccountingMonth,
    updateAccountingForm,
    loadAccountingData,
    saveAccountingEntry,
    removeAccountingEntry,
    saveAccountingSettings,
    accountingSettingsForm,
    setAccountingSettingsForm,
    accountingCategories,
    allAccountingCategories,
    customAccountingCategories,
    customAccountingCategoryName,
    setCustomAccountingCategoryName,
    customAccountingCategoryType,
    setCustomAccountingCategoryType,
    categoryDrafts,
    setCategoryDrafts,
    addCustomAccountingCategory,
    saveCustomAccountingCategory,
    removeCustomAccountingCategory,
    accountingEntries,
    visibleAccountingEntries,
    accountingEntriesExpanded,
    setAccountingEntriesExpanded,
    hasCollapsedAccountingEntries,
    budgetHealth,
    accountingPaymentMethods,
    editingAccountingId,
    startEditAccountingEntry,
    resetAccountingForm
  } = useAccounting(accountingSession?.token || '', notify);

  const [localEditingId, setLocalEditingId] = useState<string | null>(null);

  const handleUnlockAccounting = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const response = await fetch('/api/accounting/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password: accountingPassword })
      });
      const result = (await response.json()) as { ok?: boolean; message?: string; token?: string; expiresAt?: string };

      if (!response.ok || !result.ok || !result.token) {
        notify('error', result.message || '记账口令不正确');
        return;
      }

      const session = { token: result.token, expiresAt: result.expiresAt || '' };
      saveAccountingSession(session);
      setAccountingSession(session);
      setAccountingPassword('');
      await loadAccountingData(session.token);
      notify('success', '记账会话已保持 30 天');
    } catch (error) {
      notify('error', error instanceof Error ? error.message : '记账口令不正确');
    }
  };

  const handleLogoutAccounting = () => {
    clearAccountingSession();
    setAccountingSession(null);
    notify('success', '已退出记账');
  };

  if (!accountingSession) {
    return (
      <section className="accounting-page">
        <form className="unlock-panel" onSubmit={handleUnlockAccounting}>
          <p className="eyebrow">Private Ledger</p>
          <h1>记账中心</h1>
          <p>
            输入管理口令后，可以查看和维护个人流水、月预算和一个月存钱目标。未登录用户不会看到任何金额数据。
          </p>
          <input
            aria-label="记账口令"
            onChange={(event) => setAccountingPassword(event.target.value)}
            placeholder="输入记账口令"
            type="password"
            value={accountingPassword}
          />
          <button type="submit">进入记账</button>
        </form>
      </section>
    );
  }

  return (
    <section className="accounting-page">
      <section className="accounting-hero">
        <div>
          <p className="eyebrow">Private Ledger</p>
          <h1>本月收支和存钱目标</h1>
          <p>会话已保持到 {new Date(accountingSession.expiresAt).toLocaleDateString('zh-CN')}，数据只从服务端读取。</p>
        </div>
        <img alt="" className="accounting-hero-art" src={accountingHeroImage} />
        <div className="accounting-actions">
          <input
            aria-label="选择月份"
            onChange={(event) => setAccountingMonth(event.target.value)}
            type="month"
            value={accountingMonth}
          />
          <button className="ghost" onClick={handleLogoutAccounting} type="button">
            退出记账
          </button>
        </div>
      </section>

      <section className="accounting-metrics">
        <div className="metric-card">
          <i className="metric-icon metric-income" aria-hidden="true" />
          <span className="metric-label">本月收入</span>
          <strong>{formatMoney(accountingData?.summary.incomeCents ?? 0)}</strong>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-expense" aria-hidden="true" />
          <span className="metric-label">本月支出</span>
          <strong>{formatMoney(accountingData?.summary.expenseCents ?? 0)}</strong>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-balance" aria-hidden="true" />
          <span className="metric-label">本月可用</span>
          <strong>{formatMoney(accountingData?.summary.budgetLimitCents ?? 0)}</strong>
        </div>
        <div className={`metric-card metric-focus metric-${budgetHealth}`}>
          <i className="metric-icon metric-budget" aria-hidden="true" />
          <span className="metric-label">剩余可用</span>
          <strong>{formatMoney(accountingData?.summary.budgetRemainingCents ?? 0)}</strong>
          <div className="metric-progress" aria-label={`可用额度已用 ${accountingData?.summary.budgetUsedPercent ?? 0}%`}>
            <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
          </div>
          <small>已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</small>
        </div>
        <div className="metric-card">
          <i className="metric-icon metric-saving" aria-hidden="true" />
          <span className="metric-label">计划存钱</span>
          <strong>{formatMoney(accountingData?.summary.targetSavingCents ?? 0)}</strong>
          <small>预计 {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}</small>
        </div>
      </section>

      <section className="accounting-layout">
        <form className="accounting-card accounting-form" onSubmit={saveAccountingEntry}>
          <div className="panel-heading">
            <h2>{localEditingId ? '编辑流水' : '快速记一笔'}</h2>
            {localEditingId ? (
              <button onClick={() => resetAccountingForm()} type="button">
                取消编辑
              </button>
            ) : null}
          </div>
          <div className="segmented-control">
            {(['expense', 'income'] as AccountingEntryType[]).map((type) => (
              <button
                className={accountingForm.type === type ? 'active' : ''}
                key={type}
                onClick={() =>
                  updateAccountingForm({
                    type,
                    category: type === 'income' ? 'salary' : 'food'
                  })
                }
                type="button"
              >
                {type === 'expense' ? '支出' : '收入'}
              </button>
            ))}
          </div>
          <div className="ledger-filter-grid">
            <label>
              金额
              <input
                inputMode="decimal"
                onChange={(event) =>
                  updateAccountingForm({ amountYuan: sanitizeMoneyInput(event.target.value) })
                }
                placeholder="0.00"
                value={accountingForm.amountYuan}
              />
            </label>
            <label>
              分类
              <select
                onChange={(event) =>
                  updateAccountingForm({ category: event.target.value as AccountingCategoryId })
                }
                value={accountingForm.category}
              >
                {accountingCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getAccountingCategoryLabel(category, allAccountingCategories)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="ledger-filter-grid">
            <label>
              日期
              <input
                onChange={(event) => updateAccountingForm({ spentAt: event.target.value })}
                type="date"
                value={accountingForm.spentAt}
              />
            </label>
            <label>
              支付方式
              <select
                onChange={(event) => updateAccountingForm({ account: event.target.value })}
                value={accountingForm.account}
              >
                {accountingPaymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {method}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <details className="custom-category-panel">
            <summary>
              <strong>自定义分类</strong>
              <small>添加后会同步出现在记账分类和流水筛选里。</small>
            </summary>
            <div className="custom-category-controls">
              <input
                onChange={(event) => setCustomAccountingCategoryName(event.target.value)}
                placeholder="例如：咖啡、服务器、订阅"
                value={customAccountingCategoryName}
              />
              <select
                onChange={(event) => setCustomAccountingCategoryType(event.target.value as AccountingEntryType)}
                value={customAccountingCategoryType}
              >
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
              <button onClick={() => addCustomAccountingCategory()} type="button">
                添加
              </button>
            </div>
            {customAccountingCategories.length ? (
              <div className="custom-category-list">
                {customAccountingCategories.map((category) => {
                  const draft = categoryDrafts[category.id] ?? { name: category.name, type: category.type };
                  return (
                    <div className="custom-category-item" key={category.id}>
                      <input
                        onChange={(event) =>
                          setCategoryDrafts((current) => ({
                            ...current,
                            [category.id]: { ...draft, name: event.target.value }
                          }))
                        }
                        value={draft.name}
                      />
                      <select
                        onChange={(event) =>
                          setCategoryDrafts((current) => ({
                            ...current,
                            [category.id]: { ...draft, type: event.target.value as 'income' | 'expense' | 'both' }
                          }))
                        }
                        value={draft.type}
                      >
                        <option value="expense">支出</option>
                        <option value="income">收入</option>
                        <option value="both">通用</option>
                      </select>
                      <button onClick={() => saveCustomAccountingCategory(category.id)} type="button">
                        保存
                      </button>
                      <button
                        className="danger"
                        onClick={() => removeCustomAccountingCategory(category.id)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </details>
          <label>
            备注
            <input
              onChange={(event) => updateAccountingForm({ note: event.target.value })}
              placeholder="例如：午饭、课程、工资"
              value={accountingForm.note}
            />
          </label>
          <label className="toggle-row">
            <input
              checked={accountingForm.includeInSaving}
              onChange={(event) => updateAccountingForm({ includeInSaving: event.target.checked })}
              type="checkbox"
            />
            <span>
              <strong>计入存钱项目</strong>
              <small>勾选后参与剩余可用计算；收入不会进入本月收入。</small>
            </span>
          </label>
          <button type="submit">{localEditingId ? '保存更新' : '保存流水'}</button>
        </form>

        <section className="accounting-card">
          <div className="panel-heading">
            <h2>流水筛选 · {accountingEntries.length} 条</h2>
            {hasCollapsedAccountingEntries ? (
              <button
                onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)}
                type="button"
              >
                {accountingEntriesExpanded ? '收起' : `展开全部`}
              </button>
            ) : null}
          </div>
          <div className="form-grid">
            <label>
              类型
              <select value={accountingTypeFilter} onChange={() => {}}>
                <option value="all">全部</option>
                <option value="expense">支出</option>
                <option value="income">收入</option>
              </select>
            </label>
            <label>
              分类
              <select value={accountingCategoryFilter} onChange={() => {}}>
                <option value="all">全部分类</option>
                {allAccountingCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {getAccountingCategoryLabel(category, allAccountingCategories)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="entry-list">
            {visibleAccountingEntries.map((entry: any) => {
              const category = getAccountingCategory(entry.category, accountingData?.categories);
              return (
                <div className="entry-item" key={entry.id}>
                  <span className={`entry-type entry-${entry.type}`}>
                    {entry.type === 'expense' ? '支' : '收'}
                  </span>
                  <span className="entry-main">
                    <strong>
                      {category.name} · {entry.account}
                    </strong>
                    <small>
                      {new Date(entry.createdAt || entry.spentAt).toLocaleString('zh-CN')} · 发生 {entry.spentAt}
                      {entry.note ? ` · ${entry.note}` : ''}
                      <em className={`entry-saving-badge ${entry.includeInSaving ? 'active' : ''}`}>
                        {entry.includeInSaving ? '存钱项目' : '普通流水'}
                      </em>
                    </small>
                  </span>
                  <strong className={entry.type === 'expense' ? 'money-expense' : 'money-income'}>
                    {entry.type === 'expense' ? '-' : '+'}
                    {formatMoney(entry.amountCents)}
                  </strong>
                  <span className="entry-actions">
                    <button
                      onClick={() => {
                        startEditAccountingEntry(entry);
                      }}
                      type="button"
                    >
                      编辑
                    </button>
                    <button
                      className="danger"
                      onClick={() => removeAccountingEntry(entry)}
                      type="button"
                    >
                      删除
                    </button>
                  </span>
                </div>
              );
            })}
            {accountingData && accountingData.entries.length === 0 ? (
              <div className="empty-state">这个筛选条件下还没有流水。</div>
            ) : null}
            {hasCollapsedAccountingEntries ? (
              <button
                className="entry-toggle"
                onClick={() => setAccountingEntriesExpanded((expanded) => !expanded)}
                type="button"
              >
                {accountingEntriesExpanded
                  ? '收起流水'
                  : `还有 ${accountingEntries.length - ACCOUNTING_ENTRY_COLLAPSE_LIMIT} 条，展开查看`}
              </button>
            ) : null}
          </div>
        </section>

        <form className="accounting-card saving-panel" onSubmit={saveAccountingSettings}>
          <div className="panel-heading">
            <h2>预算和存钱计划</h2>
            <button type="submit">保存设置</button>
          </div>
          <label>
            每月生活费
            <input
              inputMode="decimal"
              onChange={(event) =>
                setAccountingSettingsForm((current) => ({
                  ...current,
                  monthlyBudgetYuan: sanitizeMoneyInput(event.target.value)
                }))
              }
              placeholder="例如：2000"
              value={accountingSettingsForm.monthlyBudgetYuan}
            />
          </label>
          <div className="progress-track">
            <span style={{ width: `${Math.min(accountingData?.summary.budgetUsedPercent ?? 0, 100)}%` }} />
          </div>
          <p>可用额度已用 {accountingData?.summary.budgetUsedPercent ?? 0}%</p>
          {accountingSettingsForm.savingGoal ? (
            <>
              <div className="form-grid">
                <label>
                  本月计划存钱
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: {
                          ...current.savingGoal!,
                          targetSavingYuan: sanitizeMoneyInput(event.target.value)
                        }
                      }))
                    }
                    placeholder="例如：1000"
                    value={accountingSettingsForm.savingGoal.targetSavingYuan ?? ''}
                  />
                </label>
                <label>
                  本月可用额度
                  <input
                    inputMode="decimal"
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: {
                          ...current.savingGoal!,
                          availableBudgetYuan: sanitizeMoneyInput(event.target.value)
                        }
                      }))
                    }
                    placeholder="例如：1000"
                    value={accountingSettingsForm.savingGoal.availableBudgetYuan ?? ''}
                  />
                </label>
              </div>
              <div className="form-grid">
                <label>
                  结束日期
                  <input
                    onChange={(event) =>
                      setAccountingSettingsForm((current) => ({
                        ...current,
                        savingGoal: { ...current.savingGoal!, endDate: event.target.value }
                      }))
                    }
                    type="date"
                    value={accountingSettingsForm.savingGoal.endDate}
                  />
                </label>
              </div>
            </>
          ) : null}
          <div className="saving-summary">
            <span>
              <small>存钱进度</small>
              <strong>{accountingData?.savingGoal?.progressPercent ?? 0}%</strong>
            </span>
            <span>
              <small>剩余可用</small>
              <strong>
                {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                  ? formatMoney(accountingData?.savingGoal?.remainingAvailableCents ?? 0)
                  : `超支 ${formatMoney(accountingData?.savingGoal?.overBudgetCents ?? 0)}`}
              </strong>
            </span>
            <span>
              <small>每日建议</small>
              <strong>
                {(accountingData?.savingGoal?.remainingAvailableCents ?? 0) >= 0
                  ? `最多 ${formatMoney(accountingData?.savingGoal?.dailyAvailableCents ?? 0)}`
                  : `补足 ${formatMoney(accountingData?.savingGoal?.dailyRequiredCents ?? 0)}`}
              </strong>
            </span>
            <span>
              <small>预计可存</small>
              <strong>
                {formatMoney(accountingData?.savingGoal?.projectedSavingCents ?? 0)}
                {(accountingData?.savingGoal?.savingGapCents ?? 0) > 0
                  ? ` · 差 ${formatMoney(accountingData?.savingGoal?.savingGapCents ?? 0)}`
                  : ''}
                {(accountingData?.savingGoal?.savingSurplusCents ?? 0) > 0
                  ? ` · 多 ${formatMoney(accountingData?.savingGoal?.savingSurplusCents ?? 0)}`
                  : ''}
              </strong>
            </span>
          </div>
        </form>
      </section>
    </section>
  );
}
