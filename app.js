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
  debts: 'Долги',
  categories: 'Категории',
};

let state = loadState();
let activeTab = 'add';
let transactionKind = 'expense';
let selectedCategoryId = firstExpenseCategoryId();
let historyFilter = 'month';
let historySelectMode = false;
const historySelectedIds = new Set();
let debtsSelectMode = false;
const debtsSelectedIds = new Set();
let cachedTransactionDate = '';
let openColorCategoryId = null;
let categoryManageKind = 'expense';

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
  const debtCat = categories.find((c) => c.id === 'debt');
  if (debtCat) debtCat.name = 'Долг';
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
  $('#pageTitle').textContent = TITLES[activeTab] ?? 'Расходы';
  const summaries = $('#headerSummaries');
  if (activeTab === 'add' || activeTab === 'history') {
    $('#monthExpenseTotal').textContent = `Траты за месяц: ${formatMoney(monthExpenseTotal())}`;
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
    });
    subEl.appendChild(btn);
  });
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
      hint.textContent = 'Для долгов используется одна категория. Можно изменить только цвет.';
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
    row.innerHTML = `
      <button type="button" class="category-row__swatch" style="background:${hex}" aria-label="Выбрать цвет"></button>
      <span class="category-row__info">
        <span class="category-row__name">${escapeHtml(cat.name)}</span>
        ${cat.builtin ? '<span class="category-row__badge">базовая</span>' : ''}
      </span>
      <button type="button" class="category-row__delete" ${canDeleteCategory(cat) ? '' : 'disabled'} data-id="${cat.id}">Удалить</button>
    `;

    row.querySelector('.category-row__swatch').addEventListener('click', () => {
      openColorCategoryId = openColorCategoryId === cat.id ? null : cat.id;
      renderCategoryManage();
    });

    const del = row.querySelector('.category-row__delete');
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
  const showActions = options.actions || showReturn;

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
    if (showReturn) {
      const ret = document.createElement('button');
      ret.type = 'button';
      ret.className = 'btn-return';
      ret.textContent = 'Вернули';
      ret.addEventListener('click', () => markReturned(exp.id));
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
  const toggle = $('#historySelectToggle');
  const bar = $('#historySelectBar');
  const delBtn = $('#historyDeleteSelected');
  const allBtn = $('#historySelectAll');
  const items = filterExpenses(state.expenses);
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
  const items = filterExpenses(state.expenses);
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
  const items = filterExpenses(state.expenses);
  list.innerHTML = '';
  items.forEach((e) => {
    const opts = historySelectMode
      ? {
          selectable: true,
          selected: historySelectedIds.has(e.id),
          onToggle: toggleHistorySelection,
        }
      : { debtReturn: true };
    list.appendChild(renderExpenseItem(e, opts));
  });
  empty.classList.toggle('hidden', items.length > 0);
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
      : { debtView: true, debtReturn: true };
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
  renderDebts();
  renderCategoryManage();
}

function switchTab(tab) {
  if (tab !== 'history' && historySelectMode) exitHistorySelectMode();
  if (tab !== 'debts' && debtsSelectMode) exitDebtsSelectMode();
  activeTab = tab;
  $$('.nav__btn').forEach((b) => b.classList.toggle('nav__btn--active', b.dataset.tab === tab));
  $$('.panel').forEach((p) => p.classList.toggle('panel--active', p.dataset.panel === tab));
  renderHeader();
  if (tab === 'history') renderHistory();
  if (tab === 'debts') renderDebts();
  if (tab === 'categories') renderCategoryManage();
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

  const expense = {
    id: uid(),
    amount,
    categoryId,
    note: $('#noteInput').value.trim(),
    date: resolveTransactionDate(getTransactionDateValue()),
    debtorName: debt ? $('#debtorName').value.trim() : '',
    returnDueDate: debt ? returnDueDate : null,
    returned: false,
    returnedAt: null,
  };

  state.expenses.unshift(expense);
  saveState();

  $('#amountInput').value = '';
  $('#noteInput').value = '';
  setDateInput($('#transactionDate'), '');
  cachedTransactionDate = '';
  $('#debtorName').value = '';
  if (debt) {
    const due = new Date();
    due.setDate(due.getDate() + 7);
    setDateInput($('#returnDueDate'), toInputDate(due));
  }

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

  $('#amountInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveExpense();
  });

  $$('.nav__btn').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  $$('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      historyFilter = btn.dataset.filter;
      $$('.filter-btn').forEach((b) => b.classList.toggle('filter-btn--active', b === btn));
      renderHistory();
    });
  });

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
