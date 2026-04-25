<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# [https://github.com/raymondyan-zhijie/Doc_lib](https://github.com/raymondyan-zhijie/Doc_lib) 这个项目在运行的时候，页面上显示的文件和提取的文件不一致，我截图了，你帮我检查一下。顺便帮我看看这个项目有没有什么问题需要纠正，改进

根据截图和完整代码审查，我发现了以下几个问题：

***

## 截图所示的核心 Bug

截图清晰显示了问题所在：

- **左侧列表**：蓝色高亮行是 `2025年年度回顾（英）-37页.pdf`（复选框已勾选）
- **右侧详情面板**：显示的却是 `人类优势：人工智能时代更强大脑（英）-33页.pdf`（1月第1周）

**根本原因**：`browser.html` 中 `selected`（蓝色高亮）状态和详情面板是完全独立的两套逻辑 ：[^1]

- 蓝色高亮 = `selectedIds`（复选框勾选，用于批量提取）
- 详情面板 = 上一次点击行触发的 `showDetail(idx)`

两者视觉上用同一种蓝色 `--row-selected` 背景表示，导致用户误认为高亮行就是详情面板对应的文件。当用户在详情面板点击「提取」按钮时，实际提取的是**面板里的文件**（人类优势），而不是**视觉高亮的文件**（年度回顾）。

**修复方案**：点击行打开详情面板时，用不同的 CSS 类（如 `active-detail`，左侧加彩色边框）区分「详情激活」与「批量选中」这两种状态，避免视觉混淆。

***

## 其他需要修复的 Bug

### Bug 1：`config.py` 模块级调用 `find_7z()`

```python
# 当前代码 —— 模块导入时立即执行
SEVEN_ZIP = find_7z()
```

7-Zip 未安装时，**整个服务器启动即崩溃**，即使用户只想浏览目录、不做任何解压操作。应改为懒加载，仅在真正需要解压时才查找 7-Zip。

### Bug 2：`open_dir` 接口仅支持 Windows

```python
@router.get("/open-dir")
async def open_dir(path: str = Query(...)):
    os.startfile(os.path.normpath(path))  # Windows only！
```

`os.startfile` 在 macOS/Linux 上会抛出 `AttributeError`。应复用 `config.py` 中已有的跨平台函数 `open_file_external()`。

### Bug 3：`previewPDF` 发出冗余请求

```javascript
// 当前代码：fetch() 仅为了拿到 URL，却把整个文件下载了一遍
const r = await fetch('/api/file?work_path=' + encodeURIComponent(c.work_path));
window.open(r.url, '_blank');
```

`r.url` 就是请求本身的 URL，这个 `fetch()` 完全多余，还会白白下载文件内容。正确写法：

```javascript
window.open('/api/file?work_path=' + encodeURIComponent(c.work_path), '_blank');
```


### Bug 4：`_batch_tasks` 内存泄漏

```python
_batch_tasks: dict = {}  # 任务完成后永远不清理
```

每次批量提取都会往这个字典里加一条记录，长期运行后内存持续增长。应加 LRU 或 TTL 清理策略，例如只保留最近 100 条任务记录。

### Bug 5：前端硬编码 Windows 路径

```javascript
// browser.html 中多处出现
v = 'D:\\Doc_Lib\\extracted';
setBatchDir('D:\\Doc_Lib\\extracted')
```

在 macOS/Linux 上完全无效。默认路径应从后端 API 动态获取（比如服务器返回 `WORK_DIR` 的同级目录），或改为相对路径。

***

## 改进建议

| 问题 | 建议 |
| :-- | :-- |
| 虚拟列表共 15,303 条，`renderTable()` 每次都拼接大量 HTML 字符串 | 改用 DOM 节点复用（row recycling），减少 GC 压力 |
| `resolveItem()` 已内置 mismatch 检测但只打 toast | mismatch 时应同时上报 console.error 并阻止操作，避免提取错误文件 |
| 投行报告（cat_num=03）的来源正则 `[A-Za-z\s&.]+` 太窄 | 扩展为支持数字和更多符号，或改成按 `-` 分割取首段 |
| `_scan_work_week` 中 `import datetime` 位置在循环内 | 移到文件顶层，避免每次迭代重复导入 |
| 批量提取无文件名冲突处理 | `shutil.copy2` 直接覆盖同名文件，应加自动重命名（`file_1.pdf`, `file_2.pdf`） |

<span style="display:none">[^2]</span>

<div align="center">⁂</div>

[^1]: Screenshot-2026-04-25-165056.jpg

[^2]: https://github.com/BJHYZJ

