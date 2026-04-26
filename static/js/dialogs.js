/* ============================================================
   dialogs.js — Detail panel, dialogs, preview, delete, recycle (ES module)
   ============================================================ */

import { state } from './state.js';
import { esc, fmtSize, showToast, resolveItem, getExtractDir } from './utils.js';
import { applyFilters } from './filters.js';
import { closeUploadDialog } from './upload.js';

// ======== PREVIEW ========
export function previewFile(el) {
  const c = resolveItem(el); if (!c) return;
  window.open('/api/preview?work_path=' + encodeURIComponent(c.work_path), '_blank', 'noopener');
}

// ======== EXTRACT ========
export function extractFile(el) {
  const c = resolveItem(el); if (!c) return;
  const td = getExtractDir();
  showToast('提取: ' + c.filename + ' → ' + td);
  fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token }, body: JSON.stringify({ work_path: c.work_path, target_dir: td }) })
    .then(r => r.json()).then(d => { if (d.error) showToast(d.error, true); else showToast('已提取: ' + d.filename); })
    .catch(e => showToast(e.message, true));
}

// ======== DELETE / RECYCLE ========
export function confirmDelete(el) {
  const c = resolveItem(el); if (!c) return;
  showDeleteDialog([c]);
}

export function showDeleteDialog(items) {
  const dlg = document.getElementById('deleteDialog');
  document.getElementById('deleteFileList').innerHTML = items.map(c =>
    `<div>${esc(c.filename)} <span style="color:var(--text2)">(${fmtSize(c.size)})</span></div>`
  ).join('');
  document.getElementById('deleteCount').textContent = items.length;
  dlg.classList.add('visible');
  dlg._deleteItems = items;
}

export function closeDeleteDialog() {
  document.getElementById('deleteDialog').classList.remove('visible');
}

// ======== BATCH RECYCLE ========
export function batchRecycle() {
  const items = [...state.selectedIds].map(wp => state.itemByPath.get(wp)).filter(Boolean);
  if (!items.length) return;
  state._deleteUseBatch = true;
  showDeleteDialog(items);
}

export async function confirmDeleteAction() {
  const dlg = document.getElementById('deleteDialog');
  const items = dlg._deleteItems || [];
  if (!items.length) return;
  const useBatch = state._deleteUseBatch || (items.length > 1);
  state._deleteUseBatch = false;
  dlg.classList.remove('visible');

  const wpList = items.map(c => c.work_path);
  showToast('正在回收 ' + items.length + ' 个文件...');

  try {
    if (useBatch || items.length > 1) {
      const r = await fetch('/api/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token },
        body: JSON.stringify({ items: items.map(c => ({ work_path: c.work_path })) })
      });
      const d = await r.json();
      d.recycled.forEach(wp => {
        state.itemByPath.delete(wp);
        state.selectedIds.delete(wp);
        state.favoritesSet.delete(wp);
      });
      state.allItems = state.allItems.filter(it => !d.recycled.includes(it.work_path));
      if (d.recycled.includes(state.activeDetailPath)) closeDetail();
      applyFilters();
      showToast('已移至回收站: ' + d.recycled + ' 个' + (d.errors.length ? ', ' + d.errors.length + ' 个失败' : ''));
    } else {
      const r = await fetch('/api/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token },
        body: JSON.stringify({ work_path: wpList[0] })
      });
      if (!r.ok) { const d = await r.json(); showToast(d.detail || '回收失败', true); return; }
      const c = items[0];
      state.itemByPath.delete(c.work_path);
      state.selectedIds.delete(c.work_path);
      state.favoritesSet.delete(c.work_path);
      state.allItems = state.allItems.filter(it => it.work_path !== c.work_path);
      if (state.activeDetailPath === c.work_path) closeDetail();
      applyFilters();
      showToast('已移至回收站: ' + c.filename);
    }
  } catch (e) { showToast(e.message, true); }
}

// ======== DETAIL PANEL ========
export function showDetail(wp) {
  const c = state.itemByPath.get(wp); if (!c) return;
  if (state.activeDetailPath) {
    const prev = document.querySelector(`.table-row[data-wp="${esc(state.activeDetailPath)}"]`);
    if (prev) prev.classList.remove('active-detail');
  }
  state.activeDetailPath = wp;
  const row = document.querySelector(`.table-row[data-wp="${esc(wp)}"]`);
  if (row) row.classList.add('active-detail');

  const fav = state.favoritesSet.has(wp);
  document.getElementById('detailTitle').textContent = c.filename;
  let h = '';
  [['周次', c.week], ['分类', state.CAT_NAMES[c.cat_num]], ['来源', c.source || '--'],
   ['语言', c.lang], ['页数', c.pages ? c.pages + ' 页' : '--'],
   ['大小', fmtSize(c.size)], ['日期', c.date], ['类型', c.ext.replace('.', '').toUpperCase()],
   ['路径', c.work_path]
  ].forEach(([l, v]) => {
    h += `<div class="field"><div class="label">${l}</div><div class="value">${esc(String(v))}</div></div>`;
  });
  h += `<div class="panel-actions">
    <button class="btn-sm btn-open" style="font-size:13px;padding:6px 14px" data-wp="${esc(wp)}" onclick="DL.previewFile(this)">预览</button>
    <button class="btn-sm btn-extract" style="font-size:13px;padding:6px 14px" data-wp="${esc(wp)}" onclick="DL.openFile(this)">系统打开</button>
    <button class="btn-sm btn-extract" style="font-size:13px;padding:6px 14px" data-wp="${esc(wp)}" onclick="DL.extractFile(this)">提取</button>
    <button class="btn-sm" style="font-size:13px;padding:6px 14px;background:var(--badge-bg);color:var(--text);border:1px solid var(--border)" onclick="DL.toggleFav('${esc(wp)}');DL.showDetail('${esc(wp)}')">${fav ? '取消收藏' : '收藏'}</button>
    <button class="btn-sm btn-danger" style="font-size:13px;padding:6px 14px" data-wp="${esc(wp)}" onclick="DL.confirmDelete(this)">回收</button>
  </div>`;
  document.getElementById('detailContent').innerHTML = h;
  document.getElementById('detailPanel').classList.add('visible');
  document.getElementById('detailOverlay').classList.add('visible');
}

export function closeDetail() {
  if (state.activeDetailPath) {
    const row = document.querySelector(`.table-row[data-wp="${esc(state.activeDetailPath)}"]`);
    if (row) row.classList.remove('active-detail');
    state.activeDetailPath = null;
  }
  document.getElementById('detailPanel').classList.remove('visible');
  document.getElementById('detailOverlay').classList.remove('visible');
}

export async function openFile(el) {
  const c = resolveItem(el); if (!c) return;
  showToast('打开: ' + c.filename);
  try {
    const r = await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token }, body: JSON.stringify({ work_path: c.work_path }) });
    const d = await r.json(); if (d.error) showToast(d.error, true);
  } catch (e) { showToast(e.message, true); }
}

// ======== BATCH EXTRACT DIALOG ========
export function showBatchDialog() {
  const items = [...state.selectedIds].map(wp => state.itemByPath.get(wp)).filter(Boolean);
  if (!items.length) return;
  document.getElementById('batchFileList').innerHTML = items.map(c =>
    `<div>${esc(c.filename)} <span style="color:var(--text2)">(${fmtSize(c.size)})</span></div>`
  ).join('');
  const dir = getExtractDir();
  document.getElementById('batchTargetDir').value = dir;
  updateBatchActualDir();
  document.getElementById('batchProgress').style.display = 'none';
  document.getElementById('batchStartBtn').disabled = false;
  document.getElementById('batchDialog').classList.add('visible');
}

export function setBatchDir(v) { document.getElementById('batchTargetDir').value = v; updateBatchActualDir(); }

export function updateBatchActualDir() {
  const td = document.getElementById('batchTargetDir').value.trim();
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
  const sep = state._platform === 'Windows' ? '\\' : '/';
  document.getElementById('batchActualDir').textContent = td + sep + ts;
}

export function closeBatchDialog() { document.getElementById('batchDialog').classList.remove('visible'); }

export async function startBatchExtract() {
  const items = [...state.selectedIds].map(wp => state.itemByPath.get(wp)).filter(Boolean);
  const td = document.getElementById('batchTargetDir').value.trim();
  if (!td) { showToast('请输入目标目录', true); return; }
  document.getElementById('batchStartBtn').disabled = true;
  document.getElementById('batchProgress').style.display = 'block';
  try {
    const r = await fetch('/api/batch-extract', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token },
      body: JSON.stringify({ items: items.map(c => ({ work_path: c.work_path })), target_dir: td })
    });
    const d = await r.json(); if (d.error) { showToast(d.error, true); return; }
    const tid = d.task_id;
    const poll = async () => {
      const pr = await fetch(`/api/batch-progress?task_id=${tid}`);
      const p = await pr.json();
      const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
      document.getElementById('batchProgressFill').style.width = pct + '%';
      document.getElementById('batchProgressText').textContent = `${p.done}/${p.total} (${pct}%)` + (p.errors?.length ? ` | ${p.errors.length} 错误` : '');
      if (p.status === 'done') { showToast(`提取完成! ${p.done} 文件 → ${p.batch_dir || td}`); closeBatchDialog(); }
      else setTimeout(poll, 500);
    };
    setTimeout(poll, 500);
  } catch (e) { showToast(e.message, true); document.getElementById('batchStartBtn').disabled = false; }
}

// ======== HISTORY ========
export async function showHistory() {
  try {
    const r = await fetch('/api/history?limit=50'); const data = await r.json();
    let h = '';
    if (data.length === 0) h = '<div style="color:var(--text2);font-size:13px;padding:20px">暂无浏览记录</div>';
    else data.forEach(item => {
      h += `<div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:13px;cursor:pointer" data-wp="${esc(item.work_path)}" class="history-item">
        <div style="font-weight:500">${esc(item.filename)}</div>
        <div style="color:var(--text2);font-size:11px">${item.opened_at || ''}</div>
      </div>`;
    });
    document.getElementById('historyContent').innerHTML = h;
    document.getElementById('historyContent').querySelectorAll('.history-item').forEach(el => {
      el.addEventListener('click', () => { closeHistory(); showDetail(el.dataset.wp); });
    });
    document.getElementById('historyPanel').classList.add('visible');
    document.getElementById('historyOverlay').classList.add('visible');
  } catch (e) { showToast(e.message, true); }
}

export function closeHistory() {
  document.getElementById('historyPanel').classList.remove('visible');
  document.getElementById('historyOverlay').classList.remove('visible');
}

// ======== STATS ========
export async function showStats() {
  try {
    const [srcR, wkR] = await Promise.all([fetch('/api/stats/sources'), fetch('/api/stats/weekly')]);
    const srcData = await srcR.json(), wkData = await wkR.json();
    let h = '';
    if (srcData.sources?.length) {
      h += '<div class="stats-chart"><h3>报告数量 Top 20 来源</h3>';
      const top20 = srcData.sources.slice(0, 20);
      const maxVal = top20[0]?.count || 1;
      top20.forEach(s => {
        const pct = Math.round(s.count / maxVal * 100);
        const color = state.CAT_COLORS[s.cat_num] || 'var(--accent)';
        h += `<div class="bar-row"><span class="bar-label" title="${esc(s.source)}">${esc(s.source)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div><span class="bar-value">${s.count}</span></div></div>`;
      });
      h += '</div>';
    }
    if (wkData.weekly?.length) {
      h += '<div class="stats-chart"><h3>每周报告数量趋势</h3>';
      const weekTotals = {};
      wkData.weekly.forEach(w => { weekTotals[w.week] = (weekTotals[w.week] || 0) + w.count; });
      const maxW = Math.max(...Object.values(weekTotals), 1);
      Object.entries(weekTotals).forEach(([week, cnt]) => {
        const pct = Math.round(cnt / maxW * 100);
        h += `<div class="bar-row"><span class="bar-label">${week.replace(/^\d+年/, '')}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--accent)"></div><span class="bar-value">${cnt}</span></div></div>`;
      });
      h += '</div>';
    }
    document.getElementById('statsContent').innerHTML = h;
    document.getElementById('statsPanel').classList.add('visible');
    document.getElementById('statsOverlay').classList.add('visible');
  } catch (e) { showToast(e.message, true); }
}

export function closeStats() {
  document.getElementById('statsPanel').classList.remove('visible');
  document.getElementById('statsOverlay').classList.remove('visible');
}

// ======== EXTRACT DIR TOGGLE ========
export function toggleExtractDir() {
  const row = document.getElementById('extractDirRow');
  const show = row.style.display === 'none';
  row.style.display = show ? 'flex' : 'none';
  if (show) {
    document.getElementById('extractDirInput').value = getExtractDir();
    document.getElementById('extractDirInput').focus();
  }
}

export function openExtractDir() {
  const d = getExtractDir();
  fetch('/api/open-dir', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-DocLib-Token': state.token }, body: JSON.stringify({ path: d }) }).catch(() => {});
  showToast('提取目录: ' + d);
}

// ======== CLOSE ALL ========
export function closeAllPanels() {
  closeDetail(); closeStats(); closeHistory();
  closeBatchDialog(); closeDeleteDialog();
  try { closeUploadDialog(); } catch (e) { }
}
