/* ============================================================
   filters.js — Cascading sidebar filters + applyFilters (ES module)
   ============================================================ */

import { state } from './state.js';
import { esc } from './utils.js';
import { renderTable, updateStatusBar } from './table.js';

// ======== SIDEBAR BUILD ========
export function buildSidebar() {
  buildYearNav();
  buildMonthNav();
  buildWeekNav();
  buildCatNav();
  buildExtNav();
}

export function buildYearNav() {
  const el = document.getElementById('yearNav');
  const allSelected = state.sidebarYearChecked.size === 0;
  let h = '';
  state.yearOrder.forEach(y => {
    const cnt = state.allItems.filter(c => c.week.startsWith(y + '年')).length;
    const checked = allSelected || state.sidebarYearChecked.has(y);
    h += `<div class="nav-item${checked ? ' selected' : ''}" data-y="${y}" onclick="DL.toggleYearNav(this)">
      <input type="checkbox" ${checked ? 'checked' : ''} tabindex="-1" />
      <span class="nav-label">${y}年</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  });
  el.innerHTML = h;
}

export function buildMonthNav() {
  const el = document.getElementById('monthNav');
  const checkedYears = new Set(state.sidebarYearChecked);
  const filterYear = checkedYears.size > 0;
  const availMons = new Set();
  state.allItems.forEach(c => {
    const ym = c.week.match(/(\d+)年(\d+)月/);
    if (!ym) return;
    if (filterYear && !checkedYears.has(ym[1])) return;
    availMons.add(ym[2] + '月');
  });
  let h = '';
  state.monthOrder.forEach(m => {
    const avail = availMons.has(m);
    const cnt = avail ? state.allItems.filter(c => {
      const ym = c.week.match(/(\d+)年(\d+)月/);
      if (!ym) return false;
      if (filterYear && !checkedYears.has(ym[1])) return false;
      return (ym[2] + '月') === m;
    }).length : 0;
    if (!avail) return;
    const checked = state.sidebarMonthChecked.has(m) || state.sidebarMonthChecked.size === 0;
    h += `<div class="nav-item${checked ? ' selected' : ''}" data-m="${m}" onclick="DL.toggleMonthNav(this)">
      <input type="checkbox" ${checked ? 'checked' : ''} tabindex="-1" />
      <span class="nav-label">${m}</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  });
  el.innerHTML = h;
}

export function buildCatNav() {
  const el = document.getElementById('catNav');
  let h = '';
  for (const [cn, cname] of Object.entries(state.CAT_NAMES)) {
    const cnt = state.allItems.filter(c => c.cat_num === cn).length;
    const checked = state.sidebarCatChecked.has(cn);
    h += `<div class="nav-item${checked ? ' selected' : ''}" data-cat="${cn}" onclick="DL.toggleCatNav(this)">
      <span class="cat-dot c${cn}"></span>
      <span class="nav-label">${cname}</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  }
  el.innerHTML = h;
}

export function buildWeekNav() {
  const el = document.getElementById('weekNav');
  const checkedYears = new Set(state.sidebarYearChecked);
  const filterYear = checkedYears.size > 0;
  const checkedMonths = new Set(state.sidebarMonthChecked);
  const filterMonth = checkedMonths.size > 0;
  // Group weeks by month_key → Map(week_label → count)
  const byMonth = new Map(); // "2026年4月" → [ {week, count}, ... ]
  state.allItems.forEach(c => {
    const m = c.week.match(/(\d+)年(\d+)月第(\d+)周/);
    if (!m) return;
    if (filterYear && !checkedYears.has(m[1])) return;
    if (filterMonth && !checkedMonths.has(m[2] + '月')) return;
    const monthKey = m[1] + '年' + m[2] + '月';
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const wm = byMonth.get(monthKey);
    wm.set(c.week, (wm.get(c.week) || 0) + 1);
  });
  const monthKeys = [...byMonth.keys()].sort((a, b) => {
    const ma = a.match(/(\d+)年(\d+)月/), mb = b.match(/(\d+)年(\d+)月/);
    if (!ma || !mb) return a.localeCompare(b);
    return (ma[1] - mb[1]) || (ma[2] - mb[2]);
  });
  const allSelected = state.sidebarWeekChecked.size === 0;
  let h = '';
  monthKeys.forEach(mk => {
    const wm = byMonth.get(mk);
    const weeks = [...wm.keys()].sort((a, b) => {
      const ma = a.match(/第(\d+)周/), mb = b.match(/第(\d+)周/);
      return (ma ? parseInt(ma[1]) : 0) - (mb ? parseInt(mb[1]) : 0);
    });
    h += `<div class="week-group-header">${mk}</div>`;
    weeks.forEach(w => {
      const checked = allSelected || state.sidebarWeekChecked.has(w);
      const short = '第' + (w.match(/第(\d+)周/) || ['', '?'])[1] + '周';
      h += `<div class="nav-item${checked ? ' selected' : ''}" data-w="${w}" onclick="DL.toggleWeekNav(this)">
        <input type="checkbox" ${checked ? 'checked' : ''} tabindex="-1" />
        <span class="nav-label">${short}</span>
        <span class="nav-count">${wm.get(w).toLocaleString()}</span>
      </div>`;
    });
  });
  el.innerHTML = h;
}

export function buildExtNav() {
  const el = document.getElementById('extNav');
  const exts = {};
  state.allItems.forEach(c => { exts[c.ext] = (exts[c.ext] || 0) + 1; });
  el.innerHTML = '<option value="">全部</option>';
  const frag = document.createDocumentFragment();
  Object.entries(exts).sort((a, b) => b[1] - a[1]).forEach(([e, n]) => {
    const o = document.createElement('option');
    o.value = e; o.textContent = `${e} (${n})`;
    frag.appendChild(o);
  });
  el.appendChild(frag);
}

// ======== SIDEBAR TOGGLES ========
export function toggleYearNav(el) {
  const y = el.dataset.y;
  if (state.sidebarYearChecked.size === 0) {
    // All selected → deselect this one, keep all others
    state.sidebarYearChecked = new Set(state.yearOrder);
    state.sidebarYearChecked.delete(y);
  } else if (state.sidebarYearChecked.has(y)) {
    state.sidebarYearChecked.delete(y);
  } else {
    state.sidebarYearChecked.add(y);
    if (state.sidebarYearChecked.size >= state.yearOrder.length) {
      state.sidebarYearChecked = new Set(); // all re-selected
    }
  }
  state.sidebarMonthChecked = new Set();
  rebuildSidebarCascade();
}

export function toggleMonthNav(el) {
  const m = el.dataset.m;
  if (state.sidebarMonthChecked.size === 0) {
    // All selected → deselect this one, keep all others
    const avail = _getAvailMonths();
    state.sidebarMonthChecked = new Set(avail);
    state.sidebarMonthChecked.delete(m);
  } else if (state.sidebarMonthChecked.has(m)) {
    state.sidebarMonthChecked.delete(m);
  } else {
    state.sidebarMonthChecked.add(m);
    const avail = _getAvailMonths();
    if (state.sidebarMonthChecked.size >= avail.size) {
      state.sidebarMonthChecked = new Set(); // all re-selected
    }
  }
  state.sidebarWeekChecked = new Set();
  buildMonthNav();
  buildWeekNav();
  applyFilters();
}

function _getAvailMonths() {
  const checkedYears = new Set(state.sidebarYearChecked);
  const filterYear = checkedYears.size > 0;
  const avail = new Set();
  state.allItems.forEach(c => {
    const ym = c.week.match(/(\d+)年(\d+)月/);
    if (!ym) return;
    if (filterYear && !checkedYears.has(ym[1])) return;
    avail.add(ym[2] + '月');
  });
  return avail;
}

export function toggleWeekNav(el) {
  const w = el.dataset.w;
  if (state.sidebarWeekChecked.size === 0) {
    // Currently all selected — switch to only this one
    const availWeeks = _getAvailWeeks();
    state.sidebarWeekChecked = new Set(availWeeks);
    state.sidebarWeekChecked.delete(w);
  } else if (state.sidebarWeekChecked.has(w)) {
    state.sidebarWeekChecked.delete(w);
    if (state.sidebarWeekChecked.size === 0) {
      // All deselected — revert to "all selected"
    }
  } else {
    state.sidebarWeekChecked.add(w);
    const availWeeks = _getAvailWeeks();
    if (state.sidebarWeekChecked.size >= availWeeks.size) {
      state.sidebarWeekChecked = new Set();
    }
  }
  buildWeekNav();
  applyFilters();
}

function _getAvailWeeks() {
  const checkedYears = new Set(state.sidebarYearChecked);
  const filterYear = checkedYears.size > 0;
  const checkedMonths = new Set(state.sidebarMonthChecked);
  const filterMonth = checkedMonths.size > 0;
  const weeks = new Set();
  state.allItems.forEach(c => {
    const m = c.week.match(/(\d+)年(\d+)月第(\d+)周/);
    if (!m) return;
    if (filterYear && !checkedYears.has(m[1])) return;
    if (filterMonth && !checkedMonths.has(m[2] + '月')) return;
    weeks.add(c.week);
  });
  return weeks;
}

export function weekSelAll() {
  state.sidebarWeekChecked = new Set();
  buildWeekNav();
  applyFilters();
}

export function weekSelNone() {
  state.sidebarWeekChecked = _getAvailWeeks();
  // Remove all so nothing is selected
  buildWeekNav();
  applyFilters();
}

export function clearWeekFilter() { weekSelAll(); }

export function toggleCatNav(el) {
  const cn = el.dataset.cat;
  if (state.sidebarCatChecked.has(cn)) {
    if (state.sidebarCatChecked.size <= 1) return;
    state.sidebarCatChecked.delete(cn);
  } else {
    state.sidebarCatChecked.add(cn);
  }
  updateSourceNav();
  buildCatNav();
  applyFilters();
}

export function rebuildSidebarCascade() {
  state.sidebarMonthChecked = new Set();
  state.sidebarWeekChecked = new Set();
  buildYearNav();
  buildMonthNav();
  buildWeekNav();
  updateSourceNav();
  applyFilters();
}

export function rebuildMonthNav() {
  buildMonthNav();
  buildWeekNav();
}

export function monthSelAll() {
  state.sidebarMonthChecked = new Set();
  state.sidebarWeekChecked = new Set();
  buildMonthNav();
  buildWeekNav();
  applyFilters();
}

export function monthSelNone() {
  state.sidebarMonthChecked = _getAvailMonths();
  state.sidebarWeekChecked = new Set();
  buildMonthNav();
  buildWeekNav();
  applyFilters();
}

export function clearMonthFilter() { monthSelAll(); }

export function clearYearFilter() {
  state.sidebarYearChecked = new Set(); // empty = all selected
  state.sidebarMonthChecked = new Set();
  rebuildSidebarCascade();
}

export function yearSelectAll() {
  state.sidebarYearChecked = new Set(); // empty = all selected
  rebuildSidebarCascade();
}

export function yearSelectFirst() {
  state.sidebarYearChecked = new Set([state.yearOrder[0]]);
  rebuildSidebarCascade();
}

// ======== SOURCE/EXT NAV ========
export function updateSourceNav() {
  const show = state.sidebarCatChecked.has('02') || state.sidebarCatChecked.has('03');
  document.getElementById('sourceSection').style.display = show ? '' : 'none';
  const ss = document.getElementById('sourceSel');
  const src = {};
  state.allItems.forEach(c => {
    if ((state.sidebarCatChecked.has('02') && c.cat_num === '02') || (state.sidebarCatChecked.has('03') && c.cat_num === '03')) {
      if (c.source) src[c.source] = (src[c.source] || 0) + 1;
    }
  });
  ss.innerHTML = '<option value="">全部来源</option>';
  Object.entries(src).sort((a, b) => b[1] - a[1]).forEach(([s, n]) => {
    const o = document.createElement('option');
    o.value = s; o.textContent = `${s} (${n})`;
    ss.appendChild(o);
  });
  state.activeSource = '';
}

// ======== CLEAR FILTERS FROM CHIPS ========
export function clearSearch() {
  state.searchQuery = '';
  document.getElementById('searchInput').value = '';
  applyFilters();
}
export function clearSourceFilter() { state.activeSource = ''; document.getElementById('sourceSel').value = ''; applyFilters(); }
export function clearExtFilter() { state.activeExt = ''; document.getElementById('extNav').value = ''; applyFilters(); }

export function clearCatChip(cn) {
  state.sidebarCatChecked.delete(cn);
  if (state.sidebarCatChecked.size === 0) state.sidebarCatChecked = new Set(['01', '02', '03', '04', '05']);
  buildCatNav();
  updateSourceNav();
  applyFilters();
}

// ======== APPLY FILTERS (single traversal) ========
export function applyFilters() {
  const filterCat = state.sidebarCatChecked.size < 5;
  const checkedYears = new Set(state.sidebarYearChecked);
  const filterYear = checkedYears.size > 0 && checkedYears.size < state.yearOrder.length;
  const checkedMonths = new Set(state.sidebarMonthChecked);
  const filterMonth = checkedMonths.size > 0;
  const checkedWeeks = new Set(state.sidebarWeekChecked);
  const filterWeek = checkedWeeks.size > 0;
  const filterSource = !!state.activeSource;
  const filterExt = !!state.activeExt;
  const filterFav = state.showFavOnly;
  const filterSearch = !!state.searchQuery;
  const q = filterSearch ? state.searchQuery.toLowerCase() : '';

  if (!filterCat && !filterYear && !filterMonth && !filterWeek && !filterSource && !filterExt && !filterFav && !filterSearch) {
    // No active filters — fast path
    state.filteredItems = state.allItems.slice();
  } else {
    // Single traversal with all active predicates
    const items = [];
    const src = state.allItems;
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (filterCat && !state.sidebarCatChecked.has(c.cat_num)) continue;
      if (filterYear) {
        const m = c.week.match(/(\d+)年/);
        if (!m || !checkedYears.has(m[1])) continue;
      }
      if (filterMonth) {
        const m = c.week.match(/(\d+)年(\d+)月/);
        if (!m || !checkedMonths.has(m[2] + '月')) continue;
      }
      if (filterWeek && !checkedWeeks.has(c.week)) continue;
      if (filterSource && c.source !== state.activeSource) continue;
      if (filterExt && c.ext !== state.activeExt) continue;
      if (filterFav && !state.favoritesSet.has(c.work_path)) continue;
      if (filterSearch && !c.filename.toLowerCase().includes(q)) continue;
      items.push(c);
    }
    state.filteredItems = items;
  }

  applySort();
  renderActiveFilters();
  updateStats();
  updateStatusBar();
  document.getElementById('tableBody').scrollTop = 0;
  renderTable();
}

export function applySort() {
  state.filteredItems.sort((a, b) => {
    for (let i = 0; i < state.sortCols.length; i++) {
      const s = state.sortCols[i];
      const dir = s.dir === 'asc' ? 1 : -1;
      let va = a[s.col], vb = b[s.col];
      if (s.col === 'size' || s.col === 'pages') {
        va = va || 0; vb = vb || 0;
        const diff = (va - vb) * dir;
        if (diff !== 0) return diff;
        continue;
      }
      if (s.col === 'week') {
        const ma = va.match(/(\d+)年(\d+)月第(\d+)周/), mb = vb.match(/(\d+)年(\d+)月第(\d+)周/);
        if (ma && mb) { const cmp = (ma[1] - mb[1]) || (ma[2] - mb[2]) || (ma[3] - mb[3]); if (cmp !== 0) return cmp * dir; }
      }
      va = (va || '').toString().toLowerCase(); vb = (vb || '').toString().toLowerCase();
      const cmp = va.localeCompare(vb, 'zh'); if (cmp !== 0) return cmp * dir;
    }
    return 0;
  });
}

export function updateStats() {
  document.getElementById('statsText').textContent =
    `显示 ${state.filteredItems.length.toLocaleString()} / ${state.allItems.length.toLocaleString()}`;
}

export function renderActiveFilters() {
  const el = document.getElementById('activeFilters'); let h = '';
  if (state.searchQuery) h += `<span class="chip">搜索: ${esc(state.searchQuery)} <span class="x" onclick="DL.clearSearch()">x</span></span>`;
  if (state.showFavOnly) h += `<span class="chip" style="background:#fef3c7;color:#92400e">仅收藏 <span class="x" onclick="DL.toggleFavFilter()">x</span></span>`;
  if (state.sidebarCatChecked.size < 5) {
    state.sidebarCatChecked.forEach(c => {
      h += `<span class="chip" style="background:${state.CAT_COLORS[c]};color:#fff">${state.CAT_NAMES[c]} <span class="x" onclick="DL.clearCatChip('${c}')">x</span></span>`;
    });
  }
  if (state.sidebarYearChecked.size > 0 && state.sidebarYearChecked.size < state.yearOrder.length) {
    h += `<span class="chip">年份: ${state.sidebarYearChecked.size}/${state.yearOrder.length} <span class="x" onclick="DL.clearYearFilter()">x</span></span>`;
  }
  if (state.sidebarMonthChecked.size > 0) {
    h += `<span class="chip">月份: ${state.sidebarMonthChecked.size}个 <span class="x" onclick="DL.clearMonthFilter()">x</span></span>`;
  }
  if (state.sidebarWeekChecked.size > 0) {
    h += `<span class="chip">周次: ${state.sidebarWeekChecked.size}个 <span class="x" onclick="DL.clearWeekFilter()">x</span></span>`;
  }
  if (state.activeSource) h += `<span class="chip">来源: ${esc(state.activeSource)} <span class="x" onclick="DL.clearSourceFilter()">x</span></span>`;
  if (state.activeExt) h += `<span class="chip">类型: ${state.activeExt} <span class="x" onclick="DL.clearExtFilter()">x</span></span>`;
  el.innerHTML = h; el.classList.toggle('has-chips', h.length > 0);
}
