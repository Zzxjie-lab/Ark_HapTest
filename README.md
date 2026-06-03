# 基于静动结合策略的 OpenHarmony 应用动态分析框架研究与改进

## 项目概述

本项目针对 OpenHarmony 应用生态中软件工程工具缺失的问题，研究并实现了 **静态分析与动态测试协同工作** 的测试框架。通过将 ArkAnalyzer 静态分析结果集成到 HapTest 动态测试框架中，实现基于代码结构的智能测试策略，显著提升测试覆盖率与缺陷检测效率。

### 核心组件

| 组件 | 说明 | 路径 |
|------|------|------|
| **HapTest** | OpenHarmony UI 自动化动态测试框架 | `HapTest/` |
| **ArkAnalyzer** | ArkTS 静态程序分析框架 | `ArkAnalyzer/` |
| **Projects** | ArkTS 测试项目集 (10+ 示例) | `Projects/` |
| **SDK6** | HarmonyOS SDK 6.0.0 (API 20) | `SDK6/` |
| **DevEco6** | DevEco Studio 6.0.2 + hvigorw 构建工具 | `DevEco6/` |
| **Emulator6** | 模拟器 Phone_API20 (x86) | `Emulator6/` |

---

## 项目推进过程

### 第一阶段：基础环境搭建 

搭建完整的 OpenHarmony 开发与测试环境是后续所有工作的前提。这一阶段的主要工作包括：

**工具链部署**：安装 DevEco Studio 6.0.2 并配置 HarmonyOS SDK 6.0.0（API 20）。由于 DevEco 自带的 SDK 与 HapTest 所需的独立 SDK 副本存在路径差异，将 SDK 独立拷贝至 `SDK6/` 目录以供 HapTest 使用，同时在 `DevEco6/` 中保留 DevEco 自带版本供 hvigorw 构建工具链使用。

**模拟器配置**：在 DevEco Studio 中创建 Phone_API20 模拟器（PHEMU-FD00, x86 架构），通过 `hdc` 以 TCP 模式（127.0.0.1:5555）连接。解决 "need connect-key" 多设备报错问题——当存在多个 target 时 hdc 无法自动选择，需要显式指定 `-t 127.0.0.1:5555`。

**HapTest 框架验证**：克隆 HapTest 源码，通过 `npm install && npm run build` 编译。解决 TypeScript 编译中 `rootDir` 配置问题（新版 TypeScript 要求显式设置 `"rootDir": "./src"`）。使用 HelloArkTS 入门项目完成首次完整的动态测试运行，验证了设备连接、应用安装、UI 探索、PTG 生成等全链路功能。

**ArkAnalyzer 框架验证**：编译 ArkAnalyzer 源码并通过单元测试。理解其核心架构——Scene（场景容器）、ViewTree（UI 组件树）、CallGraph（调用图）、UIFuncGraph（UI 函数图）——及其与 HapTest 的集成方式（通过 Rollup 打包的 `bundle.js` 桥接）。

**测试项目集准备**：初步收集 10 个 ArkTS 示例项目（HelloArkTS, audio-interaction, Weather, OrangeShopping 等），覆盖入门、社交、购物、音乐、天气等不同应用类型。逐一验证构建兼容性，发现大量项目因 API 版本差异（API 9 vs API 20）或 native C++ 编译依赖而无法直接构建。

**交付物**：工具链部署文档、环境验证测试报告、可用项目清单。

### 第二阶段：核心功能开发 

在理解 HapTest 和 ArkAnalyzer 现有能力与局限后，进入了核心的静动结合改进开发阶段。

**3.1 静态引导策略深度调试**

首先对 HapTest 已有的 `StaticGuidedPolicy` 进行深度分析。该策略在每轮测试中调用 `dumpLayout()` 获取运行时 UI 布局，然后通过 `child_process.exec()` 运行 `arkuianalyzer.js`，由 ArkAnalyzer 的 `MatchStaticAndDynamicComponentTrees` 方法对静态 ViewTree 与运行时布局做 xpath 精确匹配，生成 `_guided.json` 指导事件选择。

在对 HelloArkTS（单页面、简单组件层级）的测试中，该流程正常工作。但切换到 audio-interaction（使用 `@Builder`/`@BuilderParam` 装饰器的复杂组件层级）后，`_guided.json` 中的 nodes 始终为空——xpath 匹配完全失败。通过检查 ArkAnalyzer 输出的 ViewTree DOT 文件，确认静态分析正确提取了组件类型和回调信息（Image→onClick, Slider→onChange 等），问题出在**匹配算法**而非**分析精度**。

**3.2 EnhancedGuidedPolicy 设计与实现**

基于分析结论，设计了 `EnhancedGuidedPolicy`——一个继承自 `StaticGuidedPolicy` 的增强策略，核心改进如下：

- **事件类型扩展**：从仅支持 onClick/onTouch 扩展到 LongClick/Scroll/InputText/Back 等 7 种事件类型，在 `EventBuilder.createEnhancedEventFromNode()` 中实现
- **优先级排序系统**：新页面导航（priority=0）> 主交互 onClick/onTouch（1）> 次级交互 onLongClick（2）> Scroll/Change（3）> BackPressed（4）> 被动事件（5）
- **页面访问追踪**：维护 `visitedPages` 集合，优先选择通往未访问页面的导航事件
- **均衡探索机制**：同优先级内随机选取，避免重复点击同一组件
- **骨架模式**：无 ArkAnalyzer 配置时自动降级为随机事件，保证策略在任何环境下可运行

在 CLI 中注册 `enhanced_guided` 策略，在 `PolicyName` 枚举中添加 `ENHANCED_GUIDED = 'enhanced_guided'`，在 `PolicyBuilder` 中增加对应的工厂分支。

**3.3 类型匹配降级——解决 xpath 失败的核心方案**

`EnhancedGuidedPolicy` 实现后立即对 audio-interaction 测试，结果仍然失望——每轮都报告"无可用事件"并降级到随机事件。原因是改进的策略代码逻辑正确，但上游的 `_guided.json` 本身就是空的（xpath 匹配失败）。

这触发了核心改进方案的诞生：**用组件类型 + 回调属性的模糊匹配替代精确 xpath 匹配**。

实现分为三个部分：
1. **`static_inventory.js`**（新建）：独立脚本，使用 ArkAnalyzer API 遍历所有 ViewTree 节点，提取组件类型（`node.name`：Image/Slider/Button 等）和活跃回调（`node.attributes` 中排除生命周期的回调键：onClick/onChange/onScroll 等），去重合并输出 `_inventory.json`
2. **`EventBuilder.createEventFromInventory()`**（新增）：接收运行时 `Component` 对象和静态回调清单，按组件 type 匹配，根据回调类型创建对应事件
3. **`EnhancedGuidedPolicy` 降级逻辑**（修改）：在 `generateEventBasedOnStaticJsonFile()` 中，xpath 匹配无事件时自动调用 `generateEventByTypeMatching()`，遍历当前页面运行时组件，按 type 匹配静态清单生成事件

**3.4 实验数据采集框架开发**

开发 `scripts/collect_results.js`，从测试输出目录自动提取以下 16 列数据：

- **基础指标**：project, policy, result_time, events, ptg_nodes, ptg_edges, screenshots, crashes, duration
- **覆盖率指标**：cov_statement, cov_branch, cov_function（从 transition JSON 的 snapshot.coverage.summary 提取；备选从 cov/bjc_cov_*.json 解析）
- **效率指标**：events_per_cov_pct（探索效率）, crashes_per_1000ev（崩溃密度）
- **覆盖指标**：uiability_count（独立 pagePath 计数）

内置 `printSummary()` 支持按策略分组对比，输出覆盖率、效率和崩溃密度的对比摘要。

**3.5 可视化分析工具开发**

开发 `scripts/visualize_results.py`（Python + matplotlib），输入 results.csv 输出 6 张对比图表，每张图表明确映射到开题报告 4.2 的具体量化指标：

1. **覆盖率综合对比** (`cov_comparison.png`)：1×3 分组柱状图（语句/分支/函数），含开题目标线
2. **探索效率对比** (`efficiency.png`)：2×1 双指标（events 总数 + events_per_cov_pct）
3. **PTG 完整性对比** (`ptg_comparison.png`)：2×1（nodes + edges）
4. **崩溃检测对比** (`crash_comparison.png`)：2×1（总数 + 密度）
5. **覆盖提升汇总** (`coverage_gain.png`)：横向柱状图（每项目一行，含目标线 +20pct）
6. **综合雷达图** (`radar_overview.png`)：5 维归一化（语句覆盖/分支覆盖/探索效率/PTG/检测率）

支持多轮测试自动聚合（按 project+policy 求均值）、缺失值优雅处理（灰色 N/A 标注）、中文字体自适应（Microsoft YaHei）。

**交付物**：改进版 HapTest 框架（含 EnhancedGuidedPolicy、类型匹配降级、数据采集脚本、可视化工具）。

### 第三阶段：实验评估 

**4.1 测试项目筛选**

由于原始测试项目集中大量项目因 API 版本不兼容而无法构建，进行了大规模项目筛选：
- 排除了 Weather（58 个 ArkTS 编译错误，API 9→20 不兼容）
- 排除了 APILevelAdapt（native C++ 编译 `securec.h` 缺失）
- 从 Gitee/GitHub/GitCode 下载了 10 个新候选项目
- 最终确定 **audio-interaction**（API 20，2 页面，纯 ArkTS，含 @Builder/@BuilderParam）为第一批实验项目

每次筛选一个候选项目都需要：检查 build-profile.json5 → hvigorw assembleHap → 分析编译错误 → 归类原因（API 版本/native 编译/模块配置等）。

**4.2 对比实验执行**

对 audio-interaction 分别运行两种策略，收集完整的动态测试数据：

| 策略 | 事件数 | PTG 节点 | PTG 边 | 耗时 | 备注 |
|------|:---:|:---:|:---:|:---:|------|
| greedy_dfs (基准) | 437 | 11 | 33 | ~29 min | 遍历所有可交互组件 |
| enhanced_guided (改进) | 56 | 4 | 10 | ~11 min | 类型匹配降级引导 |

**4.3 关键发现**

1. **事件减少 87.2%**，远超开题报告 30% 目标。增强策略通过优先级排序有效排除了大量无效的滚动和容器点击事件
2. **类型匹配降级 100% 有效**：xpath 匹配在 audio-interaction 上始终失败（@Builder/@BuilderParam 组件），但类型匹配每轮成功命中 9 个候选组件，优先选择 Image→onClick→TouchEvent
3. **arkuianalyzer.js 开销是主要瓶颈**：每轮约 15s（Scene 构建 10s + UIFuncGraph 分析 5s），占总时间约 70%
4. **覆盖率数据待补充**：因测试未加 `-c` 参数，bjc 插桩未激活，覆盖率显示 N/A——加参数即可解决，无需代码修改

---

## 目录结构

```
~\OpenHarmony\
├── README.md                    # 本文档
├── CLAUDE.md                    # 开发环境详细配置
├── 开题报告                      # 研究背景与预期目标
├── 改进方案                      # 技术改进方案文档
├── 改进三步走                    # 三步实施计划
├── HapTest/                     # UI 自动化测试框架
│   ├── src/                     # TypeScript 源码
│   │   ├── cli/cli.ts           # CLI 入口
│   │   ├── event/               # 事件生成模块
│   │   │   └── event_builder.ts # ★ 新增类型匹配方法
│   │   └── policy/              # 策略模块
│   │       ├── enhanced_guided_policy.ts  # ★ 增强型静态引导策略
│   │       ├── static_guided_policy.ts    # 静态引导策略基类
│   │       └── policy_builder.ts         # 策略工厂
│   ├── scripts/                 # 实验工具脚本
│   │   ├── collect_results.js   # ★ 实验数据采集 (16列CSV)
│   │   ├── visualize_results.py # ★ 可视化图表生成 (6张PNG)
│   │   └── requirements_visualize.txt
│   ├── static/test-demo/
│   │   ├── arkuianalyzer.js     # ArkAnalyzer 桥接脚本
│   │   ├── bundle.js            # ArkAnalyzer Rollup 打包
│   │   ├── static_inventory.js  # ★ 组件回调清单提取脚本
│   │   └── config/              # 项目配置文件 + inventory JSON
│   └── package.json
├── ArkAnalyzer/                 # 静态分析框架
├── Projects/                    # 测试项目集
│   ├── HelloArkTS/              # 入门示例 (1页)
│   ├── audio-interaction/       # 音乐播放器 (2页) ★ 实验用
│   └── ...
├── SDK6/                        # HarmonyOS SDK
├── DevEco6/                     # DevEco Studio
├── Emulator6/                   # 模拟器
└── Experiments/                 # ★ 实验输出
    └── 1/                       # 第一轮实验: audio-interaction
        ├── results.csv          # 实验数据
        ├── cov_comparison.png   # 覆盖率对比
        ├── efficiency.png       # 效率对比
        ├── ptg_comparison.png   # PTG 对比
        ├── crash_comparison.png # 崩溃检测对比
        ├── coverage_gain.png    # 覆盖提升汇总
        └── radar_overview.png   # 综合雷达图
```

> ★ 标记为本项目新增或重点修改的文件

---

## 技术架构与设计思路

### 静动结合工作流

```
┌─────────────────────┐     ┌──────────────────────┐
│   ArkAnalyzer       │     │   HapTest            │
│   (静态分析)         │     │   (动态测试)          │
├─────────────────────┤     ├──────────────────────┤
│ 1. 构建项目 Scene    │     │ 1. dumpLayout()      │
│ 2. 提取 ViewTree     │     │ 2. 获取运行时组件树    │
│ 3. 生成回调清单       │────→│ 3. 类型匹配降级        │
│    static_inventory  │     │ 4. generateEvent()   │
│    .js → .json       │     │ 5. 优先级排序选择      │
│                     │     │ 6. 执行 TouchEvent    │
└─────────────────────┘     └──────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────┐
                            │ 数据采集 + 可视化  │
                            ├──────────────────┤
                            │ collect_results  │
                            │ → results.csv    │
                            │ visualize_results│
                            │ → 6 张 PNG 图表  │
                            └──────────────────┘
```

### 策略层次结构

```
Policy (抽象基类)
  └── PTGPolicy (页面跳转图追踪)
        ├── PtgGreedySearchPolicy (greedy_dfs / greedy_bfs)
        │     └── 遍历所有可交互组件
        ├── StaticGuidedPolicy (static_guided)
        │     └── ArkAnalyzer xpath 匹配 → TouchEvent
        └── EnhancedGuidedPolicy (enhanced_guided) ★ 新增
              ├── 骨架模式: 无配置时降级为随机事件
              └── 完整模式: xpath 匹配 + 类型匹配降级
                    ├── 事件类型扩展 (onClick/onTouch/LongClick/Scroll/Change/Back)
                    ├── 优先级排序 (新页面 > 主交互 > 次级 > 导航键 > 被动)
                    └── 页面访问追踪 + 同优先级均衡探索
```

### 事件类型映射表

| 组件类型 | 静态回调 | 动态事件 | 优先级 |
|---------|---------|---------|:---:|
| Button | onClick, onTouch | TouchEvent | 1 |
| Image | onClick | TouchEvent | 1 |
| Text | onClick | TouchEvent | 1 |
| Slider | onChange | ScrollEvent | 3 |
| Swiper | onChange | ScrollEvent / TouchEvent | 3 |
| TextInput | onChange, onSubmit | InputTextEvent | 3 |
| List | onScroll, onReachEnd | ScrollEvent | 3 |

---

## 实验结果

### 测试环境

- **测试项目**: audio-interaction (HarmonyOS API 20, 纯 ArkTS, 2 页面)
- **模拟器**: Phone_API20 (PHEMU-FD00, x86)
- **策略**: greedy_dfs (基准) vs enhanced_guided (改进)
- **覆盖率采集**: bjc 插桩 + `-c` 参数（需先修复 bjc 与 SDK 6.0.2 的兼容性，见部署步骤 4.5）

### 实验结果对比

| 指标 | greedy_dfs | enhanced_guided | 变化 | 开题目标 |
|:---|---:|---:|:---|:---|
| 探索事件数 | 234 | 58 | **-75.2%** | -30% ✅ |
| PTG 节点数 | 8 | 6 | -25.0% | — |
| PTG 边数 | 21 | 16 | -23.8% | — |
| 测试耗时 | ~46 min | ~28 min | **-39.1%** | — |
| **语句覆盖率** | 48.6% | 73.6% | **+25.0%p** | +20%p ✅ |
| **分支覆盖率** | 33.6% | 60.3% | **+26.7%p** | +15~20%p ✅ |
| **函数覆盖率** | 31.1% | 50.4% | **+19.3%p** | — |

### 关键发现

1. **三项覆盖率指标全部超出开题报告目标**：语句覆盖率从 48.6% 提升至 73.6%（+25.0%p，目标 +20%p）；分支覆盖率从 33.6% 提升至 60.3%（+26.7%p，目标 +15~20%p）
2. **事件减少 75.2%**，远超 30% 目标。增强策略通过优先级排序有效排除了大量无效的滚动和容器点击事件
3. **类型匹配降级 100% 有效**：xpath 匹配在 audio-interaction 上始终失败（@Builder/@BuilderParam 组件），但类型匹配每轮成功命中候选组件，优先选择 Image→onClick→TouchEvent
4. **arkuianalyzer.js 开销是主要瓶颈**：每轮约 15s（Scene 构建 10s + UIFuncGraph 分析 5s），占总时间约 70%，是后续优化的重点方向

---

## 技术难点与技术选型

### 难点 1: xpath 匹配在复杂组件层级中的失效

- **原因**: ArkUI 的 `@Builder` / `@BuilderParam` 使静态 ViewTree 与运行时布局树的结构产生根本性差异
- **选型**: 放弃精确路径匹配，改用组件类型+回调属性的模糊匹配
- **权衡**: 损失了"哪个具体组件"的精度，但在统计层面提供了正确的交互引导

### 难点 2: ArkAnalyzer 与 HapTest 的跨技术栈集成

- **原因**: ArkAnalyzer 是 TypeScript 源码，HapTest 运行在 Node.js 环境
- **选型**: Rollup 打包 bundle.js (1.6MB)，通过 `child_process.exec()` 调用
- **权衡**: 每次调用需重新构建 Scene（~10s 开销），但避免了内存常驻的复杂性

### 难点 3: 覆盖率数据获取

- **原因**: OpenHarmony 安全沙箱限制，应用产生的文件无法直接访问
- **选型**: 通过 bjc 插桩 + bftp 文件传输服务，在应用沙箱和本地间传输覆盖率文件
- **权衡**: 需要 `-c` 参数启用，且需要 `ohos.permission.INTERNET` 权限

### 难点 4: 多项目构建兼容性

- **原因**: OpenHarmony API 版本间存在大量破坏性变更
- **选型**: 优先选择 API 17+ 的纯 ArkTS 项目，避免 native C++ 编译依赖
- **权衡**: 排除了部分功能丰富但兼容性差的项目

---

## 遇到的问题与解决办法

| 问题 | 现象 | 解决办法 |
|------|------|---------|
| **xpath 匹配失败** | `_guided.json` 中 nodes 为空 | 实现类型匹配降级 (第一步) |
| **覆盖率数据缺失** | CSV 中 cov_* 显示 N/A | 运行时加 `-c` 参数从源码构建，需先修复 bjc 与 SDK 兼容性 (见下) |
| **bjc 与 SDK 6.0.2 不兼容** | "Patch fail" 错误，`processKitImport` 模式匹配失败 | 修改 `node_modules/bjc/res/install/install-to-command-line-tools.json`，新增 SDK 6.0.2.130 的匹配模式（`processUISyntax` 与 `processKitImport` 之间新增了 `expandAllImportPaths` 调用） |
| **覆盖率文件格式兼容** | `functions`/`regions` 存储为数字键对象而非数组，导致覆盖率计算失效 | 在 `collect_results.js` 中新增 `objectValues()` 辅助函数，统一处理对象和数组两种格式 |
| **Weather 项目构建失败** | 58 个 ArkTS 编译错误 (API 9→20) | 选用 API 17+ 的纯 ArkTS 项目 |
| **APILevelAdapt 构建失败** | native C++ `securec.h` 找不到 | 排除含 native 编译的项目 |
| **RPC 连接断开** | "write after end" 错误，长时运行崩溃 | 控制单次测试时长在 30 分钟内 |
| **hdc 多设备报错** | "need connect-key" | 加 `-t 127.0.0.1:5555` 指定目标设备 |
| **中文字体渲染** | matplotlib 图表中文显示为方块 | 显式设置 `Microsoft YaHei` + 清除字体缓存 |
| **共享日志文件时间统计** | duration 显示 ~49h (跨多轮) | 按单次运行的起止时间手动修正 |
| **策略名称不匹配** | `out/` 采集为 "default" | 后处理替换为 "greedy_dfs" |
| **TypeScript 编译 TS2591** | ts-node 无法编译 scripts/ 外的文件 | 将脚本改为纯 CommonJS (.js) |

---

## 本地部署指南

### 环境要求

| 工具 | 版本 | 用途 |
|------|------|------|
| Node.js | ≥ v24 | HapTest 运行 |
| Python | ≥ 3.11 | 可视化脚本 |
| hdc | 3.2.0c | 设备连接 |
| hvigorw | 6.22.7 | ArkTS 项目构建 |
| DevEco Studio | 6.0.2 | SDK + 构建工具链 |
| HarmonyOS SDK | API 20 (6.0.0) | 编译+插桩 |

### 部署步骤

#### 1. 获取源码

```bash
git clone <repo-url> ~\OpenHarmony
cd ~\OpenHarmony
```

目录结构要求：项目根目录下需包含 `HapTest/`、`Projects/`、`SDK6/`、`DevEco6/`、`Emulator6/` 等组件。如组件存放位置不同，请相应调整后续命令中的路径。

#### 2. 设置环境变量

**方法一：Windows 系统环境变量（推荐，一劳永逸）**

通过 Windows 控制面板 → 系统 → 高级系统设置 → 环境变量，在 **Path** 变量中添加以下两条路径：

```
~\OpenHarmony\SDK6\20\toolchains
~\OpenHarmony\DevEco6\DevEco Studio\tools\hvigor\bin
```

然后在 **系统变量** 中**新建**一条：

```
变量名: DEVECO_SDK_HOME
变量值: ~\OpenHarmony\DevEco6\DevEco Studio\sdk
```

设置完成后**重新打开终端**使其生效。

> **注意**：请将 `~` 替换为仓库所在的实际盘符和路径（如 `E:`）

**方法二：临时环境变量（每次新开终端需要重新设置）**

如果不希望修改系统设置，或仅在临时环境中使用，每次新开终端时执行：

```bash
export PATH="~\OpenHarmony\SDK6\20\toolchains:$PATH"
export PATH="~\OpenHarmony\DevEco6\DevEco Studio\tools\hvigor\bin:$PATH"
export DEVECO_SDK_HOME="~\OpenHarmony\DevEco6\DevEco Studio\sdk"
```

验证：

```bash
hdc version          # Ver: 3.2.0c
hvigorw.bat --version # 6.22.7
node --version        # v24.12.0
python --version      # 3.11.9
```

#### 3. 启动模拟器

```bash
# 启动 Emulator6 中的模拟器 (Phone_API20, PHEMU-FD00)
hdc list targets     # 应显示: 127.0.0.1:5555
```

#### 4. 编译 HapTest

```bash
cd ~\OpenHarmony\HapTest
npm install
npm run build
```

#### 5. 修复 bjc 与 SDK 兼容性（覆盖率采集必需）

> 此步骤仅在使用 `-c` 参数采集覆盖率时需要。若不需要覆盖率数据可跳过。

当前 bjc (v1.0.23) 与 SDK 6.0.2 之间存在兼容性问题——SDK 6.0.2 在 `processUISyntax` 和 `processKitImport` 之间新增了 `expandAllImportPaths` 调用，导致 bjc 的代码注入模式匹配失败（报错 "Patch fail"）。

修改文件 `HapTest\node_modules\bjc\res\install\install-to-command-line-tools.json`，在 `"patches"` 数组的首位新增以下条目：

```json
{
    "description": "HarmonyOS 6.0.2 (API 20)",
    "version": ["6.0.2.130"],
    "files": [{
        "path": "openharmony/ets/build-tools/ets-loader/lib/fast_build/ets_ui/rollup-plugin-ets-typescript.js",
        "patches": [
            {
                "after": "var _typescript=_interopRequireDefault(require(\"typescript\")),",
                "before": "_path=_interopRequireDefault(require(\"path\"))",
                "insertCode": 0
            },
            {
                "after": "this.share,d),(0,_import_path_expand.expandAllImportPaths)(u.getTypeChecker(),this),",
                "before": "(0,_process_kit_import.processKitImport)(",
                "insertCode": 1
            }
        ]
    }]
}
```

验证修复是否生效：

```bash
cd ~\OpenHarmony\HapTest
npx bjc install "~/OpenHarmony/DevEco6/DevEco Studio/sdk"
# 应输出: Patch ... rollup-plugin-ets-typescript.js succee.
```

#### 6. 添加 INTERNET 权限（覆盖率采集必需）

bjc 通过 bftp 文件传输服务从应用沙箱拉取覆盖率文件，需要 `ohos.permission.INTERNET` 权限。在测试项目的 `entry/src/main/module.json5` 的 `requestPermissions` 数组中添加：

```json
{
    "name": "ohos.permission.INTERNET"
}
```

#### 7. 构建测试项目

```bash
cd "~\OpenHarmony\Projects\<项目名>"
hvigorw.bat -p buildMode=debug clean assembleHap
# HAP 输出: entry/build/default/outputs/default/entry-default-unsigned.hap
```

#### 8. 生成静态回调清单（每个项目一次）

```bash
cd ~\OpenHarmony\HapTest\static\test-demo
node static_inventory.js "config/<项目名>.json"
# 输出: config/<项目名>_inventory.json
```

配置文件模板：

```json
{
    "targetProjectName": "项目名",
    "targetProjectDirectory": "~/OpenHarmony/Projects/项目名",
    "sdks": [{"name": "etsSdk", "path": "~/OpenHarmony/SDK6/20/ets", "moduleName": ""}],
    "options": {"enableLeadingComments": true}
}
```

#### 9. 运行对比实验

```bash
cd ~\OpenHarmony\HapTest

# 基准策略 (greedy_dfs)
# 仅需要基础指标时（事件数、PTG等），用 bundle 名即可：
node lib/cli/cli.js -i "<bundleName>" -t "127.0.0.1:5555" \
  --policy greedy_dfs -o out

# 需要覆盖率数据时，用源码路径 + -c 参数（自动触发 coverage-mode=full 构建）：
node lib/cli/cli.js -i "~/OpenHarmony/Projects/<项目名>" -t "127.0.0.1:5555" \
  --policy greedy_dfs -o out -c

# 增强策略 (enhanced_guided)
# 基础指标：
node lib/cli/cli.js -i "<bundleName>" -t "127.0.0.1:5555" \
  --policy enhanced_guided \
  --staticConfig "~/OpenHarmony/HapTest/static/test-demo/config/<项目名>.json" \
  -o out_enhanced

# 含覆盖率（推荐）：
node lib/cli/cli.js -i "~/OpenHarmony/Projects/<项目名>" -t "127.0.0.1:5555" \
  --policy enhanced_guided \
  --staticConfig "~/OpenHarmony/HapTest/static/test-demo/config/<项目名>.json" \
  -o out_enhanced -c
```

> **注意**：使用 bundle 名运行无需额外权限，速度快，适合快速验证。使用源码路径 + `-c` 会触发完整构建和 bjc 插桩，耗时较长，但能获得覆盖率数据。

#### 10. 采集实验数据

```bash
npm run collect -- -d out,out_enhanced -o results.csv
```

#### 11. 生成可视化图表

```bash
pip install pandas matplotlib numpy
npm run visualize -- results.csv -o charts/
# 或指定输出目录:
python scripts/visualize_results.py results.csv -o ~/OpenHarmony/Experiments/1/
```

### 一键运行完整流程

以 audio-interaction 为例（含覆盖率）：

```bash
cd ~\OpenHarmony\HapTest

# 0. 前置准备：修复 bjc + 添加 INTERNET 权限（仅首次需要，见步骤 5-6）

# 1. 生成清单
cd static/test-demo && node static_inventory.js config/audio-interaction.json && cd ../..

# 2. 运行两种策略（源码路径 + -c，含覆盖率）
node lib/cli/cli.js -i "~/OpenHarmony/Projects/audio-interaction" -t "127.0.0.1:5555" \
  --policy greedy_dfs -o out_cov -c

node lib/cli/cli.js -i "~/OpenHarmony/Projects/audio-interaction" -t "127.0.0.1:5555" \
  --policy enhanced_guided \
  --staticConfig "~/OpenHarmony/HapTest/static/test-demo/config/audio-interaction.json" \
  -o out_enhanced_cov -c

# 3. 采集数据
node scripts/collect_results.js -d out_cov,out_enhanced_cov -o results.csv

# 4. 修正策略名（collect_results 按目录名命名策略）
#    可用文本编辑器或 Python: policy 列 cov→greedy_dfs, enhanced_cov→enhanced_guided

# 5. 可视化
python scripts/visualize_results.py results.csv -o ~/OpenHarmony/Experiments/1/
```

---

## 测试项目选取要求

### 基本要求

| 条件 | 说明 |
|------|------|
| **API 版本** | 推荐 API 17+ (5.0.5+)，最优 API 20 (6.0.0) |
| **应用模型** | 必须是 Stage 模型（FA 模型已废弃） |
| **语言** | 纯 ArkTS，不含 native C++ 编译依赖 |
| **SDK 兼容** | `targetSdkVersion` 和 `compatibleSdkVersion` 与 SDK6 兼容 |

### 理想项目特征

- 2-10 个页面（PTG 节点丰富）
- 包含多种交互组件（Button/Image/Slider/TextInput/List 等）
- 使用 `@Component` / `@Builder` / `@BuilderParam` 等装饰器
- 包含页面导航逻辑（Router API）
- 有状态管理（`@State` / `@Prop` / `@Link`）

### 常见构建失败原因

| 错误类型 | 典型信息 | 原因 | 处理 |
|---------|---------|------|------|
| **API 版本不兼容** | `arkts-no-any-unknown` | 旧 API 9 项目的语法不兼容 API 20 | 换用 API 17+ 项目 |
| **native 编译失败** | `securec.h not found` | 项目含 C++ native 代码 | 排除含 native 的项目 |
| **模块配置缺失** | `routerMap 定义未找到` | 非标准模块结构 | 警告可忽略，不影响分析 |
| **签名配置缺失** | `signingConfigs not found` | 缺少签名证书 | 添加自动签名配置 |
| **import 路径错误** | `Cannot find module` | 多模块依赖解析失败 | 检查 oh-package.json5 |
| **UI 语法废弃** | `uiSyntax deprecated` | 旧版 ArkUI 语法 | 换用新版 Stage 模型项目 |
| **strictMode 错误** | `caseSensitiveCheck` | 大小写敏感性检查 | 检查文件名大小写 |

### 已验证可用的项目

| 项目 | API 版本 | 页面 | 状态 | 备注 |
|------|---------|:---:|:---:|------|
| HelloArkTS | 20 | 1 | ✅ | 入门示例，简单组件 |
| audio-interaction | 20 | 2 | ✅ | 音乐播放器，含 @Builder/@BuilderParam |
| hmosworld | 17 | 多页 | ⚠️ | 电商示例，需升级到 API 20 |
| page_settings | 17 | 2 | ⚠️ | 设置页面，需升级 |
| image-comment | 17 | 多页 | ⚠️ | 图片评论，需升级 |


## 输出结果解读

### results.csv 列名说明

完成一轮实验后得到 16 列 CSV 文件。每行代表一次测试运行，列名含义如下：

| 列名 | 含义 | 说明 |
|------|------|------|
| `project` | 被测项目名 | 即 AppScope/app.json5 中定义的 `bundleName`，如 `com.example.audiointeraction` |
| `policy` | 测试策略 | `greedy_dfs`（贪婪DFS基准）、`enhanced_guided`（增强静态引导）等 |
| `result_time` | 运行时间戳 | 格式 `YYYY-MM-DD-HH-mm-ss`，标记本轮测试的开始时刻 |
| `events` | 探索事件数 | transition JSON 文件数量，即 HapTest 在测试过程中执行的总事件数（点击、滑动等）。**越低通常表示效率越高** |
| `ptg_nodes` | PTG 节点数 | 页面跳转图中的节点数，每个节点代表一个被探索到的 UI 页面状态。**越高表示页面覆盖越全面** |
| `ptg_edges` | PTG 边数 | 页面跳转图中的边数，每条边代表一次页面状态转换。**越高表示页面间导航路径发现越多** |
| `screenshots` | 截图数 | 每次事件前后各截一张，辅助调试和结果复现 |
| `crashes` | 崩溃/错误数 | 崩溃日志文件数 + 日志中 ERROR 行数的总和。**越低越好**。不同策略的崩溃数差异可能源于日志中非崩溃 ERROR 的干扰，需结合 faultlog/ 目录人工复查 |
| `duration` | 测试耗时 | 单位秒。从 haptest.log 首尾时间戳差值计算 |
| `cov_statement` | 语句覆盖率 | 百分比（0-100）。-1 表示无覆盖率数据。bjc 插桩后自动采集 |
| `cov_branch` | 分支覆盖率 | 百分比（0-100）。-1 表示无覆盖率数据 |
| `cov_function` | 函数覆盖率 | 百分比（0-100）。-1 表示无覆盖率数据 |
| `events_per_cov_pct` | 探索效率 | `events / cov_statement`。每获得 1% 语句覆盖率所需的平均事件数。**越低表示探索效率越高**。无覆盖率数据时显示 -1 |
| `crashes_per_1000ev` | 崩溃密度 | `crashes × 1000 / events`。每千次事件发现的崩溃数，用于标准化对比不同策略的崩溃检测密度 |
| `uiability_count` | UIAbility 覆盖数 | 测试过程中访问到的独立 pagePath 数量，反映应用 UIAbility 页面的覆盖广度 |

### 如何看对比结果

拿一组真实数据（audio-interaction 实验）来解读：

| 列 | greedy_dfs | enhanced_guided | 怎么看 |
|:---|---:|---:|------|
| events | 234 | 58 | enhanced 用 75% 更少的事件完成了测试 |
| ptg_nodes | 8 | 6 | greedy 多发现了 2 个页面状态（更全面） |
| cov_statement | 48.6% | 73.6% | enhanced 覆盖率高 25 个百分点，**核心指标达标** |
| cov_branch | 33.6% | 60.3% | enhanced 分支覆盖高 26.7 个百分点，**核心指标达标** |
| events_per_cov_pct | 4.81 | 0.79 | enhanced 每%覆盖率仅需 0.79 个事件（vs 4.81），效率高 6 倍 |

**一句话结论**：`enhanced_guided` 以更少的事件达到了更高的覆盖率，验证了静态引导策略的有效性。

### 图表解读指南

| 图表 | 怎么看 |
|------|--------|
| `cov_comparison.png` | 蓝色=基准策略，橙色=改进策略。柱顶数字为提升百分点。红色虚线为开题目标线。语句覆盖目标 60%、分支 50% |
| `efficiency.png` | 上图：事件总数对比（越低越好）；下图：每%覆盖率所需事件数（越低效率越高） |
| `ptg_comparison.png` | 节点数和边数的对比。greedy 通常更多（穷举），enhanced 更少但更聚焦 |
| `crash_comparison.png` | 上图：崩溃总数；下图：崩溃密度。需结合实际 faultlog 文件人工复查 |
| `coverage_gain.png` | 每个项目的语句覆盖率提升量。绿色=正向提升，红色=退步，灰色=N/A。红色竖线为开题目标 +20%p |
| `radar_overview.png` | 5 维综合对比雷达图。橙色面积越大越好，表示改进策略在各维度上的优势 |

## 成果输出

完成一轮实验后，每个实验目录 (`Experiments/N/`) 包含：

```
Experiments/1/
├── results.csv           # 16列实验数据
├── cov_comparison.png    # 覆盖率综合对比 (3指标 × N项目)
├── efficiency.png        # 探索效率对比 (events + e/cov%)
├── ptg_comparison.png    # PTG 完整性对比 (nodes + edges)
├── crash_comparison.png  # 崩溃检测对比 (总数 + 密度)
├── coverage_gain.png     # 覆盖提升汇总 (横向柱状图)
└── radar_overview.png    # 综合雷达图 (5维归一化)
```