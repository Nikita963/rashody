const STORAGE_KEY = 'expense-tracker-v1';

const CATEGORY_COLORS = [
  '#f05d5d', '#ff8c42', '#ffb020', '#f5d547', '#8bc34a',
  '#4cd964', '#2dd4bf', '#3d9cf5', '#6366f1', '#a78bfa',
  '#ec4899', '#f472b6', '#94a3b8', '#78716c', '#fb7185',
  '#22d3ee', '#34d399', '#fbbf24', '#c084fc', '#60a5fa',
];

const DEFAULT_CATEGORY_COLOR = {
  food: 0, transport: 7, home: 8, fun: 10, health: 5, other: 12,
  income: 6, debt: 2,
};

const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Еда', isDebt: false, builtin: true, color: 0 },
  { id: 'transport', name: 'Транспорт', isDebt: false, builtin: true, color: 7 },
  { id: 'home', name: 'Жильё', isDebt: false, builtin: true, color: 8 },
  { id: 'fun', name: 'Развлечения', isDebt: false, builtin: true, color: 10 },
  { id: 'health', name: 'Здоровье', isDebt: false, builtin: true, color: 5 },
  { id: 'other', name: 'Прочее', isDebt: false, builtin: true, color: 12 },
  { id: 'income', name: 'Поступление', isIncome: true, builtin: true, color: 6 },
  { id: 'debt', name: 'Долг', isDebt: true, builtin: true, color: 2 },
];

const TITLES = {
  add: 'Транзакция',
  history: 'История',
  stats: 'Статистика',
  debts: 'Долги',
  categories: 'Категории',
};

let state = loadState();
let activeTab = 'add';
let transactionKind = 'expense';
let selectedCategoryId = firstExpenseCategoryId();
let historyFilter = 'month';
let historySearchQuery = '';
let historyKindFilter = 'all';
let historyCategoryFilterId = null;
let statsFilter = 'month';
let historySelectMode = false;
const historySelectedIds = new Set();
let debtsSelectMode = false;
const debtsSelectedIds = new Set();
let cachedTransactionDate = '';
let openColorCategoryId = null;
let editingCategoryNameId = null;
let categoryManageKind = 'expense';
let editingExpenseId = null;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return freshState();
    const parsed = JSON.parse(raw);
    return normalizeState(parsed);
  } catch {
    return freshState();
  }
}

function freshState() {
  return {
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    expenses: [],
  };
}

function normalizeState(parsed) {
  const categories = Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORIES;
  if (!categories.some((c) => c.isIncome)) {
    categories.push({ id: 'income', name: 'Поступление', isIncome: true, builtin: true });
  }
  if (!categories.some((c) => c.isDebt)) {
    categories.push({ id: 'debt', name: 'Долг', isDebt: true, builtin: true });
  }
  categories.forEach((c, i) => {
    const idx = c.color;
    if (!Number.isInteger(idx) || idx < 0 || idx >= CATEGORY_COLORS.length) {
      c.color = DEFAULT_CATEGORY_COLOR[c.id] ?? i % CATEGORY_COLORS.length;
    }
  });
  const expenses = Array.isArray(parsed.expenses) ? parsed.expenses : [];
  expenses.forEach(normalizeExpenseDate);
  return { categories, expenses };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function uid() {
  return crypto.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function parseAmount(str) {
  const cleaned = String(str).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function formatMoney(n) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

function parseStoredDate(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  return new Date(value);
}

function normalizeExpenseDate(exp) {
  if (typeof exp.date === 'number') {
    exp.date = toInputDate(new Date(exp.date));
  }
}

function formatDate(value) {
  return parseStoredDate(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateGroupKey(value) {
  const d = parseStoredDate(value);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatHistoryGroupLabel(key) {
  const [y, m, day] = key.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  const today = startOfDay(new Date());
  const diffDays = Math.round((today - startOfDay(d)) / 86400000);
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Вчера';
  const now = new Date();
  return d.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    ...(y === now.getFullYear() ? {} : { year: 'numeric' }),
  });
}

function renderHistoryGroupHeader(label) {
  const li = document.createElement('li');
  li.className = 'expense-list__group';
  li.setAttribute('role', 'presentation');
  const h = document.createElement('h3');
  h.className = 'expense-list__group-title';
  h.textContent = label;
  li.appendChild(h);
  return li;
}

function compareExpenseDates(a, b) {
  const da = parseStoredDate(a.date).getTime();
  const db = parseStoredDate(b.date).getTime();
  return db - da;
}

function categoryById(id) {
  return state.categories.find((c) => c.id === id);
}

function categoryColorHex(cat) {
  if (!cat) return CATEGORY_COLORS[0];
  const idx = cat.color;
  return CATEGORY_COLORS[Number.isInteger(idx) ? idx : 0] ?? CATEGORY_COLORS[0];
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function textOnBackground(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const lum = 0.299 * r + 0.587 * g + 0.114 * b;
  return lum > 0.55 ? '#0f1419' : '#fff';
}

function applyChipColor(btn, cat, active) {
  const hex = categoryColorHex(cat);
  if (active) {
    btn.style.background = hex;
    btn.style.borderColor = hex;
    btn.style.color = textOnBackground(hex);
  } else {
    btn.style.background = hexToRgba(hex, 0.18);
    btn.style.borderColor = hex;
    btn.style.color = 'var(--text)';
  }
}

function setCategoryColor(categoryId, colorIndex) {
  const cat = categoryById(categoryId);
  if (!cat || colorIndex < 0 || colorIndex >= CATEGORY_COLORS.length) return;
  cat.color = colorIndex;
  saveState();
  renderCategoryManage();
  renderCategoryChips();
  renderHistory();
  renderStats();
  renderDebts();
}

function isDebtCategory(id) {
  return categoryById(id)?.isDebt === true;
}

function isIncomeCategory(id) {
  return categoryById(id)?.isIncome === true;
}

function expenseCategories() {
  return state.categories.filter((c) => !c.isDebt && !c.isIncome);
}

function incomeCategories() {
  return state.categories.filter((c) => c.isIncome);
}

function debtCategories() {
  return state.categories.filter((c) => c.isDebt);
}

function categoriesForKind(kind) {
  if (kind === 'expense') return expenseCategories();
  if (kind === 'income') return incomeCategories();
  if (kind === 'debt') return debtCategories();
  return [];
}

function firstExpenseCategoryId() {
  return expenseCategories()[0]?.id ?? 'other';
}

function firstCategoryIdForKind(kind) {
  const list = categoriesForKind(kind);
  if (kind === 'expense') return list[0]?.id ?? 'other';
  if (kind === 'income') return list[0]?.id ?? 'income';
  if (kind === 'debt') return list[0]?.id ?? 'debt';
  return list[0]?.id ?? '';
}

function effectiveCategoryId() {
  ensureCategoryForKind(transactionKind);
  return selectedCategoryId;
}

function ensureCategoryForKind(kind) {
  const list = categoriesForKind(kind);
  if (!list.some((c) => c.id === selectedCategoryId)) {
    selectedCategoryId = firstCategoryIdForKind(kind);
  }
}

function ensureExpenseCategorySelected() {
  ensureCategoryForKind('expense');
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function prevMonthRange() {
  const now = new Date();
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
  };
}

const MONTH_PREP = [
  'январю', 'февралю', 'марту', 'апрелю', 'маю', 'июню',
  'июлю', 'августу', 'сентябрю', 'октябрю', 'ноябрю', 'декабрю',
];

function previousMonthPrepLabel() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return MONTH_PREP[d.getMonth()];
}

function expenseTotalBetween(start, end) {
  return state.expenses
    .filter((e) => {
      if (isDebtCategory(e.categoryId) || isIncomeCategory(e.categoryId)) return false;
      const d = parseStoredDate(e.date);
      return d >= start && d <= end;
    })
    .reduce((s, e) => s + e.amount, 0);
}

function prevMonthExpenseTotal() {
  const { start, end } = prevMonthRange();
  return expenseTotalBetween(start, end);
}

function expenseMonthComparison() {
  const prev = prevMonthExpenseTotal();
  if (prev === 0) return null;
  const current = monthExpenseTotal();
  const monthLabel = previousMonthPrepLabel();
  const pct = Math.round(((current - prev) / prev) * 100);
  if (pct === 0) return { text: `Как в ${monthLabel}`, tone: 'neutral' };
  const sign = pct > 0 ? '+' : '\u2212';
  return {
    text: `${sign}${Math.abs(pct)}% к ${monthLabel}`,
    tone: pct > 0 ? 'up' : 'down',
  };
}

function applyMonthCompare(el, cmp) {
  if (!el) return;
  el.classList.remove('month-compare--up', 'month-compare--down', 'month-compare--neutral');
  if (!cmp) {
    el.textContent = '';
    el.classList.add('hidden');
    return;
  }
  el.textContent = cmp.text;
  el.classList.remove('hidden');
  el.classList.add(`month-compare--${cmp.tone}`);
}

function filterExpenses(list) {
  if (historyFilter !== 'month') return [...list].sort(compareExpenseDates);
  const { start, end } = monthRange();
  return list
    .filter((e) => {
      const d = parseStoredDate(e.date);
      return d >= start && d <= end;
    })
    .sort(compareExpenseDates);
}

function expenseSearchHaystack(exp) {
  const cat = categoryById(exp.categoryId);
  return [
    cat?.name,
    exp.note,
    exp.debtorName,
    String(exp.amount),
    formatMoney(exp.amount).replace(/\s/g, ' '),
    formatDate(exp.date),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesHistorySearch(exp, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = expenseSearchHaystack(exp);
  const qCompact = q.replace(/\s/g, '');
  return hay.includes(q) || hay.replace(/\s/g, '').includes(qCompact);
}

function matchesHistoryKind(exp) {
  if (historyKindFilter === 'expense') {
    return !isDebtCategory(exp.categoryId) && !isIncomeCategory(exp.categoryId);
  }
  if (historyKindFilter === 'income') return isIncomeCategory(exp.categoryId);
  if (historyKindFilter === 'debt') return isDebtCategory(exp.categoryId);
  return true;
}

function applyHistoryFilters(list) {
  return list.filter((e) => {
    if (!matchesHistoryKind(e)) return false;
    if (historyCategoryFilterId && e.categoryId !== historyCategoryFilterId) return false;
    if (!matchesHistorySearch(e, historySearchQuery)) return false;
    return true;
  });
}

function historyVisibleExpenses() {
  return applyHistoryFilters(filterExpenses(state.expenses));
}

function historyFiltersActive() {
  return (
    historySearchQuery.trim().length > 0 ||
    historyKindFilter !== 'all' ||
    historyCategoryFilterId !== null
  );
}

function updateHistorySearchUI() {
  const input = $('#historySearchInput');
  const clear = $('#historySearchClear');
  const block = $('#historySearchBlock');
  if (input && input.value !== historySearchQuery) input.value = historySearchQuery;
  if (clear) clear.classList.toggle('hidden', !historySearchQuery.trim());
  if (block) block.classList.toggle('hidden', historySelectMode);
}

function historySubCategories() {
  if (historyKindFilter === 'expense') return expenseCategories();
  if (historyKindFilter === 'income') return incomeCategories();
  if (historyKindFilter === 'debt') return debtCategories();
  return [];
}

function renderHistoryPrimaryFilters() {
  $$('#historyPrimaryFilters .chip').forEach((btn) => {
    const kind = btn.dataset.historyKind;
    btn.classList.toggle('chip--active', kind === historyKindFilter);
  });
}

function renderHistorySubFilters() {
  const el = $('#historySubFilters');
  if (!el) return;
  const show = historyKindFilter !== 'all';
  el.classList.toggle('hidden', !show);
  el.innerHTML = '';
  if (!show) return;

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'chip' + (!historyCategoryFilterId ? ' chip--active' : '');
  allBtn.textContent = 'Все';
  allBtn.addEventListener('click', () => {
    historyCategoryFilterId = null;
    renderHistory();
  });
  el.appendChild(allBtn);

  historySubCategories().forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const mod = cat.isDebt ? 'debt' : cat.isIncome ? 'income' : '';
    const active = historyCategoryFilterId === cat.id;
    btn.className = 'chip' + (mod ? ` chip--${mod}` : '') + (active ? ' chip--active' : '');
    btn.textContent = cat.name;
    applyChipColor(btn, cat, active);
    btn.addEventListener('click', () => {
      historyCategoryFilterId = active ? null : cat.id;
      renderHistory();
    });
    el.appendChild(btn);
  });
}

function setHistoryKindFilter(kind) {
  if (kind === historyKindFilter && kind !== 'all') {
    historyKindFilter = 'all';
    historyCategoryFilterId = null;
    return;
  }
  if (kind !== historyKindFilter) historyCategoryFilterId = null;
  historyKindFilter = kind;
  if (kind === 'all') historyCategoryFilterId = null;
}

function monthTransactionsInRange() {
  const { start, end } = monthRange();
  return state.expenses.filter((e) => {
    const d = parseStoredDate(e.date);
    return d >= start && d <= end;
  });
}

function monthExpenseTotal() {
  return monthTransactionsInRange()
    .filter((e) => !isDebtCategory(e.categoryId) && !isIncomeCategory(e.categoryId))
    .reduce((s, e) => s + e.amount, 0);
}

function monthIncomeTotal() {
  return monthTransactionsInRange()
    .filter((e) => isIncomeCategory(e.categoryId))
    .reduce((s, e) => s + e.amount, 0);
}

function transactionsForStats() {
  if (statsFilter !== 'month') return [...state.expenses];
  const { start, end } = monthRange();
  return state.expenses.filter((e) => {
    const d = parseStoredDate(e.date);
    return d >= start && d <= end;
  });
}

function sumExpenses(list) {
  return list
    .filter((e) => !isDebtCategory(e.categoryId) && !isIncomeCategory(e.categoryId))
    .reduce((s, e) => s + e.amount, 0);
}

function sumIncome(list) {
  return list
    .filter((e) => isIncomeCategory(e.categoryId))
    .reduce((s, e) => s + e.amount, 0);
}

function expenseBreakdownByCategory(list) {
  const map = new Map();
  list
    .filter((e) => !isDebtCategory(e.categoryId) && !isIncomeCategory(e.categoryId))
    .forEach((e) => map.set(e.categoryId, (map.get(e.categoryId) || 0) + e.amount));
  return [...map.entries()]
    .map(([categoryId, amount]) => ({
      categoryId,
      cat: categoryById(categoryId),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function expensePieGradient(breakdown, total) {
  if (!total || !breakdown.length) return 'var(--surface2)';
  const stops = [];
  let start = 0;
  breakdown.forEach(({ cat, amount }, i) => {
    const hex = categoryColorHex(cat);
    let end = start + (amount / total) * 100;
    if (i === breakdown.length - 1) end = 100;
    stops.push(`${hex} ${start}% ${end}%`);
    start = end;
  });
  return `conic-gradient(${stops.join(', ')})`;
}

function currentMonthLabel() {
  const now = new Date();
  const label = now.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function renderStats() {
  const list = transactionsForStats();
  const expenseTotal = sumExpenses(list);
  const incomeTotal = sumIncome(list);
  const balance = incomeTotal - expenseTotal;
  const breakdown = expenseBreakdownByCategory(list);

  const periodEl = $('#statsPeriod');
  const txCount = list.filter((e) => !isDebtCategory(e.categoryId)).length;
  if (periodEl) {
    let text = statsFilter === 'month' ? currentMonthLabel() : 'За всё время';
    if (txCount > 0) text += ` · ${txCount} ${pluralOps(txCount)}`;
    periodEl.textContent = text;
  }

  const expenseCompare = statsFilter === 'month' ? expenseMonthComparison() : null;
  const expenseCompareHtml = expenseCompare
    ? `<span class="stat-card__compare month-compare month-compare--${expenseCompare.tone}">${escapeHtml(expenseCompare.text)}</span>`
    : '';

  const cards = $('#statsCards');
  if (cards) {
    const balanceClass =
      balance >= 0 ? 'stat-card--balance-positive' : 'stat-card--balance-negative';
    cards.innerHTML = `
      <div class="stat-card stat-card--expense">
        <span class="stat-card__label">Траты</span>
        <span class="stat-card__value">${formatMoney(expenseTotal)}</span>
        ${expenseCompareHtml}
      </div>
      <div class="stat-card stat-card--income">
        <span class="stat-card__label">Доход</span>
        <span class="stat-card__value">${formatMoney(incomeTotal)}</span>
      </div>
      <div class="stat-card ${balanceClass}">
        <span class="stat-card__label">Остаток</span>
        <span class="stat-card__value">${balance >= 0 ? '+' : ''}${formatMoney(balance)}</span>
      </div>
    `;
  }

  const pieWrap = $('#statsPieWrap');
  const pieEl = $('#statsPie');
  const pieCenter = $('#statsPieCenter');
  const pieLegend = $('#statsPieLegend');
  if (pieWrap && pieEl && pieLegend) {
    const hasBreakdown = breakdown.length > 0 && expenseTotal > 0;
    pieWrap.classList.toggle('hidden', !hasBreakdown);
    if (hasBreakdown) {
      pieEl.style.background = expensePieGradient(breakdown, expenseTotal);
      const pieLabel = breakdown
        .map(({ cat, amount }) => {
          const share = Math.round((amount / expenseTotal) * 100);
          return `${cat?.name ?? 'Без категории'} ${share}%`;
        })
        .join(', ');
      pieEl.setAttribute('aria-label', `Траты по категориям: ${pieLabel}`);
      pieEl.removeAttribute('aria-hidden');
      if (pieCenter) {
        pieCenter.textContent = formatMoney(expenseTotal);
        pieCenter.setAttribute('aria-hidden', 'true');
      }
      pieLegend.innerHTML = '';
      breakdown.forEach(({ cat, amount }) => {
        const share = Math.round((amount / expenseTotal) * 100);
        const hex = categoryColorHex(cat);
        const li = document.createElement('li');
        li.className = 'stats-pie-legend__item';
        li.innerHTML = `
          <span class="stats-pie-legend__dot" style="background:${hex}"></span>
          <span class="stats-pie-legend__name">${escapeHtml(cat?.name ?? 'Без категории')}</span>
          <span class="stats-pie-legend__share">${share}%</span>
        `;
        pieLegend.appendChild(li);
      });
    } else {
      pieEl.removeAttribute('aria-label');
      pieEl.setAttribute('aria-hidden', 'true');
    }
  }

  const barsEl = $('#statsCategoryBars');
  const emptyEl = $('#statsCategoryEmpty');
  if (barsEl) {
    barsEl.innerHTML = '';
    const max = breakdown[0]?.amount ?? 0;
    breakdown.forEach(({ cat, amount }) => {
      const pct = max ? Math.round((amount / max) * 100) : 0;
      const share = expenseTotal ? Math.round((amount / expenseTotal) * 100) : 0;
      const hex = categoryColorHex(cat);
      const row = document.createElement('div');
      row.className = 'stat-bar';
      row.innerHTML = `
        <div class="stat-bar__head">
          <span class="stat-bar__name">${escapeHtml(cat?.name ?? 'Без категории')}</span>
          <span class="stat-bar__amount">${formatMoney(amount)}</span>
        </div>
        <div class="stat-bar__track">
          <div class="stat-bar__fill" style="width:${pct}%;background:${hex}"></div>
        </div>
        <span class="stat-bar__pct">${share}% от трат</span>
      `;
      barsEl.appendChild(row);
    });
    emptyEl?.classList.toggle('hidden', breakdown.length > 0);
  }

  const pending = debtExpenses().filter((e) => !e.returned);
  const debtsTotal = pending.reduce((s, e) => s + e.amount, 0);
  const debtsBlock = $('#statsDebtsBlock');
  const debtsCard = $('#statsDebtsCard');
  if (debtsBlock && debtsCard) {
    if (pending.length) {
      debtsBlock.classList.remove('hidden');
      debtsCard.innerHTML = `<strong>${pending.length}</strong> ${pluralDebts(pending.length)} на сумму <strong>${formatMoney(debtsTotal)}</strong>`;
    } else {
      debtsBlock.classList.add('hidden');
    }
  }

}

function pluralDebts(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'долг';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'долга';
  return 'долгов';
}

function pluralOps(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'операция';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'операции';
  return 'операций';
}

function showToast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('toast--show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.classList.remove('toast--show'), 2200);
}

function renderHeader() {
  const title =
    editingExpenseId && activeTab === 'add' ? 'Изменить' : TITLES[activeTab] ?? 'Расходы';
  $('#pageTitle').textContent = title;
  const summaries = $('#headerSummaries');
  if (activeTab === 'add' || activeTab === 'history') {
    $('#monthExpenseTotal').textContent = `Траты за месяц: ${formatMoney(monthExpenseTotal())}`;
    applyMonthCompare($('#monthExpenseCompare'), expenseMonthComparison());
    $('#monthIncomeTotal').textContent = `Поступления за месяц: ${formatMoney(monthIncomeTotal())}`;
    summaries.classList.remove('hidden');
  } else {
    summaries.classList.add('hidden');
  }
}

function renderKindChip(container, { kind, label, chipMod }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  const active = transactionKind === kind;
  btn.className = 'chip' + (chipMod ? ` chip--${chipMod}` : '') + (active ? ' chip--active' : '');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    transactionKind = kind;
    ensureCategoryForKind(kind);
    renderCategoryChips();
    toggleDebtFields();
  });
  container.appendChild(btn);
}

function renderCategoryChips() {
  const kindEl = $('#categoryChips');
  const subEl = $('#categorySubChips');
  const block = $('#expenseCategoryBlock');
  kindEl.innerHTML = '';
  subEl.innerHTML = '';

  renderKindChip(kindEl, { kind: 'expense', label: 'Трата' });
  renderKindChip(kindEl, { kind: 'debt', label: 'Долг', chipMod: 'debt' });
  renderKindChip(kindEl, { kind: 'income', label: 'Поступление', chipMod: 'income' });

  const showSub = transactionKind === 'expense' || transactionKind === 'income';
  block?.classList.toggle('hidden', !showSub);
  if (!showSub) return;

  ensureCategoryForKind(transactionKind);
  const subCats =
    transactionKind === 'expense' ? expenseCategories() : incomeCategories();
  const subMod = transactionKind === 'income' ? 'income' : '';
  subCats.forEach((cat) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = cat.id === selectedCategoryId;
    btn.className = 'chip' + (subMod ? ` chip--${subMod}` : '') + (active ? ' chip--active' : '');
    btn.textContent = cat.name;
    btn.dataset.id = cat.id;
    applyChipColor(btn, cat, active);
    btn.addEventListener('click', () => {
      selectedCategoryId = cat.id;
      renderCategoryChips();
      btn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    });
    subEl.appendChild(btn);
  });
  const activeBtn = subEl.querySelector('.chip--active');
  if (activeBtn) activeBtn.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function toggleDebtFields() {
  $('#debtFields').classList.toggle('hidden', transactionKind !== 'debt');
}

function renderCategoryManageKindChips() {
  const el = $('#categoryManageKindChips');
  if (!el) return;
  el.innerHTML = '';
  [
    { kind: 'expense', label: 'Трата' },
    { kind: 'debt', label: 'Долг', chipMod: 'debt' },
    { kind: 'income', label: 'Поступление', chipMod: 'income' },
  ].forEach(({ kind, label, chipMod }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = categoryManageKind === kind;
    btn.className = 'chip' + (chipMod ? ` chip--${chipMod}` : '') + (active ? ' chip--active' : '');
    btn.textContent = label;
    btn.addEventListener('click', () => {
      categoryManageKind = kind;
      openColorCategoryId = null;
      editingCategoryNameId = null;
      renderCategoryManage();
    });
    el.appendChild(btn);
  });
}

function canDeleteCategory(cat) {
  if (cat.isDebt) return false;
  if (cat.isIncome) return incomeCategories().length > 1;
  return true;
}

function renderCategoryManage() {
  renderCategoryManageKindChips();
  const list = $('#categoryManageList');
  const form = $('#addCategoryForm');
  const hint = $('#categoryManageHint');
  const input = $('#newCategoryName');
  list.innerHTML = '';

  const isDebtKind = categoryManageKind === 'debt';
  form?.classList.toggle('hidden', isDebtKind);
  if (hint) {
    if (isDebtKind) {
      hint.textContent = 'Для долгов используется одна категория. Можно изменить название и цвет.';
      hint.classList.remove('hidden');
    } else {
      hint.classList.add('hidden');
    }
  }
  if (input) {
    input.placeholder =
      categoryManageKind === 'income' ? 'Новое поступление' : 'Новая категория';
  }

  categoriesForKind(categoryManageKind).forEach((cat) => {
    const wrap = document.createElement('li');
    wrap.className = 'category-card';
    const used = state.expenses.some((e) => e.categoryId === cat.id);
    const hex = categoryColorHex(cat);
    const pickerOpen = openColorCategoryId === cat.id;

    const row = document.createElement('div');
    row.className = 'category-row';
    const nameEditing = editingCategoryNameId === cat.id;
    const info = document.createElement('span');
    info.className = 'category-row__info';
    if (nameEditing) {
      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'category-row__name-input field__input';
      nameInput.value = cat.name;
      nameInput.maxLength = 32;
      nameInput.setAttribute('aria-label', 'Название категории');
      const commitName = () => {
        if (renameCategory(cat.id, nameInput.value)) editingCategoryNameId = null;
      };
      nameInput.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter') {
          ev.preventDefault();
          commitName();
          renderCategoryManage();
        } else if (ev.key === 'Escape') {
          ev.preventDefault();
          editingCategoryNameId = null;
          renderCategoryManage();
        }
      });
      nameInput.addEventListener('blur', () => {
        if (editingCategoryNameId !== cat.id) return;
        commitName();
        renderCategoryManage();
      });
      info.appendChild(nameInput);
      requestAnimationFrame(() => {
        nameInput.focus();
        nameInput.select();
      });
    } else {
      const nameBtn = document.createElement('button');
      nameBtn.type = 'button';
      nameBtn.className = 'category-row__name';
      nameBtn.textContent = cat.name;
      nameBtn.setAttribute('aria-label', `Переименовать «${cat.name}»`);
      nameBtn.addEventListener('click', () => {
        editingCategoryNameId = cat.id;
        openColorCategoryId = null;
        renderCategoryManage();
      });
      info.appendChild(nameBtn);
      if (cat.builtin) {
        const badge = document.createElement('span');
        badge.className = 'category-row__badge';
        badge.textContent = 'базовая';
        info.appendChild(badge);
      }
    }

    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'category-row__swatch';
    swatch.style.background = hex;
    swatch.setAttribute('aria-label', 'Выбрать цвет');
    swatch.addEventListener('click', () => {
      editingCategoryNameId = null;
      openColorCategoryId = openColorCategoryId === cat.id ? null : cat.id;
      renderCategoryManage();
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'category-row__delete';
    del.textContent = 'Удалить';
    del.dataset.id = cat.id;
    if (!canDeleteCategory(cat)) del.disabled = true;

    row.appendChild(swatch);
    row.appendChild(info);
    row.appendChild(del);

    if (canDeleteCategory(cat)) {
      del.addEventListener('click', () => deleteCategory(cat.id, used));
    } else if (cat.isDebt) {
      del.title = 'Категорию долга нельзя удалить';
    } else if (cat.isIncome) {
      del.title = 'Нужна хотя бы одна категория поступлений';
    }

    const picker = document.createElement('div');
    picker.className = `category-color-picker${pickerOpen ? '' : ' hidden'}`;
    CATEGORY_COLORS.forEach((color, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-color-btn' + (cat.color === i ? ' category-color-btn--selected' : '');
      btn.style.background = color;
      btn.setAttribute('aria-label', `Цвет ${i + 1}`);
      btn.addEventListener('click', () => setCategoryColor(cat.id, i));
      picker.appendChild(btn);
    });

    wrap.appendChild(row);
    wrap.appendChild(picker);
    list.appendChild(wrap);
  });
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function deleteCategory(id, hasExpenses) {
  const cat = categoryById(id);
  if (!cat || !canDeleteCategory(cat)) return;
  const fallbackId = cat.isIncome ? 'income' : 'other';
  const fallback = categoryById(fallbackId);
  const fallbackName = fallback?.name ?? (cat.isIncome ? 'Поступление' : 'Прочее');
  if (hasExpenses) {
    const kindLabel = cat.isIncome ? 'поступления' : 'траты';
    if (!confirm(`В категории «${cat.name}» есть ${kindLabel}. Удалить? Записи перейдут в «${fallbackName}».`)) return;
    state.expenses.forEach((e) => {
      if (e.categoryId === id) e.categoryId = fallbackId;
    });
  }
  state.categories = state.categories.filter((c) => c.id !== id);
  if (selectedCategoryId === id) {
    selectedCategoryId = firstCategoryIdForKind(cat.isIncome ? 'income' : 'expense');
    transactionKind = cat.isIncome ? 'income' : 'expense';
  }
  saveState();
  renderAll();
  showToast('Категория удалена');
}

function renderExpenseItem(exp, options = {}) {
  const cat = categoryById(exp.categoryId);
  const li = document.createElement('li');
  li.className = 'expense-item';
  if (options.debtView && exp.returned) li.classList.add('expense-item--returned');

  const isDebt = cat?.isDebt;
  const isIncome = cat?.isIncome;
  const overdue =
    isDebt &&
    !exp.returned &&
    exp.returnDueDate &&
    parseStoredDate(exp.returnDueDate) < new Date(new Date().toDateString());

  let dotClass = 'expense-item__dot';
  if (overdue) dotClass += ' expense-item__dot--overdue';
  else if (isIncome) dotClass += ' expense-item__dot--income';
  else if (isDebt) dotClass += ' expense-item__dot--debt';
  const returnedMuted = options.debtView && exp.returned;
  const dotColor = !overdue && !returnedMuted && cat ? categoryColorHex(cat) : '';

  const debtView = options.debtView && isDebt;

  let meta = formatDate(exp.date);
  if (exp.note) meta += ` · ${escapeHtml(exp.note)}`;
  if (isDebt && exp.debtorName && !debtView) meta += ` · ${escapeHtml(exp.debtorName)}`;
  if (debtView && cat?.name) meta += ` · ${escapeHtml(cat.name)}`;
  if (isDebt && exp.returnDueDate) {
    const label = exp.returned ? 'Вернули' : overdue ? 'Просрочено' : 'Вернуть до';
    meta += ` · ${label}: ${formatDate(exp.returnDueDate)}`;
  }
  if (exp.returned && !debtView) meta += ' · закрыто';

  const title = debtView
    ? exp.debtorName?.trim() || 'Без имени'
    : cat?.name ?? 'Без категории';

  const showReturn = (options.actions || options.debtReturn) && isDebt && !exp.returned;
  const showEdit = options.edit && !options.selectable;
  const showActions = options.actions || showReturn || showEdit;

  const dotStyle = dotColor ? ` style="background:${dotColor}"` : '';
  const leading = options.selectable
    ? `<input type="checkbox" class="expense-item__check" ${options.selected ? 'checked' : ''} aria-label="Выбрать" />`
    : `<span class="${dotClass}"${dotStyle}></span>`;

  if (options.selectable) {
    li.classList.add('expense-item--selectable');
    if (options.selected) li.classList.add('expense-item--selected');
  }

  li.innerHTML = `
    ${leading}
    <div class="expense-item__body">
      <div class="expense-item__row">
        <span class="expense-item__title">${escapeHtml(title)}</span>
        <span class="expense-item__amount${isIncome ? ' expense-item__amount--income' : ''}">${isIncome ? '+' : ''}${formatMoney(exp.amount)}</span>
      </div>
      <div class="expense-item__meta">${meta}</div>
      ${showActions ? `<div class="expense-item__actions"></div>` : ''}
    </div>
  `;

  if (showActions) {
    const actions = li.querySelector('.expense-item__actions');
    if (showEdit) {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-edit';
      editBtn.textContent = 'Изменить';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        startEditExpense(exp.id);
      });
      actions.appendChild(editBtn);
    }
    if (showReturn) {
      const ret = document.createElement('button');
      ret.type = 'button';
      ret.className = 'btn-return';
      ret.textContent = 'Вернули';
      ret.addEventListener('click', (e) => {
        e.stopPropagation();
        markReturned(exp.id);
      });
      actions.appendChild(ret);
    }
    if (options.actions) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'btn-delete';
      del.textContent = 'Удалить';
      del.addEventListener('click', () => deleteExpense(exp.id));
      actions.appendChild(del);
    }
  }

  if (options.selectable) {
    const check = li.querySelector('.expense-item__check');
    const toggle = (on) => {
      li.classList.toggle('expense-item--selected', on);
      options.onToggle?.(exp.id, on);
    };
    check.addEventListener('change', () => toggle(check.checked));
    li.addEventListener('click', (e) => {
      if (e.target.closest('.expense-item__check')) return;
      check.checked = !check.checked;
      toggle(check.checked);
    });
  }

  return li;
}

function updateHistorySelectUI() {
  const statsBtn = $('#historyOpenStats');
  const toggle = $('#historySelectToggle');
  const bar = $('#historySelectBar');
  const delBtn = $('#historyDeleteSelected');
  const allBtn = $('#historySelectAll');
  const items = historyVisibleExpenses();
  if (statsBtn) statsBtn.classList.toggle('hidden', historySelectMode);
  if (toggle) toggle.classList.toggle('hidden', historySelectMode || items.length === 0);
  if (bar) bar.classList.toggle('hidden', !historySelectMode);
  if (delBtn) {
    const n = historySelectedIds.size;
    delBtn.textContent = n ? `Удалить (${n})` : 'Удалить';
    delBtn.disabled = n === 0;
  }
  if (allBtn) {
    const allSelected = items.length > 0 && items.every((e) => historySelectedIds.has(e.id));
    allBtn.textContent = allSelected ? 'Снять' : 'Все';
  }
}

function toggleHistorySelection(id, on) {
  if (on) historySelectedIds.add(id);
  else historySelectedIds.delete(id);
  updateHistorySelectUI();
}

function enterHistorySelectMode() {
  historySelectMode = true;
  historySelectedIds.clear();
  updateHistorySelectUI();
  renderHistory();
}

function exitHistorySelectMode() {
  historySelectMode = false;
  historySelectedIds.clear();
  updateHistorySelectUI();
  renderHistory();
}

function selectAllHistoryVisible() {
  const items = historyVisibleExpenses();
  const allSelected = items.length > 0 && items.every((e) => historySelectedIds.has(e.id));
  if (allSelected) items.forEach((e) => historySelectedIds.delete(e.id));
  else items.forEach((e) => historySelectedIds.add(e.id));
  renderHistory();
}

function debtExpenses() {
  return state.expenses.filter((e) => isDebtCategory(e.categoryId));
}

function updateDebtsSelectUI() {
  const toggle = $('#debtsSelectToggle');
  const bar = $('#debtsSelectBar');
  const delBtn = $('#debtsDeleteSelected');
  const allBtn = $('#debtsSelectAll');
  const items = debtExpenses();
  if (toggle) toggle.classList.toggle('hidden', debtsSelectMode || items.length === 0);
  if (bar) bar.classList.toggle('hidden', !debtsSelectMode);
  if (delBtn) {
    const n = debtsSelectedIds.size;
    delBtn.textContent = n ? `Удалить (${n})` : 'Удалить';
    delBtn.disabled = n === 0;
  }
  if (allBtn) {
    const allSelected = items.length > 0 && items.every((e) => debtsSelectedIds.has(e.id));
    allBtn.textContent = allSelected ? 'Снять' : 'Все';
  }
}

function toggleDebtsSelection(id, on) {
  if (on) debtsSelectedIds.add(id);
  else debtsSelectedIds.delete(id);
  updateDebtsSelectUI();
}

function enterDebtsSelectMode() {
  debtsSelectMode = true;
  debtsSelectedIds.clear();
  updateDebtsSelectUI();
  renderDebts();
}

function exitDebtsSelectMode() {
  debtsSelectMode = false;
  debtsSelectedIds.clear();
  updateDebtsSelectUI();
  renderDebts();
}

function selectAllDebtsVisible() {
  const items = debtExpenses();
  const allSelected = items.length > 0 && items.every((e) => debtsSelectedIds.has(e.id));
  if (allSelected) items.forEach((e) => debtsSelectedIds.delete(e.id));
  else items.forEach((e) => debtsSelectedIds.add(e.id));
  renderDebts();
}

function deleteSelectedDebts() {
  const ids = [...debtsSelectedIds];
  if (!ids.length) return;
  debtsSelectMode = false;
  debtsSelectedIds.clear();
  deleteExpenses(ids);
}

function renderHistory() {
  const list = $('#expenseList');
  const empty = $('#historyEmpty');
  const periodItems = filterExpenses(state.expenses);
  const items = applyHistoryFilters(periodItems);
  list.innerHTML = '';
  let lastGroupKey = null;
  items.forEach((e) => {
    const groupKey = dateGroupKey(e.date);
    if (groupKey !== lastGroupKey) {
      list.appendChild(renderHistoryGroupHeader(formatHistoryGroupLabel(groupKey)));
      lastGroupKey = groupKey;
    }
    const opts = historySelectMode
      ? {
          selectable: true,
          selected: historySelectedIds.has(e.id),
          onToggle: toggleHistorySelection,
        }
      : { debtReturn: true, edit: true };
    list.appendChild(renderExpenseItem(e, opts));
  });
  if (empty) {
    empty.textContent =
      items.length === 0 && historyFiltersActive() && periodItems.length > 0
        ? 'Ничего не найдено'
        : 'Пока нет трат';
    empty.classList.toggle('hidden', items.length > 0);
  }
  renderHistoryPrimaryFilters();
  renderHistorySubFilters();
  updateHistorySearchUI();
  updateHistorySelectUI();
}

function renderDebts() {
  const debts = debtExpenses();
  const pending = debts.filter((e) => !e.returned);

  debts.sort((a, b) => {
    if (a.returned !== b.returned) return a.returned ? 1 : -1;
    const da = a.returnDueDate ? new Date(a.returnDueDate) : new Date(8640000000000000);
    const db = b.returnDueDate ? new Date(b.returnDueDate) : new Date(8640000000000000);
    return da - db;
  });

  const total = pending.reduce((s, e) => s + e.amount, 0);
  const summary = $('#debtsSummary');
  if (pending.length) {
    summary.innerHTML = `Активных долгов: <strong>${pending.length}</strong> на сумму <strong>${formatMoney(total)}</strong>`;
    summary.classList.remove('hidden');
  } else {
    summary.innerHTML = '';
    summary.classList.add('hidden');
  }

  const list = $('#debtsList');
  const empty = $('#debtsEmpty');
  list.innerHTML = '';
  debts.forEach((e) => {
    const opts = debtsSelectMode
      ? {
          selectable: true,
          selected: debtsSelectedIds.has(e.id),
          onToggle: toggleDebtsSelection,
          debtView: true,
        }
      : { debtView: true, debtReturn: true, edit: true };
    list.appendChild(renderExpenseItem(e, opts));
  });
  empty.classList.toggle('hidden', debts.length > 0);
  updateDebtsSelectUI();
}

function renderAll() {
  renderHeader();
  renderCategoryChips();
  toggleDebtFields();
  renderHistory();
  renderStats();
  renderDebts();
  renderCategoryManage();
}

function switchTab(tab) {
  if (tab !== 'history' && tab !== 'stats' && historySelectMode) exitHistorySelectMode();
  if (tab !== 'debts' && debtsSelectMode) exitDebtsSelectMode();
  activeTab = tab;
  $$('.nav__btn').forEach((b) => {
    const navTab = b.dataset.tab;
    b.classList.toggle('nav__btn--active', navTab === tab || (tab === 'stats' && navTab === 'history'));
  });
  $$('.panel').forEach((p) => p.classList.toggle('panel--active', p.dataset.panel === tab));
  renderHeader();
  updateEditUI();
  if (tab === 'history') renderHistory();
  if (tab === 'stats') renderStats();
  if (tab === 'debts') renderDebts();
  if (tab === 'categories') renderCategoryManage();
}

function expenseKindFromCategory(categoryId) {
  if (isDebtCategory(categoryId)) return 'debt';
  if (isIncomeCategory(categoryId)) return 'income';
  return 'expense';
}

function updateEditUI() {
  const editing = Boolean(editingExpenseId);
  $('#saveExpense').textContent = editing ? 'Сохранить изменения' : 'Сохранить';
  $('#cancelEdit')?.classList.toggle('hidden', !editing);
}

function clearAddForm() {
  $('#amountInput').value = '';
  $('#noteInput').value = '';
  setDateInput($('#transactionDate'), '');
  cachedTransactionDate = '';
  $('#debtorName').value = '';
  const week = new Date();
  week.setDate(week.getDate() + 7);
  setDateInput($('#returnDueDate'), toInputDate(week));
}

function cancelEdit() {
  if (!editingExpenseId) return;
  editingExpenseId = null;
  transactionKind = 'expense';
  selectedCategoryId = firstExpenseCategoryId();
  clearAddForm();
  renderCategoryChips();
  toggleDebtFields();
  updateEditUI();
  renderHeader();
}

function startEditExpense(id) {
  const exp = state.expenses.find((x) => x.id === id);
  if (!exp) return;
  if (historySelectMode) exitHistorySelectMode();
  if (debtsSelectMode) exitDebtsSelectMode();

  editingExpenseId = id;
  transactionKind = expenseKindFromCategory(exp.categoryId);
  selectedCategoryId = exp.categoryId;

  const amountStr = exp.amount % 1 === 0 ? String(exp.amount) : String(exp.amount).replace('.', ',');
  $('#amountInput').value = amountStr;
  $('#noteInput').value = exp.note || '';
  cachedTransactionDate = exp.date;
  setDateInput($('#transactionDate'), exp.date);

  if (transactionKind === 'debt') {
    $('#debtorName').value = exp.debtorName || '';
    setDateInput($('#returnDueDate'), exp.returnDueDate || '');
  }

  switchTab('add');
  renderCategoryChips();
  toggleDebtFields();
  updateEditUI();
  renderHeader();
  $('#amountInput').focus();
}

function saveExpense() {
  const amount = parseAmount($('#amountInput').value);
  if (!amount) {
    showToast('Введите сумму');
    $('#amountInput').focus();
    return;
  }

  const categoryId = effectiveCategoryId();
  const debt = transactionKind === 'debt';
  const returnDueRaw = debt ? $('#returnDueDate').value.trim() : '';
  const returnDueDate = debt ? readDateInput($('#returnDueDate')) : null;
  if (debt && !returnDueDate) {
    showToast(returnDueRaw ? 'Неверная дата возврата' : 'Укажите дату, когда должны вернуть');
    $('#returnDueDate').focus();
    return;
  }

  const note = $('#noteInput').value.trim();
  const date = resolveTransactionDate(getTransactionDateValue());
  const debtorName = debt ? $('#debtorName').value.trim() : '';

  if (editingExpenseId) {
    const existing = state.expenses.find((x) => x.id === editingExpenseId);
    if (!existing) {
      editingExpenseId = null;
      updateEditUI();
      renderHeader();
      return;
    }
    const wasDebt = isDebtCategory(existing.categoryId);
    existing.amount = amount;
    existing.categoryId = categoryId;
    existing.note = note;
    existing.date = date;
    if (debt) {
      existing.debtorName = debtorName;
      existing.returnDueDate = returnDueDate;
      if (!wasDebt) {
        existing.returned = false;
        existing.returnedAt = null;
      }
    } else {
      existing.debtorName = '';
      existing.returnDueDate = null;
      existing.returned = false;
      existing.returnedAt = null;
    }
    editingExpenseId = null;
    saveState();
    clearAddForm();
    transactionKind = 'expense';
    selectedCategoryId = firstExpenseCategoryId();
    updateEditUI();
    renderAll();
    showToast('Изменения сохранены');
    $('#amountInput').focus();
    return;
  }

  const expense = {
    id: uid(),
    amount,
    categoryId,
    note,
    date,
    debtorName,
    returnDueDate: debt ? returnDueDate : null,
    returned: false,
    returnedAt: null,
  };

  state.expenses.unshift(expense);
  saveState();
  clearAddForm();

  renderAll();
  const income = transactionKind === 'income';
  showToast(debt ? 'Долг записан' : income ? 'Поступление записано' : 'Сохранено');
  $('#amountInput').focus();
}

function markReturned(id) {
  const e = state.expenses.find((x) => x.id === id);
  if (!e) return;
  e.returned = true;
  e.returnedAt = Date.now();
  saveState();
  renderAll();
  showToast('Отмечено как возвращённое');
}

function deleteExpenses(ids) {
  const arr = Array.isArray(ids) ? ids : [ids];
  if (!arr.length) return;
  const msg = arr.length === 1 ? 'Удалить эту запись?' : `Удалить ${arr.length} записей?`;
  if (!confirm(msg)) return;
  const set = new Set(arr);
  state.expenses = state.expenses.filter((e) => !set.has(e.id));
  saveState();
  renderAll();
  showToast(arr.length === 1 ? 'Удалено' : `Удалено: ${arr.length}`);
}

function deleteExpense(id) {
  deleteExpenses([id]);
}

function deleteSelectedHistory() {
  const ids = [...historySelectedIds];
  if (!ids.length) return;
  historySelectMode = false;
  historySelectedIds.clear();
  deleteExpenses(ids);
}

function toInputDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dateDigits(str) {
  return String(str).replace(/\D/g, '').slice(0, 8);
}

function formatDateDigits(digits) {
  if (!digits) return '';
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `.${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `.${digits.slice(4, 8)}`;
  return out;
}

function isoToDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, day] = iso.split('-');
  return `${day}.${m}.${y}`;
}

function parseDateInput(str) {
  const digits = dateDigits(str);
  if (digits.length !== 8) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = Number(digits.slice(4, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toInputDate(d);
}

function setDateInput(el, iso) {
  if (!el) return;
  el.value = iso ? isoToDisplay(iso) : '';
}

function readDateInput(el) {
  if (!el) return '';
  const raw = el.value.trim();
  if (!raw) return '';
  return parseDateInput(raw) || '';
}

function bindSequentialDateInput(el, onSync) {
  el.addEventListener('input', () => {
    const digits = dateDigits(el.value);
    el.value = formatDateDigits(digits);
    onSync?.(parseDateInput(el.value));
  });
  el.addEventListener('blur', () => {
    if (!el.value.trim()) return;
    if (!parseDateInput(el.value)) showToast('Неверная дата');
  });
}

function getTransactionDateValue() {
  const el = $('#transactionDate');
  if (!el) return '';
  return readDateInput(el) || cachedTransactionDate;
}

function resolveTransactionDate(value) {
  return value || toInputDate(new Date());
}

function renameCategory(id, name) {
  const cat = categoryById(id);
  if (!cat) return false;
  const trimmed = name.trim();
  if (!trimmed) {
    showToast('Введите название');
    return false;
  }
  if (trimmed === cat.name) return true;
  if (state.categories.some((c) => c.id !== id && c.name.toLowerCase() === trimmed.toLowerCase())) {
    showToast('Такая категория уже есть');
    return false;
  }
  cat.name = trimmed;
  saveState();
  renderAll();
  showToast('Название изменено');
  return true;
}

function addCategory(name, kind = categoryManageKind) {
  if (kind === 'debt') return;
  const trimmed = name.trim();
  if (!trimmed) return;
  if (state.categories.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
    showToast('Такая категория уже есть');
    return;
  }
  const id = `cat-${uid().slice(0, 8)}`;
  const usedColors = new Set(state.categories.map((c) => c.color));
  let color = 0;
  while (usedColors.has(color) && color < CATEGORY_COLORS.length) color += 1;
  const entry = {
    id,
    name: trimmed,
    builtin: false,
    color: color % CATEGORY_COLORS.length,
  };
  if (kind === 'income') {
    entry.isIncome = true;
    entry.isDebt = false;
  } else {
    entry.isDebt = false;
    entry.isIncome = false;
  }
  state.categories.push(entry);
  saveState();
  $('#newCategoryName').value = '';
  renderAll();
  showToast(kind === 'income' ? 'Категория поступления добавлена' : 'Категория добавлена');
}

function init() {
  const week = new Date();
  week.setDate(week.getDate() + 7);
  setDateInput($('#returnDueDate'), toInputDate(week));

  const txDateEl = $('#transactionDate');
  if (txDateEl) {
    bindSequentialDateInput(txDateEl, (iso) => {
      cachedTransactionDate = iso || '';
    });
  }
  bindSequentialDateInput($('#returnDueDate'));

  renderAll();

  $('#saveExpense').addEventListener('click', saveExpense);
  $('#cancelEdit')?.addEventListener('click', cancelEdit);

  $('#amountInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveExpense();
  });

  $$('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $$('#panelHistory .filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyFilter = btn.dataset.filter;
      $$('#panelHistory .filter-btn').forEach((b) =>
        b.classList.toggle('filter-btn--active', b === btn),
      );
      renderHistory();
    });
  });

  $('#historySearchInput')?.addEventListener('input', (e) => {
    historySearchQuery = e.target.value;
    updateHistorySearchUI();
    renderHistory();
  });

  $('#historySearchClear')?.addEventListener('click', () => {
    historySearchQuery = '';
    const input = $('#historySearchInput');
    if (input) input.value = '';
    updateHistorySearchUI();
    renderHistory();
  });

  $$('#historyPrimaryFilters .chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      setHistoryKindFilter(btn.dataset.historyKind || 'all');
      renderHistory();
    });
  });

  $$('.stats-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      statsFilter = btn.dataset.statsFilter;
      $$('.stats-filter-btn').forEach((b) =>
        b.classList.toggle('stats-filter-btn--active', b === btn),
      );
      renderStats();
    });
  });

  $('#historyOpenStats')?.addEventListener('click', () => switchTab('stats'));
  $('#statsBackBtn')?.addEventListener('click', () => switchTab('history'));
  $('#historySelectToggle')?.addEventListener('click', enterHistorySelectMode);
  $('#historyCancelSelect')?.addEventListener('click', exitHistorySelectMode);
  $('#historySelectAll')?.addEventListener('click', selectAllHistoryVisible);
  $('#historyDeleteSelected')?.addEventListener('click', deleteSelectedHistory);

  $('#debtsSelectToggle')?.addEventListener('click', enterDebtsSelectMode);
  $('#debtsCancelSelect')?.addEventListener('click', exitDebtsSelectMode);
  $('#debtsSelectAll')?.addEventListener('click', selectAllDebtsVisible);
  $('#debtsDeleteSelected')?.addEventListener('click', deleteSelectedDebts);

  $('#addCategoryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addCategory($('#newCategoryName').value);
  });

  $('#amountInput').focus();
}

init();
