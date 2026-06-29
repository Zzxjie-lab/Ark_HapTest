# Projects 环境兼容性筛选报告

**日期**: 2026-06-27
**环境**: hvigorw.bat 6.22.7, DevEco SDK API 22, Phone_API20 模拟器 (x86), hdc 3.2.0c

## 总览

| # | 项目 | 构建 | 安装 | 启动 | 状态 |
|---|------|:----:|:----:|:----:|:----:|
| 1 | HelloArkTS | ✅ | ✅ | ✅ | **兼容** |
| 2 | avplayer-short-video | ✅ | ✅ | ✅ | **兼容** |
| 3 | image-comment | ✅ | ✅ | ✅ | **兼容** |
| 4 | page_settings | ✅* | ✅ | ✅ | **兼容** (需 ohpm install) |
| 5 | HM_VideoPlay | ✅** | ✅ | ✅ | **兼容** (需修改配置) |
| 6 | APILevelAdapt | ❌ | — | — | **不兼容** |
| 7 | Weather | ❌ | — | — | **不兼容** |

\* page_settings 需要先运行 `ohpm install` 安装本地模块依赖 (common, settingItems)
\** HM_VideoPlay 需要将 build-profile.json5 中的 SDK 版本从旧格式改为新格式

---

## 各项目详情

### 1. HelloArkTS ✅
- **bundleName**: com.example.helloarkts
- **Ability**: EntryAbility
- **页面**: 1 (pages/Index)
- **备注**: 最简单的项目，无任何依赖问题

### 2. avplayer-short-video ✅
- **bundleName**: com.example.avplayershortvideo
- **Ability**: EntryAbility
- **页面**: 2 (Index + AVPlayerView 子组件)
- **备注**: targetSdk 5.1.0(18)，有少量 ArkTS 警告但编译通过

### 3. image-comment ✅
- **bundleName**: com.example.imagecomment
- **Ability**: EntryAbility
- **页面**: 1 (pages/Index, 组件名 ImageCommentView)
- **备注**: targetSdk 5.0.5(17)，无任何问题

### 4. page_settings ✅
- **bundleName**: ohos.samples.settings
- **Ability**: EntryAbility
- **页面**: 1 主页面 + 4 个 NavDestination (设置项: WLAN, NFC, 更多连接等)
- **结构**: 多模块 (products/default + common + features/settingitems)
- **修复**: 需运行 `ohpm install` 安装本地 HAR 依赖
- **ohpm 路径**: `E:\OpenHarmony\DevEco6\DevEco Studio\tools\ohpm\bin\ohpm.bat`
- **注意**: ohpm 需通过 `cmd //c` 调用，Git Bash 中有路径编码问题

### 5. HM_VideoPlay ✅
- **bundleName**: net.openvally.videoplay
- **Ability**: EntryAbility
- **页面**: 2 (Index + ThumbnailGet)
- **原始问题**: build-profile.json5 使用旧格式配置
- **修复内容**:
  1. `compileSdkVersion`: `20` → `"6.0.2(22)"` (数字→字符串)
  2. `compatibleSdkVersion`: 删除重复键，保持 `"6.0.0(20)"`
  3. `runtimeOS`: `"OpenHarmony"` → `"HarmonyOS"` (DevEco SDK 无 OpenHarmony 组件)
- **注意**: 签名证书路径 (`C:/Users/TT/...`) 不存在，HAP 未签名但仍可安装运行

### 6. APILevelAdapt ❌
- **bundleName**: com.example.apiadapt
- **页面**: 6 (Index + 5 个 NavPathStack 路由)
- **失败原因**: 缺失原生依赖 `libboundscheck`
  - CMakeLists.txt 引用 `entry/src/main/cpp/libboundscheck/` 目录
  - 该目录不存在，导致编译时找不到 `securec.h`
  - 当前环境的 SDK (DevEco 6.0.2 及 SDK6/20) 均不包含此库
- **修复建议**: 从原始项目源获取 libboundscheck 库，或移除 C++ 原生模块

### 7. Weather ❌
- **bundleName**: ohos.samples.weather
- **Ability**: MainAbility
- **页面**: 3 路由 (Home, CityList, AddCity) + 10 子组件
- **失败原因**: 58 个 ArkTS 编译错误 + 182 个警告
  - `arkts-no-any-unknown`: 多处使用 `any`/`unknown` 类型
  - `arkts-no-props-by-index`: 对象索引访问
  - `arkts-no-globalthis`: 使用了 `globalThis`
  - 大量 `$r()` 资源引用无法解析
  - Canvas API (`addColorStop`, `save`, `beginPath` 等) 不可用
  - 大量已弃用 API (`pushUrl`, `back`, `getStringValue`, `matchMediaSync` 等)
- **修复建议**: 项目需要大量迁移工作才能适配新版 ArkTS 严格模式编译器
