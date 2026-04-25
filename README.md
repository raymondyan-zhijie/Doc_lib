# Doc_Lib 文档目录浏览器

本地文档目录浏览与提取工具，用于浏览、筛选、全文搜索、收藏和批量提取研究报告。

## 架构

```
archives/          ← 原始 ZIP 归档（只读，不修改）
work/               ← 全量解压后的工作目录（只读，外部工具可直接访问）
app/                ← FastAPI 后端
browser.html        ← 单页前端
catalog.json        ← 文件目录（指向 work/ 下真实路径）
doclib.db           ← SQLite（FTS5 全文索引 + 收藏 + 历史）
```

- 文件打开直接 `os.startfile()`，无需等待解压
- `work/` 目录可被 Windows 搜索、Everything、Acrobat 等外部工具直接使用

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
- `pip install fastapi uvicorn pydantic python-multipart`
- **7-Zip**：自动检测路径（环境变量 `SEVEN_ZIP_PATH` → `PATH` → 常见安装位置）
- **tkinter**（桌面状态窗口，可选）：Windows/macOS 自带，Linux 需 `sudo apt install python3-tk`

### 启动

| 方式 | 说明 |
|------|------|
| 双击 `start_hidden.vbs` | Windows：浏览器自动打开 + 桌面状态窗口，无终端 |
| 双击 `Doc_Lib.pyw` | 跨平台：浏览器 + 桌面状态窗口（需 tkinter） |
| `python server.py` | 终端模式，`Ctrl+C` 停止 |

**停止**：点击桌面状态窗口的「Stop Server」。

## 功能

### 浏览与筛选
- **虚拟滚动表格**：16,000+ 文件流畅滚动
- **多维度筛选**：周次、分类（彩色标签）、来源机构、文件类型
- **文件名搜索**：300ms 防抖实时过滤
- **全文搜索**：SQLite FTS5，搜索文件名关键词
- **列排序**：点击排序，Shift+点击多列联合排序
- **收藏筛选**：一键切换仅看收藏

### 文件操作
- **打开文件**：直接用系统默认程序打开（瞬间，无需解压）
- **提取文件**：复制到临时目录
- **PDF 预览**：浏览器内直接查看
- **批量提取**：勾选多个文件，选择目录一键复制

### 收藏与历史
- 收藏/书签标记重要文档
- 自动记录最近 500 条浏览历史

### 统计
- 来源统计：Top 20 券商/投行报告数量
- 周度趋势：每周报告数量柱状图

### 暗色模式
- 右上角切换，偏好保存到 localStorage

### 添加新数据
- 点击标题栏 **+** → 拖拽新 ZIP → 自动解压到 `work/` → 自动索引

## 项目结构

```
Doc_Lib/
├── Doc_Lib.pyw                        # 桌面启动器
├── server.py                          # 终端入口
├── start_hidden.vbs                   # Windows 一键启动
├── start_hidden.bat                   # Windows 备用
├── start_hidden.sh                    # macOS/Linux 一键启动
├── browser.html                       # 前端页面
├── catalog.json                       # 文件目录
├── doclib.db                          # SQLite 数据库
├── archives/                          # ZIP 归档（只读）
│   ├── 2026年1月第1周.zip
│   └── ...
├── work/                              # 解压后的工作目录（只读）
│   ├── 2026年1月第1周/
│   │   ├── 01_重点报告-XXX份/
│   │   └── ...
│   └── ...
├── app/
│   ├── main.py
│   ├── config.py
│   ├── models.py
│   ├── routes/
│   │   └── api.py
│   └── services/
│       ├── zip_service.py             # 文件服务（安全边界）
│       └── index_service.py           # FTS5 搜索/收藏/历史
└── .tmp/                              # 临时文件（启动时清理）
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `GET /api/catalog` | GET | 目录数据 |
| `GET /api/open?work_path=` | GET | 用系统默认程序打开文件 |
| `GET /api/extract?work_path=` | GET | 复制文件到 .tmp/ |
| `GET /api/file?work_path=` | GET | 直接提供文件（浏览器预览） |
| `POST /api/batch-extract` | POST | 批量复制文件到指定目录 |
| `GET /api/batch-progress?task_id=` | GET | 批量进度 |
| `GET /api/search?q=` | GET | 全文搜索（FTS5） |
| `POST /api/rebuild-index` | POST | 重建搜索索引 |
| `GET /api/favorites` | GET | 收藏列表 |
| `POST /api/favorites` | POST | 添加收藏 |
| `DELETE /api/favorites?work_path=` | DELETE | 取消收藏 |
| `GET /api/history` | GET | 浏览历史 |
| `GET /api/stats/sources` | GET | 来源统计 |
| `GET /api/stats/weekly` | GET | 周度统计 |
| `POST /api/upload` | POST | 上传新 ZIP（存 archives/ + 解压到 work/ + 索引） |
| `POST /api/shutdown` | POST | 关闭服务器 |

## 添加新数据

### 网页上传（推荐）

点击 **+** → 拖拽 ZIP → 自动完成全部流程。

### 手动放置

```bash
# 1. 将 ZIP 放入 archives/
cp new.zip "D:\Doc_Lib\archives\2026年4月第5周.zip"

# 2. 解压到 work/
"C:\Program Files\7-Zip\7z.exe" x "D:\Doc_Lib\archives\...zip" -o"D:\Doc_Lib\work\..."

# 3. 扫描入库（需服务运行中）
curl -X POST http://localhost:8765/api/catalog/update
```

## 安全

- 所有文件访问经 `zip_service.py` 统一管理，`os.path.realpath()` 校验防路径遍历
- 7-Zip 调用使用参数列表形式（无 `shell=True`）
- `work/` 和 `archives/` 只读访问
- 数据库损坏可删除，启动时自动重建

## 注意事项

- 服务器监听 `127.0.0.1`，仅限本机访问
- `work/` 约 50-60 GB，确保磁盘空间充足
- 首次使用或删除 `doclib.db` 后，启动时自动重建 FTS5 索引（约 1-2 分钟）
