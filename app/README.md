# AI PM Coach

面向「转行 AI 产品经理」人群的能力诊断工具：通过自适应测评（CAT）测出用户在六个维度上的短板，再给出针对性诊断、学习路径与复习安排。六个维度固定为：AI 基础认知 / 场景洞察 / 产品设计 / 数据与评估 / 技术协作 / 商业与落地。

**核心设计约束：运行时零 LLM、零网络请求。** 抽题、判分、计分、诊断拼装、资源推荐全部由本地规则与预制数据完成，可单机、脱网、脱离大模型独立使用。

## 两个版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| 网页版 | ✅ 已交付（本仓库 `app/` 即为成品） | 纯静态站点，无构建步骤、无后端 |
| Windows exe 版 | 🚧 打包中 | 同一套 `app/` 代码的 Tauri 封装（Rust 外壳 + WebView2），完成后安装包与 Tauri 工程会补入本仓库 |

两版共用同一套代码与数据，功能完全一致；任何修复都改在同一份源码上。

## 网页版运行方式

无需安装、无需联网，任选其一：

1. **直接打开**：双击 `app/index.html` 即可在浏览器中使用。
2. **静态服务器**（可选）：在 `app/` 目录下执行 `npx serve .` 或 `python3 -m http.server`，再访问本地地址。

用户数据保存在浏览器 localStorage 中（见下方键清单），同浏览器同来源下跨刷新保留；应用内「数据管理」支持一键导出/导入 JSON 备份与清空。

## 目录结构

```
AI PM Coach/
├── README.md            本文件
├── .gitignore
├── app/                 网页版本体，可直接运行
│   ├── index.html       全部页面与逻辑（单文件应用）
│   ├── icon.webp        应用图标
│   └── assets/          运行时数据与引擎脚本（题库、诊断、CAT、计划/复习/演练联动、知识搜索词条）
├── src/
│   └── services/        上述引擎的 TypeScript 源文件（与 assets/ 中同名 .js 一一对应，改逻辑时两处须同步）
├── data/                数据资产及其源文件
│   ├── quiz-bank.json   核心题库结构化源数据（634 题），app/assets/quiz-bank.js 由此生成
│   ├── 完整扩写版.md     面试演练数据源（547 条五段式扩写），app/assets/drill-bank.js 由此生成
│   ├── 数据生成脚本-批次4-drill.py  由扩写版生成 drill-bank.js 的脚本（见下方注意）
│   ├── 数据生成脚本-知识搜索-glossary.py  由知识库词条片段生成 app/assets/glossary.js 的脚本
│   └── glossary-frag-1.json / glossary-frag-2.json  知识搜索 124 条基础词条的结构化片段（补遗 23 条在脚本内读补遗 MD）
├── tests/               自测脚本、自测清单与全量测试报告
└── docs/                设计文档
    ├── 弱点诊断与资源推荐-非AI实现提示词.md
    ├── 复测对比与防崩溃加固-非AI实现提示词.md
    └── audit/           学习内容 × 题库覆盖审计报告与覆盖图数据
```

说明：27 个学习知识点的正文没有独立数据文件，内嵌在 `app/index.html` 与 `app/assets/` 的数据脚本中；测评诊断文案数据在 `app/assets/diagnosis-data.js`。

## 开发环境说明

- **继续开发网页版**：只需 **Node.js**（运行 `tests/` 下的自测脚本与本地静态服务器）。应用本身无构建步骤，直接编辑 `app/index.html` 与 `app/assets/*.js`；涉及引擎逻辑时，同步修改 `src/services/` 下对应的 `.ts` 源文件与 `app/assets/` 下的转译版 `.js`。
- **后续 exe 打包（Tauri）**：需要 **Rust 工具链**（rustup 安装 stable）与 **Tauri CLI**（`cargo install tauri-cli` 或 npm 包 `@tauri-apps/cli`），构建机为 Windows。Tauri 运行时依赖 Microsoft Edge **WebView2 Runtime**：打包时采用离线安装模式把 WebView2 安装程序随安装包分发，用户无网也能装；程序启动时有环境自检，依赖缺失会显示提示页写明所需组件名称与获取方式。
- **数据再生成**：`data/数据生成脚本-批次4-drill.py` 需要 Python 3；注意脚本内的输入路径写的是原始工作区绝对路径，在本仓库运行时请先改指向 `data/完整扩写版.md`，输出即 `app/assets/drill-bank.js` 的内容。`data/数据生成脚本-知识搜索-glossary.py` 同理：输入为同目录的 glossary-frag-1/2.json 与补遗条目 MD（路径在脚本头部常量中，迁仓时改指向），输出为 `app/assets/glossary.js`。

## localStorage 数据键清单（共 10 键）

| 键 | 内容 |
| --- | --- |
| `aipm.attempts.v1` | 历次测评的逐题答题记录（题号/答案/对错/用时） |
| `aipm.snapshots.v1` | 测评快照（六维分数/总分/日期），用于复测对比 |
| `aipm.inprogress.v1` | 中途答题进度，刷新后可恢复 |
| `aipm.appeals.v1` | 「我觉得评分不准」的用户反馈 |
| `aipm.learn.v1` | 学习进度、知识点练习结果与学习计划（plan 字段） |
| `aipm.quizcfg.v1` | 测评设置（题量/维度/难度起点/题目范围） |
| `aipm.wrongbook.v1` | 错题本状态（已掌握标记等） |
| `aipm.stagequiz.v1` | 阶段小测记录 |
| `aipm.review.v1` | 复习队列（到期日/间隔阶段/上次结果） |
| `aipm.drill.v1` | 面试演练自评记录（掌握/模糊/不会） |

全部 10 键均包含在应用内「数据管理」的导出/导入/清空范围中（2026-11-14 订正：早期版本此处误写为仅前 5 键）。

## 自测脚本运行方式

逻辑层用例为 Node 脚本，在仓库根目录执行（脚本内部按相对结构加载 `app/assets/` 的引擎与题库）：

```bash
node tests/自测脚本-批次2-goallink.js
node tests/自测脚本-批次3-reviewlink.js
node tests/自测脚本-批次4-drill.js
node tests/自测脚本-回归-批次1与早期逻辑.js
node tests/自测脚本-回归-全局扫描.js
```

- `tests/自测脚本-回归-浏览器流程.js` 为浏览器流程级用例，运行环境与逐条结果见 `tests/网页版全量测试报告.md`。
- 全部用例的编号、步骤与预期见应用内「自测清单」页与 `tests/自测清单-复测对比与防崩溃.md`；网页版全量回归结论见 `tests/网页版全量测试报告.md`。
