# avplayer-short-video 实验特殊性分析

## 项目特征

avplayer-short-video 是一个短视频播放应用，与 audio-interaction 有本质的 UI 结构差异：

| 维度 | audio-interaction | avplayer-short-video |
|------|:---:|:---:|
| 页面数 | 3-5 个独立页面 | 1个主页面 (Swiper) |
| UI 结构 | 有限页面 + 固定控件 | 无限信息流 (LazyForEach) |
| 核心组件 | Button, Slider, Image | Swiper + XComponent + VideoPlayer |
| 交互密度 | 稀疏（每页 3-5 个可交互元素） | 密集（视频卡片 + 播放控制 + 社交操作） |
| 页面跳转 | router.pushUrl 显式跳转 | Swiper 内部滑动切换 |
| 可穷尽性 | ✅ 有限状态空间 | ❌ 无限内容循环 |

## 实验结果对比

| 指标 | greedy_dfs | enhanced_guided | 差异 |
|------|-----------|-----------------|------|
| 事件数 | 1,215 | 571 | -53% |
| PTG 节点 | 22 | 7 | **-68%** |
| PTG 边 | 82 | 16 | **-80%** |
| 语句覆盖 | 56.8% | 72.5% | +15.7pp |
| 分支覆盖 | 41.3% | 57.8% | +16.5pp |
| 自然终止 | ✅ | ❌ | — |

## 问题分析：Swiper + LazyForEach 对静态引导策略的冲击

### 1. 无限布局导致事件冗余

avplayer 的核心结构是：

```
Swiper(.loop(true))
  LazyForEach(dataSource, item =>
    AVPlayerView(video) {
      VideoPlayer {
        XComponent       // 视频渲染
        Image(like)      // 点赞按钮
        Image(comment)   // 评论按钮
        Image(share)     // 分享按钮
        VideoToolBar {
          Slider         // 进度条
          Button(speed)  // 倍速
          Button(mute)   // 静音
        }
      }
    }
  )
  .cachedCount(3)    // 关键：预加载 3 页
```

`.cachedCount(3)` 使得任意时刻内存中存在 3 个视频卡片实例。每次 `dumpLayout` 得到的是不同视频 ID 的控件树，`arkuianalyzer.js` 将其视为不同的可交互组件。策略无法识别"第 N 个视频的播放按钮"与"第 N+1 个视频的播放按钮"是**语义等价**的同类交互。

后果：enhanced_guided 在几种模板化的交互模式间反复循环——优先点击新页面跳转（实际是 Swiper 滑动），然后点击每个视频卡片的工具栏按钮——循环往复永不终止。

### 2. 状态空间覆盖不足

greedy_dfs 通过遍历 PTG 图能发现 22 个不同的 UI 状态节点，而 enhanced_guided 仅触及 7 个。因为 enhanced_guided 的优先级机制偏好"通往未访问页面"的导航事件，而 Swiper 每次滑动都被识别为"新页面"，导致策略停留在这个循环中，未能均匀探索同一页面内的不同控件状态（如对话框打开时的 UI 变化）。

### 3. 无法自然终止

enhanced_guided 的终止条件是连续多次 `generateEventBasedOnStaticJsonFile` 返回 `undefined`（无可用交互）。在 avplayer 场景下，只要 Swiper 还存在下一张卡片，静态分析就能找到新的 `onClick` 目标，因此该终止条件永远不会满足。

## 改进方向

### 短期：工程层面

1. **事件上限**：为 enhanced_guided 添加 `--maxEvents` 参数，达到上限后自动退出
2. **去重机制**：对连续 N 次相同 `(componentType, callback)` 组合进行检测，超出阈值后降级为随机事件
3. **页面等价判断**：对 PTG 节点签名进行语义去重，将 Swiper 内不同 index 的同类页面合并

### 中期：策略层面

4. **混合策略**：在静态引导无效（PTG 节点增长停滞）时自动降级为 greedy 探索
5. **覆盖率导向**：将当前实时覆盖率反馈纳入事件选择，避免在已充分覆盖的代码区域重复触发

### 长期：方法论层面

6. **适用于有限页面型 app**：audio-interaction 类（router.pushUrl 跳转、固定控件集）是 enhanced_guided 的理想目标
7. **信息流型 app 需要专门策略**：Swiper/List+数据源的场景需要识别列表项的模板结构，对同类 item 只保留 1-2 个代表样本

## 结论

avplayer-short-video 实验揭示了静态引导策略的一个适用性边界：**当 app 使用无限数据源驱动的列表/Swiper 组件时，基于静态分析的引导会退化为低效的重复探索**。这不是策略本身的缺陷，而是其设计假设（"每个布局快照对应一个可穷尽的 UI 状态"）在此类场景下不成立。论文中应将此作为策略适用范围的 Limitations 讨论。
