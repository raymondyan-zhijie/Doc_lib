<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# 当我选择页面上列出的文件，然后打开，或者提取时，打开的提取的是另一个文件。


找到了！这是一个非常经典的 **虚拟滚动 + 引用污染** Bug。

***

## 根本原因：`allItems` 被原地排序破坏

### 问题所在 —— `browser.html` 第 455 行

```javascript
function applyFilters(){
  let items = allItems;  // ← 直接引用，不是副本！
  // 当没有任何过滤条件时，所有 if 分支都不执行
  // items === allItems（同一个内存对象）
  
  filteredItems = items;
  applySort();  // ← 对 filteredItems 原地排序 = 对 allItems 原地排序！
}
```

**排序一发生，`allItems` 的顺序就被永久改变了，但 `wpIdx` 仍然指向旧位置：**

```
初始加载:
  allItems = [fileA(idx=0), fileB(idx=1), fileC(idx=2)]  ← catalog.json 顺序
  wpIdx    = {"pathA": 0,  "pathB": 1,  "pathC": 2}     ← 正确映射

用户按"日期"列排序后:
  allItems = [fileC(date=2026), fileA(date=2025), fileB(date=2024)]  ← 被原地重排了！
  wpIdx    = {"pathA": 0, "pathB": 1, "pathC": 2}  ← 仍是旧位置，已失效！

renderTable() 渲染 filteredItems[0] = fileC, 算出 id = wpIdx["pathC"] = 2
→ 显示 fileC 的数据, data-idx="2"
→ 用户点击打开 → allItems[2] = fileB → 打开了 fileB！❌
```

`mismatch` 检测为何抓不住？因为 `data-wp` 也是通过 `wpIdx` 反查的，两者指向同一个错误对象，完全"一致"。

***

## 修复方法

### 修复 1（核心）：`browser.html` — 一行修复

在 `applyFilters` 函数中，确保永远使用 `allItems` 的副本：

```javascript
// ❌ 原来（第 455 行）
let items = allItems;

// ✅ 修复 — 始终创建浅拷贝，防止 allItems 被原地排序污染
let items = allItems.slice();
```

这样 `applySort()` 只排序副本，`allItems` 的原始顺序保持不变，`wpIdx` 永远有效。

### 修复 2（防御加固）：`browser.html` — `init()` 中给每个 item 打上稳定 ID

即使以后有人再触碰 `allItems` 顺序，也能保证正确：

```javascript
// 原来（第 397 行）
allItems.forEach((c,i) => wpIdx[c.work_path]=i);

// 修复 — 顺便在 item 上存储其稳定 index
allItems.forEach((c,i) => { c._idx = i; wpIdx[c.work_path] = i; });
```

然后在 `renderTable()` 第 521 行：

```javascript
// ❌ 原来
const c=filteredItems[i], id=wpIdx[c.work_path], ...

// ✅ 修复 — 直接用 item 自身携带的 _idx，不再经过 wpIdx 中转
const c=filteredItems[i], id=c._idx, ...
```


***

## 其他需要修复的问题

### Bug 3：`index_service.py` — FTS 搜索 rowid 与 catalog 脱节

```python
# build_full_index() 时 rowid = i+1 对应 catalog[i]
# 但后来 upload 添加新条目后，catalog 变长
# _get_catalog() 按 mtime 重载新 catalog
# 旧 rowid 仍指向旧位置 → 搜索返回错误文件！

def search(query, limit=50):
    rows = conn.execute("SELECT rowid FROM fts_index ...").fetchall()
    catalog = _get_catalog()  # 可能是新 catalog，rowid 已失效！
    for row in rows:
        rid = row[0]
        results.append(catalog[rid - 1])  # ← 可能拿到错误条目
```

**修复**：上传新数据（`/api/upload`）后，强制触发 `rebuild_index()`，确保 FTS rowid 始终与当前 catalog 对齐：

```python
# api.py upload 接口最后加上
index_service.build_full_index()
```


### Bug 4：`_scan_work_week` — 路径分隔符重复写入

```python
# 如果旧 catalog.json 中 work_path 含反斜杠 "2026年\01_重点\file.pdf"
# 新扫描产生正斜杠 "2026年/01_重点/file.pdf"
# existing_keys 查不到匹配 → 同一文件被重复写入两条记录！

existing_keys = {item["work_path"] for item in existing}
rel_path = os.path.relpath(...).replace("\\", "/")
if rel_path in existing_keys:  # ← 反斜杠路径永远不会匹配
    continue
```

**修复**：构建 `existing_keys` 时同步标准化：

```python
existing_keys = {item["work_path"].replace("\\", "/") for item in existing}
```


### Bug 5：`config.py` — 模块级调用崩溃服务

```python
# 当前：7-Zip 未安装时服务器整体崩溃，无法浏览文档
SEVEN_ZIP = find_7z()   # ← 模块导入即执行！

# 修复：改为懒加载
_seven_zip = None
def get_7z():
    global _seven_zip
    if _seven_zip is None:
        _seven_zip = find_7z()
    return _seven_zip
```


***

## 各 Bug 影响汇总

| Bug | 影响 | 严重程度 |
| :-- | :-- | :-- |
| `allItems.slice()` 缺失 | **打开/提取错误文件** | 🔴 严重 |
| FTS rowid 漂移 | 全文搜索返回错误结果 | 🟠 中 |
| 路径分隔符重复写入 | catalog 有重复条目，加重 Bug 1 | 🟠 中 |
| 7-Zip 启动崩溃 | 无 7-Zip 时整个服务无法启动 | 🟡 低 |

**最紧要的一步：把 `browser.html` 第 455 行的 `let items=allItems` 改为 `let items=allItems.slice()`，即可修复你报告的核心问题。**

