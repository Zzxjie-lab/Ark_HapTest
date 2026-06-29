# OpenHarmony 静动结合 UI 自动化测试框架

基于静态程序分析与动态 UI 探索相结合的 OpenHarmony ArkTS 应用自动化测试框架。通过 ArkAnalyzer 提取组件树和回调信息指导 HapTest 的事件生成，显著提升测试覆盖率与探索效率。

## 核心组件

| 组件 | 说明 | 技术栈 |
|------|------|------|
| **HapTest** | UI 自动化测试框架，支持多种探索策略 | TypeScript / Node.js |
| **ArkAnalyzer** | ArkTS 静态程序分析框架，提取 ViewTree、调用图、控制流图 | TypeScript |
| **Projects** | 10 个 ArkTS 示例项目，作为测试基准集 | ArkTS / HarmonyOS |

## 测试策略

| 策略 | 说明 |
|------|------|
| `greedy_dfs` | 贪心深度优先搜索（基线） |
| `greedy_bfs` | 贪心广度优先搜索 |
| `random` | 随机探索 |
| `static_guided` | 静态指导动态（xpath 精确匹配） |
| **`enhanced_guided`** | 增强型静动结合（类型匹配降级 + 优先级排序 + 模板去重 + 终止保护） |
| `replay` | 录制回放 |

## 实验结果摘要

基于 5 个 OpenHarmony 应用的对比实验，enhanced_guided 相对于 greedy_dfs 基线：

| 指标 | 平均变化 |
|------|:---:|
| 事件数 | **−45.9%** |
| 语句覆盖率 | **+18.6pp** |
| 分支覆盖率 | **+18.3pp** |
| 函数覆盖率 | **+15.5pp** |
| 探索效率 | **−53.2%** |

详细数据见 `Experiments/` 目录。

## 环境要求

- Windows 11 / macOS
- Node.js ≥ 18
- HarmonyOS SDK（API 20+）
- DevEco Studio 6.0+（含 hvigorw）
- hdc（HarmonyOS Device Connector）
- OpenHarmony 模拟器或真机

## 快速开始

```bash
# 1. 设置环境变量
export PATH="<SDK路径>/20/toolchains:$PATH"
export PATH="<DevEco Studio路径>/tools/hvigor/bin:$PATH"

# 2. 构建 HapTest
cd HapTest
npm install
npm run build

# 3. 运行测试（以 bundle 名指定目标）
node lib/cli/cli.js -i "com.example.helloarkts" --policy greedy_dfs -o out

# 4. 运行 enhanced_guided 策略（需要静态配置文件）
node lib/cli/cli.js -i "com.example.helloarkts" \
  --policy enhanced_guided \
  --staticConfig "static/test-demo/config/HelloArkTS.json" \
  -o out_enhanced
```

## 项目结构

```
├── HapTest/                # UI 自动化测试框架
│   ├── src/                #   源代码
│   │   ├── cli/            #     CLI 入口
│   │   ├── policy/         #     探索策略（EnhancedGuidedPolicy 等）
│   │   ├── event/          #     事件构建器
│   │   └── device/         #     设备驱动
│   └── static/             #   静态分析桥接资源
├── ArkAnalyzer/            # 方舟静态分析器
│   └── src/                #   源代码（Scene, ViewTree, CallGraph）
├── Projects/               # ArkTS 测试项目集（10 个）
└── Experiments/            # 实验数据与结果
    └── 结果汇总.csv         #   5 项目对比数据
```

## 许可证

MIT License
