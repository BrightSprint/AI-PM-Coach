# AI PM Coach — Tauri 打包工程（Windows）

把网页版 AI PM Coach（纯静态、零运行时网络、localStorage 存储）封装为 Windows 桌面应用。
Rust 只做外壳：主窗口 + 单实例（重复启动聚焦已有窗口），不含任何网络功能。

## 结构

- `dist/` — 前端本体副本（源自网页版导出 `app/`：index.html + assets/，共 5.0M）
- `src-tauri/` — Tauri 工程（tauri.conf.json / Cargo.toml / src/main.rs / src/lib.rs / icons/ / capabilities/）
- `package.json` — 固定 @tauri-apps/cli ^2（实际解析 2.12.4）

关键配置（src-tauri/tauri.conf.json）：

- productName `AI PM Coach`，version `0.1.0`，identifier `com.aipmcoach.app`
- bundle.targets `["nsis"]`
- WebView2 离线安装：`bundle.windows.webviewInstallMode = { "type": "offlineInstaller", "silent": true }`
  （构建时打包器会下载微软官方 WebView2 离线安装程序并嵌入安装包，终端用户断网可装）
- NSIS installMode `currentUser`（免管理员权限）

## 在 Windows 上构建（推荐路径，一条命令）

前置：

1. Rust stable（rustup 安装），含 MSVC 目标（默认即有）
2. Visual Studio 2022 Build Tools，勾选「使用 C++ 的桌面开发」（提供 MSVC + Windows SDK）
3. Node.js 18+（仅用于 tauri-cli）
4. 构建时需联网一次：下载 crates、WebView2 离线安装程序（约 150MB 级）

命令：

```powershell
cd ai-pm-coach-packaging
npm install
npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

产物：`src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\AI PM Coach_0.1.0_x64-setup.exe`

## 在 Linux 上交叉构建（本工程已验证到 SDK 下载前一步，见 PACKAGING-REPORT.md）

前置：rustup + `rustup target add x86_64-pc-windows-msvc`、cargo-xwin 0.23.1、
LLVM 20（clang-cl / lld-link / llvm-rc 在 PATH）、NSIS 3.09（makensis 在 PATH）、Node 18+。

```bash
cd ai-pm-coach-packaging
npm install
npx tauri build --target x86_64-pc-windows-msvc --runner cargo-xwin --bundles nsis
```

注意：cargo-xwin 首次构建会从 https://aka.ms/vs/17/release/channel 下载 MSVC CRT 与
Windows SDK（约 1–2GB）并缓存到 ~/.cache/cargo-xwin；该下载必须能直通微软 CDN，
受限代理环境下会失败（本机即因此未产出，详见 PACKAGING-REPORT.md）。

## 版本锁定

- tauri (crate) 2.12.5 / tauri-build 2.7.4 / tauri-cli 2.12.4
- tauri-plugin-single-instance 2.5.5 / wry 0.57.2 / webview2-com-sys 0.39.1
- Cargo.lock 与 package-lock.json 均已生成并随工程交付
