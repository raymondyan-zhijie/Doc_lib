# Doc_Lib 文档目录浏览器

本地文档目录浏览与提取工具，用于浏览、筛选、目录搜索、收藏和批量提取研究报告。

## 架构

```
archives/               ← 原始 ZIP 归档（只读，不修改）
work/                   ← 全量解压后的工作目录（只读，外部工具可直接访问）
app/                    ← FastAPI 后端
  main.py               — 应用工厂 + lifespan 生命周期
  config.py             — 常量、路径、7-Zip 检测、打开文件
  models.py             — Pydantic 模型
  routes/api.py         — API 路由
  services/
    zip_service.py      — 文件访问（安全边界：路径校验 + 提取 + 批量）
    index_service.py    — FTS5 全文索引 + 收藏 + 历史 + 统计
    catalog_service.py  — 目录扫描与维护
browser.html            ← 单页前端（虚拟滚动 + 筛选 + 排序 + 收藏）
catalog.json            ← 文件目录（work_path → 元数据）
doclib.db               ← SQLite（FTS5 索引 + 收藏 + 历史，损坏可删除重建）
requirements.txt        ← Python 依赖（锁定版本）
```

- 文件访问通过 `work/` 路径直接 `os.startfile()`，无需等待解压
- `work/` 可被 Windows 搜索、Everything、Acrobat 等外部工具直接使用
- FTS5 以 `work_path` 为稳定键，不再依赖 rowid 位置偏移

## 数据概览

- **15 个周压缩包**（2026年1月第1周 ~ 4月第4周）
- **~16,200 个文件**，总计约 58.7 GB
- 文件类型：PDF 为主（99%+），少量 Excel、PPT、Word

每个压缩包内部统一分为 5 类：

| 分类 | 说明 |
|------|------|
| 01 重点报告 | 行业深度报告、白皮书、蓝皮书（20–200 页） |
| 02 国内券商报告 | 国内券商研报，文件名含日期+券商名+页数 |
| 03 投行报告 | 国际投行英文报告（Barclays/JPM/MS/UBS 等） |
| 04 小报告 | 短篇专题简报（5–20 页） |
| 05 杂货 | 培训课件、经管资料、统计数据 |

## 快速开始

### 前置要求

- **Python 3.10+**
- `pip install -r requirements.txt`
- **7-Zip**：自动检测路径（环境变量 `SEVEN_ZIP_PATH` → `PATH` → 常见安装位置）
- **tkinter**（桌面状态窗口，可选）：Windows/macOS 自带，Linux 需 `sudo apt install python3-tk`

### 启动

| 方式 | 说明 |
|------|------|
| 双击 `start_hidden.vbs` | Windows：浏览器自动打开 + 桌面状态窗口，无终端 |
| 双击 `Doc_Lib.pyw` | 跨平台：浏览器 + 桌面状态窗口（需 tkinter） |
| `python server.py` | 终端模式，结构化日志输出，`Ctrl+C` 停止 |

**停止**：点击桌面状态窗口的「Stop Server」或 POST `/api/shutdown`。

### 首次使用

1. **安装依赖**：`pip install -r requirements.txt`
2. **启动服务**：双击 `start_hidden.vbs`（Windows）或 `python server.py`（终端）
   - 首次启动自动创建空的 `catalog.json` 和 `doclib.db`，浏览器正常打开页面（目录为空）
3. **添加数据**：点击标题栏 **+** 按钮 → 拖拽 ZIP 文件（文件名需含周次标签，如 `2026年4月第4周.zip`）→ 自动上传、解压、建索引
4. **开始使用**：上传完成后即可浏览、搜索、打开文件

## 功能

### 浏览与筛选
- **虚拟滚动表格**：16,000+ 文件流畅滚动，DOM 节点复用
- **多维度筛选**：周次（下拉多选）、分类（彩色标签）、来源机构、文件类型
- **文件名搜索**：300ms 防抖实时前端过滤
- **目录搜索**：SQLite FTS5，索引 filename / category / source / week / work_path
- **列排序**：点击排序，Shift+点击多列联合排序
- **收藏筛选**：一键切换仅看收藏

### 文件操作
- **打开文件**：直接用系统默认程序打开（瞬间，无需解压）
- **提取文件**：复制到指定目录，自动避免同名覆盖（`_1`, `_2` 后缀）
- **PDF 预览**：浏览器内直接查看
- **批量提取**：勾选多个文件，选择目录一键复制，带进度跟踪
- **打开目录**：在系统文件管理器中打开目录（限制在 BASE_DIR 内）

### 收藏与历史
- 收藏/书签标记重要文档（`work_path` UNIQUE 约束防止重复）
- 自动记录最近 500 条浏览历史

### 统计
- 来源统计：Top 20 券商/投行报告数量
- 周度趋势：每周报告数量柱状图

### 暗色模式
- 右上角切换，偏好保存到 localStorage

### 添加新数据
- 点击标题栏 **+** → 拖拽一个或多个 ZIP → 每个文件自动识别周次标签 → 一并上传 → 自动解压到 `work/` → 重建索引
- 单个 ZIP 上限 8 GB，前端拖放时即校验文件大小，后端 Content-Length 预检 + 流式拦截

## 项目结构

```
Doc_Lib/
├── Doc_Lib.pyw                        # 桌面启动器
├── server.py                          # 终端入口
├── start_hidden.vbs                   # Windows 一键启动
├── start_hidden.bat                   # Windows 备用
├── start_hidden.sh                    # macOS/Linux 一键启动
├── browser.html                       # 前端页面（单文件 HTML+CSS+JS）
├── catalog.json                       # 文件目录（work_path → 元数据）
├── doclib.db                          # SQLite 数据库（FTS5 + 收藏 + 历史）
├── requirements.txt                   # Python 依赖（锁定版本）
├── archives/                          # ZIP 归档（只读）
│   ├── 2026年1月第1周.zip
│   └── ...
├── work/                              # 解压后的工作目录（只读）
│   ├── 2026年1月第1周/
│   │   ├── 01_重点报告-XXX份/
│   │   └── ...
│   └── ...
├── app/
│   ├── main.py                        # FastAPI 应用 + lifespan
│   ├── config.py                      # 常量配置
│   ├── models.py                      # Pydantic 模型
│   ├── routes/
│   │   └── api.py                     # API 路由
│   └── services/
│       ├── zip_service.py             # 文件服务（安全边界）
│       ├── index_service.py           # FTS5 搜索/收藏/历史
│       └── catalog_service.py         # 目录扫描维护
└── .tmp/                              # 临时文件（启动时清理）
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/catalog` | GET | 目录数据（JSON，no-cache） |
| `POST /api/catalog/update?week_label=` | POST | 扫描 work/{week}/ 更新目录并重建索引 |
| `POST /api/catalog/rebuild` | POST | 全量重建 catalog.json + FTS 索引（扫描所有 work/ 周目录） |
| `POST /api/open` | POST | 用系统默认程序打开文件（body: `{work_path}`） |
| `POST /api/extract` | POST | 复制文件到指定目录（body: `{work_path, target_dir}`，target_dir 限制在 BASE_DIR 内） |
| `GET /api/file?work_path=` | GET | 直接提供文件（浏览器预览） |
| `POST /api/batch-extract` | POST | 批量复制文件到指定目录，返回 task_id 轮询进度 |
| `GET /api/batch-progress?task_id=` | GET | 批量进度查询 |
| `POST /api/open-dir` | POST | 在文件管理器中打开目录（body: `{path}`，限制在 BASE_DIR 内） |
| `POST /api/delete` | POST | 删除文件：从磁盘、目录、FTS、收藏、历史中彻底移除（body: `{work_path}`） |
| `GET /api/config` | GET | 服务端配置（extract_dir, platform, CSRF token） |
| `GET /api/search?q=&limit=` | GET | 目录搜索（FTS5 work_path 稳定键，O(1) 字典查找） |
| `POST /api/rebuild-index` | POST | 重建 FTS5 索引（事务包裹，无空窗期） |
| `GET /api/favorites` | GET | 收藏列表 |
| `POST /api/favorites` | POST | 添加收藏 |
| `DELETE /api/favorites?work_path=` | DELETE | 取消收藏 |
| `GET /api/favorites/check?work_path=` | GET | 检查是否已收藏 |
| `GET /api/history?limit=` | GET | 浏览历史 |
| `GET /api/stats/sources` | GET | 来源统计 |
| `GET /api/stats/weekly` | GET | 周度统计 |
| `POST /api/upload` | POST | 上传一个或多个 ZIP（8 GB/文件上限，Content-Length 预检，逐文件独立处理，统一重建索引） |
| `POST /api/shutdown` | POST | 关闭服务器 |

## 安全

- **路径遍历防护**：所有文件路径经 `os.path.realpath()` 规范化 + 前缀校验，统一由 `zip_service._validate_path()` 执行
- **目标目录限制**：`/api/extract`、`/api/batch-extract`、`/api/open-dir` 的目标路径校验在 `BASE_DIR` 子树内
- **命令注入防护**：7-Zip 使用参数列表形式（无 `shell=True`）；macOS/Linux 的 `open_file_external` 使用 `subprocess.run([...])` 而非 `os.system()`
- **XSS 防护**：前端 `esc()` 对 `<` `>` `&` `"` 全部转义，可在 HTML 属性上下文中安全使用
- **信息保护**：全局异常处理器返回通用错误消息，内部细节仅记录服务端日志
- **上传限制**：单文件上限 8 GB，前端拖放时即时校验 + 后端 Content-Length 预检 + 流式拦截（三道防线）
- **数据完整性**：`catalog.json` 原子写入（`.tmp` + `os.replace()`），防止崩溃损坏；FTS5 重建使用事务包裹，无空窗期
- **并发安全**：catalog 内存缓存读写加锁；SQLite WAL 模式支持读写并发
- **CSRF 防护**：启动时生成随机 token，副作用接口（POST/DELETE）需携带 `X-DocLib-Token` 请求头，防止其他网站通过 `127.0.0.1` 调用本机接口
- **网络隔离**：服务器绑定 `127.0.0.1`，仅限本机访问
- **数据库容灾**：`doclib.db` 损坏可删除，启动时自动重建；FTS5 旧版 schema 自动检测迁移

## 注意事项

- `work/` 约 50-60 GB，确保磁盘空间充足
- 首次使用或删除 `doclib.db` 后，启动时自动重建 FTS5 索引（约 1-2 分钟）
- 上传 ZIP 时，文件名需符合 `YYYY年M月第W周.zip` 格式以自动识别周次标签
- 若页面列表为空（`catalog.json` 被误删），手动重建目录：`curl -X POST http://localhost:8765/api/catalog/rebuild -H \"Content-Type: application/json\"`
- Windows 上路径大小写不敏感，`resolve_work_path()` 内部统一处理分隔符
