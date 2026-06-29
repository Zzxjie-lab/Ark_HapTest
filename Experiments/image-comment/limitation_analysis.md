# image-comment 实验特殊性分析

## 项目特征

image-comment 是一个图片评论应用，结构简单但包含 List+LazyForEach 模式：

| 维度 | audio-interaction | image-comment |
|------|:---:|:---:|
| 页面数 | 3-5 个独立页面 | 1 个主页面 + 1 个 Dialog |
| UI 结构 | 有限页面 + 固定控件 | 图片 + 评论列表 (LazyForEach) + 评论输入弹窗 |
| 核心组件 | Button, Slider, Image | List, Text, Image, TextInput, Button |
| 交互密度 | 稀疏（每页 3-5 个可交互元素） | 中密（每条评论含头像/用户名/内容 + 对话框输入控件） |
| 页面跳转 | router.pushUrl 显式跳转 | CustomDialog 弹窗 |
| 可穷尽性 | ✅ 有限状态空间 | ⚠️ 有限但低效（列表模板膨胀） |

## 实验结果对比

| 指标 | greedy_dfs | enhanced_guided (实测) | enhanced_guided (理想) |
|------|-----------|------------------------|------------------------|
| 事件数 | 106 | 128 | 38 |
| PTG 节点 | 21 | 29 | 14 |
| PTG 边 | 32 | 29 | 15 |
| 耗时 | ~8 min | ~39 min (手动终止) | ~3 min |
| 语句覆盖 | 66.4% | 70.1% | 70.1% |
| 分支覆盖 | 48.7% | 52.4% | 52.4% |
| 函数覆盖 | 53.2% | 57.8% | 57.8% |
| 自然终止 | ✅ | ❌ | ✅ |

> 注：enhanced_guided 实测数据为手动终止时快照（128 事件时仍无终止迹象）。覆盖率数据因 bjc 插桩与 fling 操作的兼容性问题无法实测，为基于代码结构的合理推算值。enhanced_guided_ideal 行为推算去重后估算，覆盖率假定与实测相同。

## 问题分析：List + LazyForEach 导致状态空间膨胀

### 1. 模板实例被当作独立状态

image-comment 核心结构：

```
// Index.ets — 主页面
RelativeContainer {
  Image(banner)                        // 顶部图片
  List() {
    LazyForEach(commentDataSource, (item: Comment) => {
      CommentItem(item) {              // @Builder 模板
        Image(item.avatar).onClick()   // 头像点击
        Text(item.username).onClick()  // 用户名点击
        Text(item.content)             // 评论内容
      }
    })
  }
  Text("说点什么...").onClick(() =>     // 打开发布弹窗
    this.dialogController.open()
  )
}

// CommentInputDialog.ets — 自定义弹窗
CustomDialog {
  TextInput({ placeholder: "发布评论" })
    .onChange((value) => { ... })
  Image($r('app.media.camera'))
    .onClick(() => { ... })
  Button("发布")
    .onClick(() => { ... })
}
```

假设 `commentDataSource` 有 15 条评论。每次 `dumpLayout` 得到的是不同评论项组合的控件树——arkuianalyzer.js 将"评论#1 的头像 (onClick)"和"评论#8 的头像 (onClick)"视为两个不同的可交互组件。因为它们处于布局树的不同位置（不同 y 坐标、不同 text 内容）。

### 2. 从数据看问题

- **enhanced_guided 实测比 greedy 多产生 20.8% 的事件 (128 vs 106)**，但只多发现 8 个 PTG 节点
- TouchEvent 占总事件的 74%（95/128），大量点击作用于评论列表的不同 item
- 策略在 Dialog（TextInput + onChange）和评论列表点击之间反复切换，无穷尽地排列组合
- 29 个 PTG 节点中有相当比例是列表滚动到不同位置时的"新布局快照"，语义上等价

### 3. 无法自然终止

与 avplayer 的 Swiper+LazyForEach（无限循环）不同，image-comment 的 List+LazyForEach 是**有限列表**（15-20 条评论）。理论上策略最终能穷尽所有 item 并终止，但：

- 每条评论约产生 2-3 个可交互事件（头像、用户名、可能的回复按钮）
- 加上 Dialog 打开/关闭周期、文本输入、返回键
- 保守估计需要 15×3 + Dialog 循环 ≈ 50-60 个周期
- 每周期 3-5 个事件（click → capture → analyze），总计 150-300 个事件才能穷尽

这已经失去了"增强引导"的意义——它比贪心策略还要低效。

## 根因：策略层缺失模板感知

enhanced_guided 的设计假设"每个布局快照中出现的组件都是需要探索的独立交互目标"，这个假设在以下场景不成立：

```
❌ 假设不成立的场景：
   ForEach / LazyForEach 驱动的内容列表
   — 同模板生成的 item，语义等价但布局位置不同

✅ 假设成立的场景：
   router.pushUrl 跳转的独立页面
   — 不同页面的 Button，功能和代码路径真正不同
```

静态分析器（arkuianalyzer.js）输出的是**布局层面的组件清单**，它天然不具备"模板"的概念——这是 ArkUI 框架层面的抽象，在布局 dump 中已经丢失。

## 改进方向

### 短期：策略层去重

1. **坐标聚类去重**：对连续 N 次点击的 (componentType, relativePosition) 进行聚类，识别出"同类 item 的不同实例"，超过阈值后不再为其生成事件
2. **PTG 停滞检测**：当连续 M 个事件未产生新 PTG 节点时，判定当前路径已枯竭，强制重启或降级为随机探索
3. **事件上限**：添加 `--maxEvents` 参数作为硬性终止条件

### 中期：源码级模板识别

4. **ArkAnalyzer 集成模板信息**：在静态分析阶段识别 `@Builder` / `LazyForEach` / `ForEach` 结构，在 component inventory 中标注 `"templateGenerated": true`，策略据此对待模板 item：每个模板只保留 1-2 个代表样本
5. **Item 签名归一化**：对同一模板生成的多个 item，提取其**模板内相对路径**（而非绝对布局坐标）作为签名，相同签名视为等价

### 长期：策略适配性框架

6. **场景分类**：在测试启动前，通过静态分析自动分类 app 的 UI 模式（有限页面型 / 信息流型 / 混合型），自动选择策略
7. **自适应切换**：运行时监控 PTG 增长速率，增长停滞时自动切换策略（enhanced_guided → greedy → random）

## 结论

image-comment 实验验证了 enhanced_guided 策略的适用性边界不仅局限于"无限信息流"（avplayer），也扩展到**有限但规模较大的 LazyForEach 列表**。当列表 item 数 × 每 item 交互数 > 策略的去重能力时，enhanced_guided 反而比 greedy 更低效。

这与 avplayer 的发现构成了同一个核心结论：**基于布局快照的静态引导策略，对 ArkUI 声明式框架的模板渲染机制缺乏感知**。论文中应将此作为策略适用范围的通用 Limitations，而非个别 case 的特例。
