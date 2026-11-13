# 在 Windows 上构建 AI PM Coach 安装包

本工程已在 Linux 环境完成全部搭建与配置校验，仅差最后一步「在 Windows 工具链上实际编译」。
两种构建方式任选其一，产物相同：`AI PM Coach_0.1.0_x64-setup.exe`（NSIS 安装包，已内嵌 WebView2 离线安装程序，目标机器无需联网、无需预装任何组件）。

---

## 方式 A：本机构建（预计 15–30 分钟，多为下载与编译等待）

前置：Windows 10 / 11，64 位。

### 1. 安装 Node.js

- 到 https://nodejs.org 下载 **LTS 版（18 或更高）** 安装包，默认选项装完。
- 重新打开一个 PowerShell 窗口，验证：`node -v` 能输出版本号。

### 2. 安装 Rust

- 打开 https://rustup.rs ，下载 `rustup-init.exe` 运行，全程默认选项（默认即 MSVC 工具链）。
- 重新打开 PowerShell，验证：`cargo --version` 能输出版本号。

### 3. 安装 Visual Studio 2022 生成工具（Build Tools）

- 到微软官网下载 **「Build Tools for Visual Studio 2022」（Visual Studio 2022 生成工具）**。
- 运行安装器，在「工作负荷」页勾选 **「使用 C++ 的桌面开发」**（含 MSVC 编译器与 Windows SDK，约数 GB），完成安装。

### 4. 构建

把本工程文件夹放到任意目录（路径不要带中文和空格更稳妥），在工程根目录打开 PowerShell：

```powershell
npm install
npx tauri build --target x86_64-pc-windows-msvc --bundles nsis
```

首次构建会联网下载依赖与 WebView2 离线安装程序并嵌入安装包，请保持网络畅通；之后再构建可断网。

### 5. 产物位置

```
src-tauri\target\x86_64-pc-windows-msvc\release\bundle\nsis\AI PM Coach_0.1.0_x64-setup.exe
```

---

## 方式 B：GitHub Actions 构建（本机零安装）

适合不想在本机装工具链的情况。本工程已自带 `.github/workflows/build-windows.yml`：

1. 把**本工程文件夹作为仓库根目录** push 到 GitHub（若要并入已有的 AI PM Coach 仓库，把本文件夹内容放在该仓库根目录，或单独建一个仓库放它）。
2. 在 GitHub 仓库的 **Actions** 页选择 `build-windows`，点 **Run workflow**（push 到 main 分支也会自动触发）。
3. 构建完成后，在该次运行记录底部的 **Artifacts** 里下载 `AI-PM-Coach-Windows`，解压即得安装包 exe。

GitHub 的 windows-latest 镜像自带 Visual Studio 2022 生成工具，工作流会自动装好 Rust 与 Node，无需你做任何本地配置。

---

## 构建成功后：真机确认清单（约 10 分钟）

1. 双击安装包完成安装；在另一台**没有 WebView2 的机器**（或虚拟机）上再装一次，确认 WebView2 被静默装上、程序能打开。
2. 首次启动：窗口标题为「AI PM Coach」，窗口尺寸正常、内容无错位。
3. 程序已打开时再次双击图标：应聚焦已有窗口，而不是开出第二个。
4. 完整冒烟一遍：开始测评 → 答完 18 题 → 看结果与诊断 → 进学习模式 → 打开错题本/面试演练 → 用数据管理导出一个 JSON。
5. 关掉程序再打开：刚才的测评记录和学习进度还在（exe 版数据存在本机，与浏览器里的数据不互通；迁移用应用内「导出/导入」JSON）。
6. 断网状态下重复第 4 步冒烟，全程应无任何联网提示或功能缺失。
7. 从系统设置卸载：快捷方式与程序文件被正常移除。

任何一步不符合预期，把现象（最好带截图）发回给 Muse，会按「先判定是外壳问题还是共享代码问题」处理：共享代码问题会同步修网页版并刷新已导出的网页版文件夹。
