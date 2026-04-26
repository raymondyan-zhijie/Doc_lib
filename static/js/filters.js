/* ============================================================
   filters.js — Cascading sidebar filters + applyFilters
   ============================================================ */

// Sidebar state
let sidebarYearChecked = new Set(yearOrder);
let sidebarMonthChecked = new Set(monthOrder);
let sidebarCatChecked = new Set(['01','02','03','04','05']);

function getCheckedYears(){
  return sidebarYearChecked;
}
function getCheckedMonths(){
  return sidebarMonthChecked;
}

// ======== SIDEBAR BUILD ========
function buildSidebar(){
  buildYearNav();
  buildMonthNav();
  buildCatNav();
  buildExtNav();
}

function buildYearNav(){
  const el=document.getElementById('yearNav');
  let h='';
  yearOrder.forEach(y=>{
    const cnt=allItems.filter(c=>c.week.startsWith(y+'年')).length;
    const checked=sidebarYearChecked.has(y);
    h+=`<div class="nav-item${checked?' selected':''}" data-y="${y}" onclick="toggleYearNav(this)">
      <input type="checkbox" ${checked?'checked':''} tabindex="-1" />
      <span class="nav-label">${y}年</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  });
  el.innerHTML=h;
}

function buildMonthNav(){
  const el=document.getElementById('monthNav');
  const checkedYears=getCheckedYears();
  const availMons=new Set();
  allItems.forEach(c=>{
    const ym=c.week.match(/(\d+)年(\d+)月/);
    if(ym&&checkedYears.has(ym[1])) availMons.add(ym[2]+'月');
  });
  let h='';
  monthOrder.forEach(m=>{
    const avail=availMons.has(m);
    const cnt=avail?allItems.filter(c=>{const ym=c.week.match(/(\d+)年(\d+)月/);return ym&&checkedYears.has(ym[1])&&(ym[2]+'月')===m;}).length:0;
    if(!avail) return; // Don't show unavailable months
    const checked=sidebarMonthChecked.has(m) || sidebarMonthChecked.size===0;
    h+=`<div class="nav-item${checked?' selected':''}" data-m="${m}" onclick="toggleMonthNav(this)">
      <input type="checkbox" ${checked?'checked':''} tabindex="-1" />
      <span class="nav-label">${m}</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  });
  el.innerHTML=h;
}

function buildCatNav(){
  const el=document.getElementById('catNav');
  let h='';
  for(const [cn, cname] of Object.entries(CAT_NAMES)){
    const cnt=allItems.filter(c=>c.cat_num===cn).length;
    const checked=sidebarCatChecked.has(cn);
    h+=`<div class="nav-item${checked?' selected':''}" data-cat="${cn}" onclick="toggleCatNav(this)">
      <span class="cat-dot c${cn}"></span>
      <span class="nav-label">${cname}</span>
      <span class="nav-count">${cnt.toLocaleString()}</span>
    </div>`;
  }
  el.innerHTML=h;
}

function buildExtNav(){
  const el=document.getElementById('extNav');
  const exts={};
  allItems.forEach(c=>{exts[c.ext]=(exts[c.ext]||0)+1;});
  el.innerHTML='<option value="">全部</option>';
  const frag=document.createDocumentFragment();
  Object.entries(exts).sort((a,b)=>b[1]-a[1]).forEach(([e,n])=>{
    const o=document.createElement('option');
    o.value=e; o.textContent=`${e} (${n})`;
    frag.appendChild(o);
  });
  el.appendChild(frag);
}

// ======== SIDEBAR TOGGLES ========
function toggleYearNav(el){
  const y=el.dataset.y;
  if(sidebarYearChecked.has(y)){
    if(sidebarYearChecked.size<=1) return; // Must keep at least 1
    sidebarYearChecked.delete(y);
  } else {
    sidebarYearChecked.add(y);
  }
  // Reset month selection to all available
  sidebarMonthChecked = new Set(); // empty set = "all"
  rebuildSidebarCascade();
}

function toggleMonthNav(el){
  const m=el.dataset.m;
  if(sidebarMonthChecked.has(m)){
    sidebarMonthChecked.delete(m);
  } else {
    sidebarMonthChecked.add(m);
  }
  // If all available months checked, treat as "all" (clear set)
  const checkedYears=getCheckedYears();
  const totalAvail=new Set();
  allItems.forEach(c=>{
    const ym=c.week.match(/(\d+)年(\d+)月/);
    if(ym&&checkedYears.has(ym[1])) totalAvail.add(ym[2]+'月');
  });
  if(sidebarMonthChecked.size >= totalAvail.size){
    sidebarMonthChecked = new Set();
  }
  rebuildMonthNav();
  applyFilters();
}

function toggleCatNav(el){
  const cn=el.dataset.cat;
  if(sidebarCatChecked.has(cn)){
    if(sidebarCatChecked.size<=1) return;
    sidebarCatChecked.delete(cn);
  } else {
    sidebarCatChecked.add(cn);
  }
  // Update source dropdown visibility
  updateSourceNav();
  buildCatNav();
  applyFilters();
}

function rebuildSidebarCascade(){
  sidebarMonthChecked = new Set(); // Reset to "all available"
  buildMonthNav();
  updateSourceNav();
  applyFilters();
}

function rebuildMonthNav(){ buildMonthNav(); }

function monthSelAll(){
  sidebarMonthChecked = new Set();
  rebuildMonthNav();
  applyFilters();
}

function monthSelNone(){
  const checkedYears=getCheckedYears();
  const availMons=new Set();
  allItems.forEach(c=>{
    const ym=c.week.match(/(\d+)年(\d+)月/);
    if(ym&&checkedYears.has(ym[1])) availMons.add(ym[2]+'月');
  });
  sidebarMonthChecked = new Set(availMons); // All = deselected (inverted logic)
  rebuildMonthNav();
  applyFilters();
}

function clearMonthFilter(){ monthSelAll(); }
function clearYearFilter(){
  sidebarYearChecked = new Set(yearOrder);
  sidebarMonthChecked = new Set();
  rebuildSidebarCascade();
}

// ======== SOURCE/EXT NAV ========
function updateSourceNav(){
  const show=sidebarCatChecked.has('02')||sidebarCatChecked.has('03');
  document.getElementById('sourceSection').style.display=show?'':'none';
  const ss=document.getElementById('sourceSel');
  const src={};
  allItems.forEach(c=>{
    if((sidebarCatChecked.has('02')&&c.cat_num==='02')||(sidebarCatChecked.has('03')&&c.cat_num==='03')){
      if(c.source)src[c.source]=(src[c.source]||0)+1;
    }
  });
  ss.innerHTML='<option value="">全部来源</option>';
  Object.entries(src).sort((a,b)=>b[1]-a[1]).forEach(([s,n])=>{
    const o=document.createElement('option');
    o.value=s; o.textContent=`${s} (${n})`;
    ss.appendChild(o);
  });
  activeSource='';
}

// ======== APPLY FILTERS ========
function applyFilters(){
  let items=allItems.slice();

  // Category
  if(sidebarCatChecked.size<5){
    items=items.filter(c=>sidebarCatChecked.has(c.cat_num));
  }

  // Year
  const checkedYears=getCheckedYears();
  if(checkedYears.size===0) items=[];
  else if(checkedYears.size<yearOrder.length){
    items=items.filter(c=>{const m=c.week.match(/(\d+)年/);return m&&checkedYears.has(m[1]);});
  }

  // Month
  const checkedMonths=getCheckedMonths();
  if(checkedMonths.size>0){
    // Non-empty set = partial selection, filter to those months
    items=items.filter(c=>{
      const m=c.week.match(/(\d+)年(\d+)月/);
      return m&&checkedMonths.has(m[2]+'月');
    });
  }
  // Empty set = all available months (no filtering)

  // Source
  if(activeSource) items=items.filter(c=>c.source===activeSource);

  // Extension
  if(activeExt) items=items.filter(c=>c.ext===activeExt);

  // Favorite only
  if(showFavOnly) items=items.filter(c=>favoritesSet.has(c.work_path));

  // Search
  if(searchQuery){
    const q=searchQuery.toLowerCase();
    items=items.filter(c=>c.filename.toLowerCase().includes(q));
  }

  filteredItems=items;
  applySort();
  renderActiveFilters();
  updateStats();
  updateStatusBar();
  document.getElementById('tableBody').scrollTop=0;
  renderTable();
}

function applySort(){
  filteredItems.sort((a,b)=>{
    for(let i=0;i<sortCols.length;i++){
      const s=sortCols[i];
      const dir=s.dir==='asc'?1:-1;
      let va=a[s.col],vb=b[s.col];
      if(s.col==='size'||s.col==='pages'){
        va=va||0;vb=vb||0;
        const diff=(va-vb)*dir;
        if(diff!==0)return diff;
        continue;
      }
      if(s.col==='week'){
        const ma=va.match(/(\d+)年(\d+)月第(\d+)周/),mb=vb.match(/(\d+)年(\d+)月第(\d+)周/);
        if(ma&&mb){const cmp=(ma[1]-mb[1])||(ma[2]-mb[2])||(ma[3]-mb[3]);if(cmp!==0)return cmp*dir;}
      }
      va=(va||'').toString().toLowerCase();vb=(vb||'').toString().toLowerCase();
      const cmp=va.localeCompare(vb,'zh');if(cmp!==0)return cmp*dir;
    }
    return 0;
  });
}

function updateStats(){
  document.getElementById('statsText').textContent=
    `显示 ${filteredItems.length.toLocaleString()} / ${allItems.length.toLocaleString()}`;
}

function renderActiveFilters(){
  const el=document.getElementById('activeFilters');let h='';
  if(searchQuery) h+=`<span class="chip">搜索: ${esc(searchQuery)} <span class="x" onclick="clearSearch()">x</span></span>`;
  if(showFavOnly) h+=`<span class="chip" style="background:#fef3c7;color:#92400e">仅收藏 <span class="x" onclick="toggleFavFilter()">x</span></span>`;
  if(sidebarCatChecked.size<5){
    sidebarCatChecked.forEach(c=>{
      h+=`<span class="chip" style="background:${CAT_COLORS[c]};color:#fff">${CAT_NAMES[c]} <span class="x" onclick="clearCatChip('${c}')">x</span></span>`;
    });
  }
  if(sidebarYearChecked.size>0 && sidebarYearChecked.size<yearOrder.length){
    h+=`<span class="chip">年份: ${sidebarYearChecked.size}/${yearOrder.length} <span class="x" onclick="clearYearFilter()">x</span></span>`;
  }
  if(sidebarMonthChecked.size>0){
    h+=`<span class="chip">月份: ${sidebarMonthChecked.size}个 <span class="x" onclick="clearMonthFilter()">x</span></span>`;
  }
  if(activeSource) h+=`<span class="chip">来源: ${esc(activeSource)} <span class="x" onclick="clearSourceFilter()">x</span></span>`;
  if(activeExt) h+=`<span class="chip">类型: ${activeExt} <span class="x" onclick="clearExtFilter()">x</span></span>`;
  el.innerHTML=h; el.classList.toggle('has-chips',h.length>0);
}

function clearSearch(){
  searchQuery='';
  document.getElementById('searchInput').value='';
  applyFilters();
}
function clearSourceFilter(){activeSource='';document.getElementById('sourceSel').value='';applyFilters();}
function clearExtFilter(){activeExt='';document.getElementById('extSel').value='';applyFilters();}
function clearCatChip(cn){
  sidebarCatChecked.delete(cn);
  if(sidebarCatChecked.size===0) sidebarCatChecked = new Set(['01','02','03','04','05']);
  buildCatNav();
  updateSourceNav();
  applyFilters();
}
