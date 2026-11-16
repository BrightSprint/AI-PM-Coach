# AI PM Coach — Tauri 打包报告（2026-11-13）

> **历史快照提示（批次 8 · 三-13，2026-11-16 补注）**：本文是 2026-11-13 首次打包实测的历史记录，其中「本机未产出 exe」等结论已被后续进展取代——自 2026-11-14 起，exe 改由 GitHub Actions 的 Windows 镜像构建并多次成功产出（最新 run 见批次 8 报告与 BUILD-WINDOWS.md）。本文正文保持原样仅供追溯，当前状态请以上述两处为准。

## 结论

**本机（Linux VM）未产出 Windows 安装包 exe。** 交叉编译工具链其余环节全部打通，
唯一卡点是 cargo-xwin 首次下载 MSVC CRT / Windows SDK 时被本机出口代理阻断（见「卡点」）。
Tauri 工程已完整交付且自洽校验通过（JSON 合法、cargo metadata OK、依赖已全部解析下载），
在 Windows 真机或网络直通的环境按 README 一条命令即可构建。

未伪造任何 exe，未声称已产出。

## 当前所处阶段

工具链 ✅ → 工程搭建 ✅ → 依赖解析 ✅ → **编译阶段的第 0 步（cargo-xwin 下载 MSVC CRT/SDK）❌ 卡住** → NSIS 打包未达。

耗时构成（总约 71 分钟）：工具链准备约 35 分钟（其中 LLVM 20 官方包下载 2.02GB +
解压约 15 分钟；另有两条 exec 命令被权限确认挂起合计约 30 分钟墙钟，最终均获执行）；
cargo-xwin 的 SDK 下载步骤三次尝试合计约 55 分钟墙钟（含其内部重试退避），是唯一实质卡点。

## 使用版本

| 组件 | 版本 |
|---|---|
| Tauri CLI（npm @tauri-apps/cli） | 2.12.4 |
| tauri（Rust crate，Cargo.lock 锁定） | 2.12.5 |
| tauri-build | 2.7.4 |
| tauri-plugin-single-instance | 2.5.5 |
| wry / tao / webview2-com-sys | 0.57.2 / 0.37.2 / 0.39.1 |
| rustc / cargo | 1.100.0（stable） |
| cargo-xwin | 0.23.1 |
| LLVM（clang-cl / lld-link / llvm-rc） | 20.1.8 官方便携包（系统另有 clang 18.1.3，但其 /usr/lib/llvm-18/bin 缺 clang-cl，故采用便携版） |
| NSIS makensis | 3.09（系统包 + 便携解压双份均验证可用） |

## 工程结构（~/workspace/ai-pm-coach-packaging/）

```
package.json / package-lock.json      # @tauri-apps/cli ^2
README.md                             # Windows / Linux 两条构建路径
dist/                                 # 前端副本（index.html + icon.webp + assets/*.js，共 5.0M）【批次 8 · 三-19 补注：此为 2026-11-13 快照数字；现行 dist 实测约 5.5 MB（5,502,259 字节），以 packaging/README.md 为准】
src-tauri/
  tauri.conf.json                     # 见下方配置证据
  Cargo.toml / Cargo.lock             # 依赖已解析，cargo fetch 全量下载完成
  build.rs
  src/main.rs / src/lib.rs            # 外壳：单实例插件（重复启动 unminimize+show+set_focus）
  capabilities/default.json           # 仅 core:default；网页本身不调用 Tauri API
  icons/                              # 由 app/icon.webp（256×256）转制：icon.ico（16–256 全尺寸）、32x32.png、128x128.png、128x128@2x.png、icon.png
```

未改动网页应用任何功能代码与口径；dist 为 `~/workspace/AI PM Coach/app/` 的原样副本。

## WebView2 离线模式配置证据

src-tauri/tauri.conf.json 原文片段（实测解析输出一致）：

```json
"bundle": {
  "active": true,
  "targets": ["nsis"],
  "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"],
  "windows": {
    "webviewInstallMode": { "type": "offlineInstaller", "silent": true },
    "nsis": { "installMode": "currentUser", "displayLanguageSelector": false }
  }
}
```

即：打包时 Tauri 打包器将微软官方 WebView2 离线安装程序
（MicrosoftEdgeWebView2RuntimeInstallerX64.exe）嵌入 NSIS 安装包，
终端用户安装时静默一并安装，无需联网。该下载动作发生在打包阶段，
因构建未越过编译步骤，本机未能实际验证嵌入后的安装包体积。

## 卡点（精确）

- 步骤：`cargo xwin build --target x86_64-pc-windows-msvc` 的首次环境准备
  “Failed to setup MSVC CRT”——cargo-xwin 需先从
  `https://aka.ms/vs/17/release/channel` 拉取 VS 17 频道清单，再从微软 CDN
  下载 CRT/SDK 包（约 1–2GB）到 `~/.cache/cargo-xwin`（实测缓存始终 0 字节）。
- 原始错误（两次独立尝试一致，第三次同一步骤静默 21 分钟后按指示终止）：

  ```
  Error: Failed to setup MSVC CRT
  Caused by:
      0: HTTP GET request for https://aka.ms/vs/17/release/channel failed
      1: CONNECT proxy failed: proxy server did not respond
  ```

  第二次尝试日志另见其内部重试：`Retrying MSVC CRT setup (attempt 2/4) … (attempt 4/4)` 后失败。
- 对照证据：同一代理下 curl 访问同一 URL 成功（HTTP 200，91,688 字节清单，
  VS 17.14.45），GitHub / Ubuntu 仓库 / crates.io 下载均正常；
  只有 cargo-xwin 所用 HTTP 客户端的代理 CONNECT 握手无响应。
  判断为本沙盒出口代理与 cargo-xwin 请求方式的兼容性问题，而非工程问题。
- 因此本机无法进入 Rust 实际编译，更无法到达 NSIS 打包与 WebView2 离线包嵌入步骤。

## Windows 真机上需执行的构建命令

前置与命令见 README.md「在 Windows 上构建」。预计耗时：首次约 15–30 分钟
（crates 已锁定；主要是 WebView2 离线安装程序下载 + 约 300 个 crate 编译 + NSIS 打包）。

## 真机仍需人工确认事项

1. 安装包双击安装全流程（currentUser 模式免管理员；WebView2 离线组件在无 WebView2 的机器上是否静默装好）
2. 首次启动：窗口标题「AI PM Coach」、默认 1280×820、最小尺寸约束
3. 单实例：程序运行时再次双击图标，应聚焦已有窗口而非新开
4. 数据持久化：WebView2 的 localStorage（10 个 aipm.*.v1 键）在关程序重开后保留；
   注意与浏览器版数据不互通（不同存储域），迁移走应用内导出/导入
5. 核心流程冒烟：完整做一次 18 题测评 → 看结果/雷达 → 学习模式打开任意知识点 → 数据导出一份 JSON
6. 卸载流程与开始菜单/桌面快捷方式名称
7. 断网状态下重复 4–5 项（必须全程可用）
