# AI PM Coach

面向「转行 AI 产品经理」人群的能力诊断工具：通过自适应测评（CAT）测出用户在六个维度上的短板，再给出针对性诊断、学习路径与复习安排。六个维度固定为：AI 基础认知 / 场景洞察 / 产品设计 / 数据与评估 / 技术协作 / 商业与落地。

**核心设计约束：运行时零 LLM、零网络请求。** 抽题、判分、计分、诊断拼装、资源推荐全部由本地规则与预制数据完成，可单机、脱网、脱离大模型独立使用。

## 两个版本

| 版本 | 状态 | 说明 |
| --- | --- | --- |
| 网页版 | ✅ 已交付（本仓库 `app/` 即为成品） | 纯静态站点，无构建步骤、无后端 |
| Windows exe 版 | ✅ 已由 GitHub Actions 构建产出多轮，待真机验证 | 同一套 `app/` 代码的 Tauri 封装（Rust 外壳 + WebView2）；构建方式与真机确认清单见仓库 `packaging/BUILD-WINDOWS.md`，最新构建 run 号见 `tests/批次8-复审57条全修报告-2026-11-16.md` |

两版共用同一套代码与数据，功能完全一致；任何修复都改在同一份源码上。

## 功能清单

- **自适应测评**：634 题核心题库，简化版 CAT 引擎（每轮 18 题、六维各 3 题，分数逐题演进可解释）；支持题量/维度/难度/范围自定义与「按学习计划出题」。
- **弱点诊断**：逐题薄弱点（错因逐字引用所选干扰项解析）+ 维度×分数段基础诊断托底；结果页含复测对比、成长曲线、分数构成说明。
- **学习模式**：27 个知识点（讲解 + 小像案例 + 易踩的坑 + 练习题），与测评共享「当前目标」（学习计划可自定义、只学最弱维可预选待生效）。
- **知识搜索**：164 条词条（三段式：概念介绍/使用方案/注意事项），本地搜索 + 分类筛选，其中 104 条可直达相关知识点。
- **错题本 / 收藏夹 / 学习笔记**：错题自动归集并与复习队列状态联动；题目可收藏并在收藏夹重做；学习内容页（含结果页、错题本等）选中文字可右键或点浮动按钮加入笔记，笔记可加备注、新建与删除。
- **阶段小测与复习队列**：按知识点组卷小测；错题按 +1/+3/+7/+14/+30 天间隔进入复习队列，学习页有常驻队列总览。
- **面试演练**：547 条五段式扩写条目，自评（掌握/模糊/不会）+ 只练弱项。
- **数据管理**：12 类本地数据一键导出/导入 JSON 备份与清空；导入有条目清洁（去重/剔除无效条目）与版本校验。

## 网页版运行方式

无需安装、无需联网，任选其一：

1. **直接打开**：双击 `app/index.html` 即可在浏览器中使用。
2. **静态服务器**（可选）：在 `app/` 目录下执行 `npx serve.` 或 `python3 -m http.server`，再访问本地地址。

用户数据保存在浏览器 localStorage 中（见下方键清单），同浏览器同来源下跨刷新保留。

## 系统要求与依赖

- **网页版**：任意现代浏览器（Chrome / Edge / Firefox / Safari 近期版本），无其他依赖。
- **exe 版**：Windows 10/11 64 位。运行时依赖 Microsoft Edge **WebView2 Runtime**：安装包已采用离线安装模式把 WebView2 安装程序随包分发，正常情况下自动静默装好、无需联网。若安装失败或异常环境下程序无法打开，请先从微软官网下载并手动安装「Microsoft Edge WebView2 Runtime」（微软官方下载页搜索该名称即可），再重新安装本程序。（说明：程序本身没有启动自检提示页，旧版文档的相关说法已更正。）

## 目录结构

```
AI PM Coach/
├── README.md 本文件
├── package.json 测试脚本的 Node 依赖声明（playwright-core，锁定版本）
├──.gitignore
├── app/ 网页版本体，可直接运行
│ ├── index.html 全部页面与逻辑（单文件应用）
│ ├── icon.webp 应用图标
│ └── assets/ 运行时数据与引擎脚本（题库、诊断、CAT、计划/复习/演练联动、知识搜索词条）
├── src/
│ └── services/ 引擎的 TypeScript 源文件（见下方对应关系）
├── data/ 数据资产、源文件与再生成脚本（全部布局感知，包内可独立再生成）
│ ├── quiz-bank.json 核心题库结构化源数据（634 题），app/assets/quiz-bank.js 由此生成
│ ├── 数据生成脚本-题库-quizbank.py quiz-bank.json → quiz-bank.js
│ ├── 完整扩写版.md 面试演练数据源（547 条五段式扩写），app/assets/drill-bank.js 由此生成
│ ├── questions.json / complete-questions.json 演练生成所需的题库元数据
│ ├── 数据生成脚本-批次4-drill.py 由扩写版生成 drill-bank.js
│ ├── glossary-frag-1.json / glossary-frag-2.json 知识搜索 124 条基础词条的结构化片段
│ ├── supplement2/补遗条目.md（23 条） supplement3/补遗条目.md（13 条） supplement4/补遗条目.md（4 条）
│ └── 数据生成脚本-知识搜索-glossary.py 由片段 + 三期补遗生成 app/assets/glossary.js（共 164 条）
├── tests/ 自测脚本（18 个 + run-all.js 运行器）、自测清单与各轮测试报告
└── docs/ 设计文档
├── 弱点诊断与资源推荐-非AI实现提示词.md
├── 复测对比与防崩溃加固-非AI实现提示词.md
└── audit/ 学习内容 × 题库覆盖审计报告与覆盖图数据
```

说明：27 个学习知识点的正文没有独立数据文件，内嵌在 `app/index.html` 与 `app/assets/` 的数据脚本中；测评诊断文案数据在 `app/assets/diagnosis-data.js`。

**src/services 与 assets 的对应关系**：`assets/` 共 10 个 js，其中 6 个是引擎脚本，与 `src/services/` 的 TS 源一一对应——cat-engine、drill-link、glossary-link、goal-link、review-link 同名对应，`diagnosis.js` 对应 `diagnosis-engine.ts`（命名例外）；其余 4 个（quiz-bank.js、drill-bank.js、glossary.js、diagnosis-data.js）是数据/生成物，由 `data/` 下的生成脚本产出，没有 TS 源。改引擎逻辑时须同步修改 TS 源与转译后的 JS。

## 开发环境说明

- **继续开发网页版**：只需 **Node.js**（运行 `tests/` 下的自测脚本与本地静态服务器）。应用本身无构建步骤，直接编辑 `app/index.html` 与 `app/assets/*.js`；涉及引擎逻辑时，同步修改 `src/services/` 下对应的 `.ts` 源文件与 `app/assets/` 下的 `.js`。
- **后续 exe 打包（Tauri）**：见仓库 `packaging/` 目录（工程、锁文件与 BUILD-WINDOWS.md 逐步指南齐全）。
- **数据再生成**：`data/` 下三个生成脚本均为布局感知，在包内直接运行即可（输入输出自动指向包内 `data/` 与 `app/assets/`），需要 Python 3。词条口径：124 基础 + 补遗一期 23 + 补遗二期 13 + 补遗三期 4 = **164 条**（技术术语 71 / 应用工具 33 / 产品名词 40 / 补强 20）。

## localStorage 数据键清单（共 12 键）

| 键 | 内容 |
| --- | --- |
| `aipm.attempts.v1` | 历次测评的逐题答题记录（题号/答案/对错/用时） |
| `aipm.snapshots.v1` | 测评快照（六维分数/总分/日期），用于复测对比 |
| `aipm.inprogress.v1` | 中途答题进度，刷新后可恢复 |
| `aipm.appeals.v1` | 「我觉得评分不准」的用户反馈 |
| `aipm.learn.v1` | 学习进度、知识点练习结果与学习计划（plan 字段） |
| `aipm.quizcfg.v1` | 测评设置（题量/维度/难度起点/题目范围）与学习计划预设（含最弱维待生效状态） |
| `aipm.wrongbook.v1` | 错题本状态（已掌握标记等） |
| `aipm.stagequiz.v1` | 阶段小测记录 |
| `aipm.review.v1` | 复习队列（到期日/间隔阶段/上次结果） |
| `aipm.drill.v1` | 面试演练自评记录（掌握/模糊/不会） |
| `aipm.favorites.v1` | 收藏的题目（题号/收藏时间） |
| `aipm.notes.v1` | 学习笔记（摘录/来源/备注/时间） |

全部 12 键均包含在应用内「数据管理」的导出/导入/清空范围中。导入兼容规则：旧版 10 键备份可正常导入（新增两键按空处理）；高于当前支持版本（version > 1）的备份会被拒绝并提示；导入时收藏/笔记/快照会做条目清洁（去重、剔除未知或损坏条目）。

## 自测脚本运行方式

共 18 个自测脚本 + 1 个运行器，全部以脚本所在副本为测试对象（相对路径解析，可在任意目录运行）：

```bash
# 一键全量（在包根目录）
npm install # 首次：安装 playwright-core（浏览器类脚本需要）
node tests/run-all.js

# 或逐个运行（在包根目录）
node tests/自测脚本-回归-全局扫描.js
node tests/自测脚本-回归-批次1与早期逻辑.js
node tests/自测脚本-回归-浏览器流程.js
node tests/自测脚本-批次2-goallink.js
node tests/自测脚本-批次3-reviewlink.js
node tests/自测脚本-批次4-drill.js
node tests/自测脚本-批次6-planfix.js
node tests/自测脚本-批次8-联动与数据.js
node tests/自测脚本-批次8-体验与异常.js
node tests/自测脚本-批次8-视口.js
node tests/自测脚本-批次8-补充验证.js
node tests/自测脚本-知识搜索-GLO.js
node tests/自测脚本-收藏-FAV.js
node tests/自测脚本-笔记-NOTE.js
node tests/自测脚本-异常-ABN.js
node tests/自测脚本-控件级矩阵.js
node tests/自测脚本-控件级矩阵-补充.js
node tests/自测脚本-控件级矩阵-批次5.js
```

- **环境前提**：逻辑类脚本只需 Node.js；浏览器类脚本（浏览器流程、ABN、FAV、NOTE、批次 8 四脚本、三个控件级矩阵）需要 playwright-core（见上 `npm install`，版本锁定于 package.json）与一个可用的 Chromium/Chrome（可用环境变量 `CHROMIUM_PATH` 指定路径；未指定时自动探测常见安装位置）。
- 全部用例的编号、步骤与预期见应用内「自测清单」页（共 182 条）；`tests/自测清单-复测对比与防崩溃.md` 是 v7 阶段的专题清单（仅覆盖复测对比与防崩溃两组，不是全量副本）。各轮回归结论见 `tests/` 下各批次报告。
