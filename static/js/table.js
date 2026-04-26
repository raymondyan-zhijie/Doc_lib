/* ============================================================
   table.js — Virtual scrolling table, column resize, selection (ES module)
   ============================================================ */

import { state } from './state.js';
import { esc, fmtSize } from './utils.js';
import { showDetail } from './dialogs.js';

export function renderTable() {
  const body = document.getElementById('tableBody'),
        spacer = document.getElementById('tableSpacer'),
        rows = document.getElementById('tableRows');

  if (state.filteredItems.length === 0) {
    spacer.style.height = '0';
    rows.style.transform = 'translateY(0)';
    rows.innerHTML = '<div class="empty-state">无匹配结果，请调整筛选条件</div>';
    return;
  }

  spacer.style.height = state.filteredItems.length * state.ROW_H + 'px';

  const top = body.scrollTop, viewH = body.clientHeight;
  let start = Math.max(0, Math.floor(top / state.ROW_H) - state.BUFFER),
      end = Math.min(state.filteredItems.length, Math.ceil((top + viewH) / state.ROW_H) + state.BUFFER);

  rows.style.transform = `translateY(${start * state.ROW_H}px)`;

  let html = '';
  for (let i = start; i < end; i++) {
    const c = state.filteredItems[i], wp = c.work_path,
          sel = state.selectedIds.has(wp),
          fav = state.favoritesSet.has(wp),
          act = wp === state.activeDetailPath;
    const ec = c.ext === '.pdf' ? 'ext-badge' : 'ext-badge non-pdf';

    html += `<div class="table-row${sel ? ' selected' : ''}${act ? ' active-detail' : ''}" data-wp="${esc(wp)}">
      <div class="cell"><input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation();DL.toggleSel('${esc(wp)}')" /></div>
      <div class="cell cat"><span class="cat-tag" data-cat="${c.cat_num}">${state.CAT_NAMES[c.cat_num]}</span></div>
      <div class="cell source">${esc(c.source || '--')}</div>
      <div class="cell filename" title="${esc(c.filename)}">${esc(c.filename)}</div>
      <div class="cell pages">${c.pages || '--'}</div>
      <div class="cell size">${fmtSize(c.size)}</div>
      <div class="cell date">${c.date}</div>
      <div class="cell"><span class="${ec}">${c.ext.replace('.', '')}</span></div>
      <div class="cell actions">
        <button class="btn-fav${fav ? ' is-fav' : ''}" onclick="event.stopPropagation();DL.toggleFav('${esc(wp)}')" title="收藏">${fav ? '★' : '☆'}</button>
        <button class="btn-sm btn-open" data-wp="${esc(wp)}" onclick="event.stopPropagation();DL.previewFile(this)" title="在浏览器中预览">预览</button>
        <button class="btn-sm btn-extract" data-wp="${esc(wp)}" onclick="event.stopPropagation();DL.extractFile(this)" title="复制到提取目录">提取</button>
        <button class="btn-sm btn-danger" data-wp="${esc(wp)}" onclick="event.stopPropagation();DL.confirmDelete(this)" title="移至回收站">回收</button>
      </div>
    </div>`;
  }

  rows.innerHTML = html;

  rows.querySelectorAll('.table-row').forEach(r => {
    r.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      showDetail(r.dataset.wp);
    });
  });

  document.querySelectorAll('#tableHeader .col[data-sort]').forEach(col => {
    const arrow = col.querySelector('.arrow');
    if (!arrow) return;
    const first = state.sortCols.find(s => s.col === col.dataset.sort);
    arrow.textContent = first ? (first.dir === 'asc' ? ' ▲' : ' ▼') : '';
  });
}

export function onScroll() {
  if (state.rafId) cancelAnimationFrame(state.rafId);
  state.rafId = requestAnimationFrame(renderTable);
}

// ======== COLUMN RESIZE ========
export function initColumnResize() {
  const header = document.getElementById('tableHeader');
  const wrap = document.querySelector('.table-wrap');
  const cols = header.querySelectorAll('.col');
  let resizing = null, startX = 0, startW = 0;

  cols.forEach((col, i) => {
    if (i === cols.length - 1) return;
    const r = document.createElement('div'); r.className = 'col-resizer';
    r.addEventListener('mousedown', e => {
      e.preventDefault(); e.stopPropagation();
      resizing = { col, i, startX: e.clientX, startW: col.getBoundingClientRect().width };
      r.classList.add('active');
      document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
    });
    col.appendChild(r);
  });

  document.addEventListener('mousemove', e => {
    if (!resizing) return;
    const diff = e.clientX - resizing.startX;
    const newW = Math.max(30, resizing.startW + diff);
    const template = getComputedStyle(header).gridTemplateColumns.split(' ');
    template[resizing.i] = newW + 'px';
    wrap.style.setProperty('--table-cols', template.join(' '));
  });

  document.addEventListener('mouseup', () => {
    if (resizing) { document.body.style.cursor = ''; document.body.style.userSelect = ''; }
    resizing = null;
    document.querySelectorAll('.col-resizer.active').forEach(r => r.classList.remove('active'));
  });
}

// ======== SELECTION ========
export function toggleSel(wp) {
  state.selectedIds.has(wp) ? state.selectedIds.delete(wp) : state.selectedIds.add(wp);
  updateSelection();
  renderTable();
}

export function updateSelection() {
  const cnt = state.selectedIds.size;
  document.getElementById('selCount').textContent = cnt > 0 ? `已选 ${cnt} 项` : '';
  document.getElementById('selCount').classList.toggle('hidden', cnt === 0);
  const ts = [...state.selectedIds].reduce((s, wp) => { const c = state.itemByPath.get(wp); return s + (c ? c.size : 0); }, 0);
  document.getElementById('selSize').textContent = cnt > 0 ? `(${fmtSize(ts)})` : '';
  document.getElementById('selSize').classList.toggle('hidden', cnt === 0);
  document.getElementById('batchBtn').disabled = cnt === 0;
  document.getElementById('batchDelBtn').disabled = cnt === 0;
  document.getElementById('selectAll').checked = cnt > 0 && cnt === state.filteredItems.length && state.filteredItems.length > 0;
  document.getElementById('clearSelBtn').style.display = cnt > 0 ? '' : 'none';
}

export function updateStatusBar() {
  document.getElementById('totalCount').textContent = state.allItems.length.toLocaleString() + ' 项';
  document.getElementById('filteredCount').textContent = state.filteredItems.length.toLocaleString() + ' 项';
}
