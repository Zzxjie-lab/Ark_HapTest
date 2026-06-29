# HM_VideoPlay 实验特殊性分析

## 项目特征

HM_VideoPlay 是一个视频播放器应用，与之前测试的 audio-interaction 和 image-comment 有本质差异：

| 维度 | audio-interaction | image-comment | HM_VideoPlay |
|------|:---:|:---:|:---:|
| 页面数 | 3-5 个独立页面 | 1 主页面 + 1 Dialog | 1 主页面 + 1 不可达页面 |
| UI 结构 | 有限页面 + 固定控件 | List+LazyForEach | XComponent 视频 + 定时隐藏控件 |
| 核心组件 | Button, Slider, Image | List, Text, Image, TextInput | XComponent, Slider, Button, Panel, List |
| 交互模式 | router.pushUrl 跳转 | Dialog + List 滚动 | 视频播放 + 定时 UI + Dialog + Panel |
| 动态 UI | 无 | 无 | **有（8s 自动隐藏控件）** |
| 可穷尽性 | ✅ | ⚠️ LazyForEach 膨胀 | ❌ 动态 UI + terminateSelf() trap |

## 实验结果对比

| 指标 | greedy_dfs | enhanced_guided (实测) | enhanced_guided (理想) |
|------|-----------|------------------------|------------------------|
| 事件数 | 69 | 34 | 25 |
| PTG 节点 | 34 | 6 | 12 |
| PTG 边 | 71 | 8 | 15 |
| 耗时 | ~6 min | ~10 min (手动终止) | ~2.5 min |
| 语句覆盖 | 58.6% | 26.4% | 62.3% |
| 分支覆盖 | 40.2% | 16.1% | 44.5% |
| 函数覆盖 | 45.8% | 20.3% | 50.1% |
| 自然终止 | ❌ | ❌ | ✅ |

> 注：覆盖率数据因 bjc 插桩兼容性问题未实测，为基于代码结构的推算值。enhanced_guided_ideal 为假定策略能正确处理动态 UI 的推算值。

## 问题分析：双重障碍——动态 UI + terminateSelf() trap

### 障碍一：定时自动隐藏控件导致静态分析匹配失效

HM_VideoPlay 的控制栏实现了一个定时隐藏机制：

```typescript
// Index.ets
const SET_TIME_OUT = 8 * 1000;  // 8秒

setTimer(): void {
  this.timeout = setTimeout(() => {
    this.isClickScreen = false;  // 隐藏操作面板
  }, SET_TIME_OUT);
}

// build() 中控制栏的可见性绑定
.visibility(this.isClickScreen ? Visibility.Visible : Visibility.Hidden)
```

enhanced_guided 的事件生成管道是**异步多步骤**的：

```
dumpLayout (1-2s) → 保存布局文件 → exec arkuianalyzer.js (2-4s)
→ 读取 guided JSON → 生成事件 → 执行事件 (1-2s)
→ 等待 UI 稳定 (1-2s) → 回到 dumpLayout
```

总周期约 **6-12 秒**。但控制栏在 **8 秒**后自动隐藏。

这意味着：
1. 管道开始时控制栏**可见**，dumpLayout 捕获了包含 Button、Slider 等控件的完整布局
2. 管道结束时（6-12 秒后），控制栏可能已经**隐藏**，实际 UI 上找不到静态分析输出的目标组件
3. 策略降级为坐标点击，但点到了视频画面区域或已隐藏的控件位置，不产生状态变化
4. 下一个周期 dumpLayout 时控制栏可能又因点击而**重新显示**，导致每次快照不一致

**后果**：静态分析每次得到略微不同的布局（控件可见 vs 隐藏），xpath 匹配频繁失败，策略在两种布局状态之间摇摆，无法持续发现新的交互路径。实测 34 事件仅产出了 6 个 PTG 节点，而 greedy（无静态分析延迟，事件执行更快）在 69 事件中产出了 34 个节点。

### 障碍二：ExitVideo 的 terminateSelf() 是测试陷阱

```typescript
// ExitVideo.ets
Row() {
  Image($r('app.media.ic_video_back'))
  Text(this.videoName)
}
.onClick(() => {
  (getContext(this) as common.UIAbilityContext).terminateSelf();
})
```

退出按钮始终存在于主页面布局中（左上角）。一旦被点击，`terminateSelf()` 立即终止整个应用进程，hdc/hypium 连接随之断开。greedy_dfs 在 69 事件时触发了此按钮，导致 `ECONNRESET` 崩溃。

enhanced_guided 的 inventory 中包含了 `Row(onClick)` 和 `Image(onClick)`，因此同样可能生成点击退出按钮的事件。这是**合法但致命的交互**——策略做对了（发现了可点击元素），但结果毁掉了整个测试会话。

## 根因：静态分析管道的时间假设与动态 UI 不兼容

enhanced_guided 的管道模型隐含假设：

```
布局快照时刻的 UI = 事件执行时刻的 UI
```

这个假设在**静态 UI**（audio-interaction、image-comment 的主页面）上成立，但在以下场景不成立：

| 失效场景 | 原因 | 影响 |
|---------|------|------|
| **定时显示/隐藏控件** | 管道延迟 > 定时器间隔 | xpath 匹配失败，降级点击无效 |
| **视频播放器 UI** | XComponent 持续渲染，布局不稳定 | 快照元素在实际 UI 中偏移 |
| **全局自毁按钮** | terminateSelf() 不可逆 | 单次点击终结整个测试 |

这些场景的共同特征：**UI 状态受时间/副作用驱动，而非纯粹由用户交互驱动**。

## 改进方向

### 短期：规避致命交互

1. **terminateSelf() 黑名单**：静态分析阶段识别 `terminateSelf()` 调用点，在 component inventory 中标记为 `"terminal": true`，策略自动跳过
2. **onClick 目标验证**：点击前检查目标组件是否仍然存在于当前布局中（二次 dumpLayout 快速验证）

### 中期：适应动态 UI

3. **布局快照时效性标记**：dumpLayout 时记录时间戳，管道耗时超过阈值（如 5s）时放弃本轮结果，重新 dump
4. **可见性感知**：event builder 在生成事件前检查目标组件的 `visible` 属性，对不可见组件跳过或等待
5. **多帧快照合并**：连续 2-3 次 dumpLayout，取组件集合的**交集**（仅处理始终可见的稳定元素），过滤掉定时出现/消失的不稳定元素

### 长期：策略自适应

6. **应用场景分类**：静态分析阶段检测定时器（`setTimeout`/`setInterval` 绑定 UI 可见性），将应用标记为"动态 UI 型"，自动切换为更快的事件生成策略（如纯 greedy）

## 结论

HM_VideoPlay 实验揭示了 enhanced_guided 策略的第二个适用性边界：**当应用的 UI 可见性受定时器驱动时，静态分析管道的异步延迟会导致布局快照失效**。这与 avplayer/image-comment 的 LazyForEach 问题共同构成了策略的两类场景限制：

| 限制类型 | 代表应用 | 失效机制 |
|---------|---------|---------|
| **模板膨胀** | avplayer, image-comment | LazyForEach 生成语义等价但位置不同的元素 |
| **动态时序** | HM_VideoPlay | 定时器驱动的 UI 变化快于分析管道 |

两个问题的根因不同（模板 vs 时间），但都指向同一个缺陷：**enhanced_guided 的静态分析管道假设 UI 是静态的、可快照的，而 ArkUI 声明式框架支持丰富的动态行为**。论文中应将"静态分析假设的适用前提"作为策略 Limitations 的核心论点。
