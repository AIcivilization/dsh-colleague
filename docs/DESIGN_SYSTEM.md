# Colleague Plugin — Design System Specification

> Colleague Plugin 自有设计规范
>
> 本文档定义了 colleague-plugin 项目的完整设计规范，包括颜色体系、字体、间距、圆角、动画、
> 组件视觉规格及 Tailwind CSS 映射规则。所有 UI 代码必须遵循本规范。

---

## 目录

1. [色板体系](#1-色板体系)
2. [字体系统](#2-字体系统)
3. [间距系统](#3-间距系统)
4. [圆角系统](#4-圆角系统)
5. [尺寸系统](#5-尺寸系统)
6. [动画系统](#6-动画系统)
7. [滚动条规范](#7-滚动条规范)
8. [全局基础样式](#8-全局基础样式)
9. [Tailwind CSS 映射](#9-tailwind-css-映射)
10. [组件视觉规格](#10-组件视觉规格)
11. [暗色模式](#11-暗色模式)

---

## 1. 色板体系

所有颜色以 CSS 自定义属性（CSS Variables）定义，通过 `var(--xxx)` 引用。
Light / Dark 双主题完整支持。

### 1.1 CP 品牌色系

10 级灰紫渐变色板，从极浅到极深。用于品牌标识、渐变、装饰性区域。

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--cp-1` | `#eff0f6` | `#2a2a2a` | 最浅 — 大面积底色 |
| `--cp-2` | `#e5e7f0` | `#3d4150` | 浅 — 禁用态背景 |
| `--cp-3` | `#d1d5e5` | `#525a77` | |
| `--cp-4` | `#b5bcd6` | `#6a749b` | 悬停态 |
| `--cp-5` | `#97a0c5` | `#838fba` | |
| `--cp-6` | `#7583b2` | `#a1aacb` | **品牌主色** |
| `--cp-7` | `#596590` | `#b5bcd6` | |
| `--cp-8` | `#3f4868` | `#d1d5e5` | 选中态 |
| `--cp-9` | `#262c41` | `#e5e7f0` | |
| `--cp-10` | `#0d101c` | `#eff0f6` | 最深 |

### 1.2 背景色阶

11 级灰阶系统，从纯白到纯黑。用于页面背景、卡片背景、悬停态、禁用态。

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--bg-base` / `--bg-0` | `#ffffff` | `#0e0e0e` | **主背景** — 页面/面板底色 |
| `--bg-1` | `#f9fafb` | `#1a1a1a` | 次级背景 — 卡片/列头 |
| `--bg-2` | `#f2f3f5` | `#262626` | 三级背景 — 胶囊底/控制栏 |
| `--bg-3` | `#e5e6eb` | `#333333` | 边框/分隔线 |
| `--bg-4` | `#c9cdd4` | `#404040` | |
| `--bg-5` | `#adb4c1` | `#4d4d4d` | |
| `--bg-6` | `#86909c` | `#5a5a5a` | 禁用/次要文字 |
| `--bg-8` | `#4e5969` | `#737373` | |
| `--bg-9` | `#1d2129` | `#a6a6a6` | |
| `--bg-10` | `#0c0e12` | `#d9d9d9` | |
| `--bg-hover` | `#f3f4f6` | `#1f1f1f` | 悬停背景 |
| `--bg-active` | `#e5e6eb` | `#2d2d2d` | 激活/按下背景 |

> **使用规则**：数字键同时支持 `bg-*` 和 `border-*` 语义。

### 1.3 文字色阶

4 级文字层次，确保对比度可读性。

| 变量 | Tailwind 别名 | Light | Dark | 对比度 | 用途 |
|------|---------------|------|------|--------|------|
| `--text-primary` | `text-t-primary` | `#000000` | `#ffffff` | 21:1 / 19:1 | **主要文字** — 标题、正文 |
| `--text-secondary` | `text-t-secondary` | `#454d5f` | `#ced3da` | 7.5:1 / 11:1 | 次要文字 — 标签、说明 |
| `--color-text-3` | `text-t-tertiary` | `#86909c` | `#5a5a5a` | — | 三级提示文字 |
| `--text-disabled` | `text-t-disabled` | `#c9cdd4` | `#737373` | — | 禁用文字 |

Arco Design 对齐别名：`--color-text-1` = `--text-primary`，`--color-text-2` = `--text-secondary`。

### 1.4 语义色

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--primary` | `#165dff` | `#4d9fff` | 主交互色 |
| `--success` | `#00b42a` | `#23c343` | 成功/已完成 |
| `--warning` | `#ff7d00` | `#ff9a2e` | 警告/暂停 |
| `--danger` | `#f53f3f` | `#f76560` | 危险/失败/删除 |
| `--info` | `#165dff` | `#4d9fff` | 信息提示 |

### 1.5 边框色

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--border-base` | `#e5e6eb` | `#333333` | **基础边框** — 卡片/分隔线 |
| `--border-light` | `#f2f3f5` | `#262626` | 浅色边框 |
| `--border-special` | `var(--bg-3)` | `#60677e` | 特殊边框 |

### 1.6 品牌色

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--brand` | `#7583b2` | `#a1aacb` | **品牌主色** — 选中态/强调/Leader |
| `--brand-light` | `#eff0f6` | `#3d4150` | 品牌浅色背景 |
| `--brand-hover` | `#b5bcd6` | `#6a749b` | 品牌悬停色 |

### 1.7 成员身份色板

8 色低饱和色板，用于多成员并行时区分身份。索引 0 固定给 Leader（品牌色）。

| 索引 | 色值 | 名称 | 用途 |
|------|------|------|------|
| 0 | `var(--brand)` | 品牌色 | Leader（固定） |
| 1 | `#5c9ea4` | 雾青 | 第 1 个 member |
| 2 | `#b58a5e` | 暖褐 | 第 2 个 member |
| 3 | `#9481bf` | 藕紫 | 第 3 个 member |
| 4 | `#c07d97` | 豆沙玫 | 第 4 个 member |
| 5 | `#6ba07e` | 灰绿 | 第 5 个 member |
| 6 | `#4f8ac9` | 雾蓝 | 第 6 个 member |
| 7 | `#c99a4b` | 琥珀 | 第 7 个 member |

**分配算法**：
1. Leader → 色号 0（钉死）
2. 已分配过的成员 → 沿用原色号（钉死，不受其他成员增删影响）
3. 新成员 → 取当前未占用的最小非 0 色号
4. 色板占满后 → 对长度取模循环（跳过 0）

**持久化**：仅存 localStorage，不落库。键名：`team-member-colors-{teamId}`。

### 1.8 特殊色

| 变量 | Light | Dark | 用途 |
|------|-------|------|------|
| `--fill` | `#f7f8fa` | `#1a1a1a` | 通用填充色 |
| `--fill-2` | `#f2f3f5` | `#262626` | 二级填充 — 头像底色 |
| `--fill-3` | `#e5e6eb` | `#333333` | 三级填充 |
| `--inverse` | `#ffffff` | `#ffffff` | 反色 |
| `--message-user-bg` | `#e9efff` | `#1e2a3a` | 用户消息背景 |
| `--message-tips-bg` | `#f0f4ff` | `#1a2333` | 提示信息背景 |
| `--workspace-btn-bg` | `#eff0f1` | `#1f1f1f` | 工作区按钮背景 |

---

## 2. 字体系统

### 正文字体栈

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

跨平台自适应：macOS → SF Pro / PingFang SC；Windows → Segoe UI / Microsoft YaHei。
渲染优化：`-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`

### 等宽字体栈

```css
font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Code",
  "Roboto Mono", Consolas, "Liberation Mono", monospace;
```

Tailwind 别名：`font-mono`。用于代码块、文件路径、命令行文本、版本号。

### 字号阶梯

| 类名 | 像素 | 用途 |
|------|------|------|
| `text-9px` | 9px | 极小标注 — 头像角标 |
| `text-10px` | 10px | 头像首字母 |
| `text-11px` | 11px | 辅助信息 — 时间戳、chip |
| `text-12px` | 12px | 次要文字 — 标签、描述 |
| `text-13px` | 13px | **正文标准** — 卡片标题、按钮 |
| `text-14px` | 14px | 强调正文 — 成员名（粗体） |
| `text-15px` | 15px | 标题 — warmup 状态标题 |
| `text-16px` | 16px | 页面标题 |

### 字重

| 类名 | 值 | 用途 |
|------|----|------|
| `font-500` | 500 | 按钮文字、标签 |
| `font-600` | 600 | **标准粗体** — 成员名、卡片标题 |
| `font-700` | 700 | 重度强调 — 角标、CLI 首字母 |

---

## 3. 间距系统

Colleague Plugin 使用像素级精确间距，不使用 Tailwind 默认的 4px 基数倍数。
以下非标准值通过 Tailwind `spacing.extend` 注册：

| 值 | 用途 |
|----|------|
| `1px` | 极细间隔 — overlay 描边偏移 |
| `2px` | 细间隔 — 分段控件 padding |
| `4px` | 基础小间隔 — 胶囊内元素 gap |
| `6px` | 胶囊内 gap、头像角标偏移 |
| `8px` | **标准间隔** — 卡片 padding、列间 gap |
| `10px` | warmup 头像 gap、胶囊 padding |
| `12px` | 控制栏 gap、页面 padding |
| `14px` | warmup 内容区 gap |
| `16px` | 页面标题图标 |
| `18px` | 状态标签高度 |
| `20px` | hover 操作按钮宽 |
| `22px` | tab 头像尺寸 |
| `24px` | 滚动箭头圆背景 |
| `28px` | 两侧渐隐提示宽 |
| `32px` | 按钮/输入框高度 |
| `34px` | 胶囊高度 |
| `40px` | 列抬头高度 |
| `48px` | 滚动箭头遮罩宽 |

---

## 4. 圆角系统

| 类名 | 像素 | 用途 |
|------|------|------|
| `rounded-2px` | 2px | 进度条 |
| `rounded-4px` | 4px | 小标签、chip |
| `rounded-6px` | 6px | 分段控件按钮、操作按钮 |
| `rounded-8px` | 8px | **标准圆角** — 卡片、列容器、输入框 |
| `rounded-999px` | 999px | **全圆** — 胶囊、头像、状态徽章 |

---

## 5. 尺寸系统

### 固定宽度

| 值 | 用途 |
|----|------|
| `16px` | 看板列头头像、标题图标 |
| `22px` | tab 头像 |
| `28px` | 渐隐提示宽 |
| `30px` | 分段控件宽 |
| `34px` | 胶囊高、warmup 头像 |
| `40px` | 列抬头高 |
| `48px` | 滚动箭头遮罩宽 |

### 最小宽度

| 值 | 用途 |
|----|------|
| `240px` | 单聊视图 min-w |
| `288px` | 看板列宽 |
| `400px` | 并行列基础宽 |

### 最大宽度

| 值 | 用途 |
|----|------|
| `140px` | 模型选择器 |
| `220px` | 胶囊 max-w |
| `320px` | warmup 错误卡 |
| `420px` | warmup 内容区 |

---

## 6. 动画系统

### 6.1 wiggle（摇摆）

pending permission 角标（`‼️`），3 秒循环，前 20% 活跃。

```css
@keyframes wiggle {
  0%, 20%, 100% { transform: rotate(0deg); }
  4% { transform: rotate(8deg); }
  8% { transform: rotate(-8deg); }
  12% { transform: rotate(6deg); }
  16% { transform: rotate(-4deg); }
}
/* 类名: animate-wiggle */
```

### 6.2 loading（旋转）

```css
@keyframes loading { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
/* 类名: loading, 1s linear infinite */
```

### 6.3 team-warmup-sweep（进度条扫动）

```css
@keyframes team-warmup-sweep {
  0%   { width: 20%; margin-inline-start: 0; }
  50%  { width: 60%; margin-inline-start: 40%; }
  100% { width: 20%; margin-inline-start: 0; }
}
/* 类名: team-warmup-sweep, 1.4s ease-in-out infinite */
```

### 6.4 team-warmup-breathe（头像呼吸）

```css
@keyframes team-warmup-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
/* 类名: team-warmup-breathe, 1.6s ease-in-out infinite */
```

### 6.5 activity-card-pulse（卡片高亮脉冲）

```css
@keyframes activity-card-pulse {
  0% { box-shadow: 0 0 0 0 var(--brand); }
  100% { box-shadow: 0 0 0 4px transparent; }
}
/* 类名: activity-card-highlight, 1.4s ease-out */
```

### 6.6 过渡时长标准

| 时长 | 用途 |
|------|------|
| `150ms` | 颜色/背景过渡 — hover/选中态切换 |
| `300ms` | 滚动条 thumb 过渡 |

---

## 7. 滚动条规范

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; transition: background 0.3s; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); } /* Light */
[data-theme='dark'] ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); } /* Dark */
```

隐藏滚动条：`.scrollbar-hide`

---

## 8. 全局基础样式

### 盒模型 + 边框基线

```css
* { box-sizing: border-box; color: inherit; }
*, ::before, ::after { border-width: 0; border-style: solid; border-color: transparent; }
```

### 全局变量

```css
:root { --app-min-width: 360px; --titlebar-height: 36px; }
```

### 图标对齐修正

```css
.i-icon { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
```

---

## 9. Tailwind CSS 映射

### 颜色速查

| 语义 | CSS 变量 | Tailwind 前缀 | 示例 |
|------|---------|---------------|------|
| 主文字 | `--text-primary` | `text-t-primary` | `text-t-primary` |
| 次文字 | `--text-secondary` | `text-t-secondary` | `text-t-secondary` |
| 主背景 | `--bg-base` | `bg-bg-base` | `bg-bg-base` |
| 次背景 | `--bg-1` | `bg-1` | `bg-1` |
| 三级背景 | `--bg-2` | `bg-2` | `bg-2` |
| 品牌色 | `--brand` | `brand` | `bg-brand`, `text-brand` |
| 基础边框 | `--border-base` | `border-base` | `border-border-base` |
| 填充 | `--fill-2` | `fill-2` | `bg-fill-2` |
| 反色 | `--inverse` | `inverse` | `text-inverse` |

### 内联 CSS 变量引用

```tsx
style={{ color: 'var(--brand)' }}
style={{ background: `color-mix(in srgb, ${memberColor} 4%, var(--bg-base))` }}
style={{ boxShadow: `0 0 0 2px ${memberColor}, 0 0 12px 2px color-mix(in srgb, ${memberColor} 45%, transparent)` }}
style={{ background: 'linear-gradient(90deg, var(--brand-hover), var(--brand))' }}
```

---

## 10. 组件视觉规格

### 10.1 TeamTabs（成员胶囊栏）

- 容器: `min-h-48px bg-1 border-t/x/b border-solid border-[var(--border-base)]`
- 胶囊: `h-34px rounded-999px bg-[var(--bg-2)] ps-6px pe-10px max-w-220px`
- 选中态: `borderColor: memberColor`（身份色边框，不改底色）
- 头像: `w-22px h-22px rounded-full bg-[var(--fill-2)]`
- 成员名: `text-13px font-600`，颜色 = 身份色
- 状态徽章: `w-8px h-8px`，overlay 在头像右下角
- 滚动列表: `overflow-x-auto [scrollbar-width:none]`
- 两侧渐隐: `w-28px linear-gradient(90deg/270deg, var(--bg-1), transparent)`
- 添加成员: 右侧固定 `border-s text-13px font-500`

### 10.2 AgentStatusBadge（状态徽章）

| 状态 | 颜色 | 动画 |
|------|------|------|
| pending / idle / completed | `bg-gray-400` | — |
| active | `bg-green-500` | `animate-pulse` |
| failed | `bg-red-500` | — |
| dormant | `bg-transparent border border-gray-400` | — |

overlay 模式: `absolute -bottom-1px -end-1px w-8px h-8px border-2 border-solid border-[var(--bg-base)]`

### 10.3 TeamViewToggle（视图切换）

- 分段容器: `p-2px rounded-8px bg-2`
- 按钮: `h-26px w-30px rounded-6px`
- 选中: `bg-[var(--brand)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]`
- 未选中: `bg-transparent text-[var(--color-text-3)] hover:bg-[var(--bg-3)]`
- 过渡: `transition-colors duration-150`

### 10.4 TeamWarmupOverlay（初始化遮罩）

- 定位: `absolute top: 41px bottom-0 start-0 end-0 z-20`
- 背景: `color-mix(in srgb, var(--bg-1) 80%, transparent)`
- 模糊: `backdropFilter: blur(3px)`
- 内容区: `max-w-420px gap-14px px-40px py-28px`
- 头像: `w-34px h-34px gap-10px`
- 标题: `text-15px font-600 text-[var(--text-primary)]`
- 副标题: `text-12px text-[var(--color-text-3)]`
- 进度条: `w-180px h-4px rounded-2px`, 轨道 `bg-[var(--bg-3)]`, 填充 `team-warmup-sweep`
- 失败头像: `grayscale`, `boxShadow: 0 0 0 2px var(--danger)`
- 失败角标: `w-14px h-14px rounded-full bg-[var(--danger)] text-white text-9px font-700`
- 重试按钮: `h-32px px-18px rounded-8px bg-[var(--brand)] text-white text-13px font-500`

### 10.5 ActivityBoardLayout（看板列）

- 看板容器: `flex h-full gap-8px overflow-auto p-8px`
- 列宽: `w-288px shrink-0`
- 列容器: `rounded-8px bg-2 border border-solid border-[var(--border-base)]`
- 列头: `px-10px py-8px border-b border-solid border-[var(--border-base)]`
- 列头头像: `w-16px h-16px rounded-full bg-[var(--fill-2)]`
- 列头计数: `text-11px text-[var(--color-text-3)] ms-auto`
- 列身: `flex-1 overflow-auto flex flex-col gap-8px p-8px`
- 空状态: `text-12px text-[var(--color-text-3)] text-center py-12px`

### 10.6 TaskCard（任务卡片）

- 容器: `rounded-8px border border-solid border-[var(--border-base)] bg-1 p-8px flex flex-col gap-6px`
- 标题: `text-13px font-medium text-[var(--color-text-1)] truncate flex-1`
- 状态标签: `text-11px px-6px h-18px rounded-full text-white`
- 负责人色点: `w-8px h-8px rounded-full`
- 依赖 chip: `text-11px px-6px h-18px rounded-4px`, `color-mix(var(--warning) 12%, transparent)`
- 描述: `text-12px text-[var(--color-text-2)]`, 折叠 2 行
- 时间: `text-11px text-[var(--color-text-3)] ms-auto shrink-0`

### 10.7 MessageCard（消息卡片）

- 容器: 同 TaskCard
- from→to 行: `text-12px text-[var(--color-text-2)] gap-6px`
- 成员 chip: `w-8px h-8px rounded-full` + `truncate text-12px`
- 广播标签: `px-6px h-18px rounded-4px text-11px text-white bg-[var(--primary)]`
- 已读/未读: `px-6px h-18px rounded-4px text-11px text-white`, success/warning
- 消息体: `text-13px text-[var(--color-text-1)]`, 折叠 3 行

### 10.8 ActivityControlBar（控制栏）

- 容器: `flex flex-wrap gap-12px px-12px py-8px border-b bg-2`
- 分段控件: `p-2px rounded-8px bg-1`
- 按钮: `px-10px h-24px text-12px rounded-6px`
- 选中: `bg-[var(--brand)] text-white`

### 10.9 InterventionBar（介入控制栏 — 差异化）

- 容器: `border-t border-solid border-[var(--border-base)] bg-1 px-12px py-8px`
- 按钮基类: `h-32px px-12px rounded-8px text-13px font-500 transition-colors duration-150`
- 暂停: `background: var(--warning)`, text-white
- 恢复: `background: var(--success)`, text-white
- 修正/接管/跳过: `bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-2)]`
- 输入框: `h-32px px-12px text-13px bg-[var(--bg-2)] border-[var(--border-base)] rounded-8px focus:border-[var(--brand)]`

### 10.10 页面标题栏

- 高度: `h-40px`
- 布局: `flex items-center justify-between px-12px border-b border-solid border-[var(--border-base)] bg-1`
- 标题: `text-16px font-bold text-[var(--text-primary)]`
- 图标: `w-16px h-16px text-[var(--text-primary)]`

---

## 11. 暗色模式

通过 `[data-theme='dark']` 属性切换。所有 CSS 变量在 Dark 选择器下重新赋值。

```html
<html data-color-scheme="default" data-theme="dark">
```

### 暗色模式核心差异

| 维度 | Light | Dark |
|------|-------|------|
| 主背景 | `#ffffff` | `#0e0e0e` |
| 次背景 | `#f9fafb` | `#1a1a1a` |
| 主文字 | `#000000` | `#ffffff` |
| 品牌色 | `#7583b2`（偏深） | `#a1aacb`（偏浅） |
| 品牌浅色背景 | `#eff0f6`（浅紫底） | `#3d4150`（深紫底） |
| 边框 | `#e5e6eb` | `#333333` |
| 滚动条 hover | `rgba(0,0,0,0.2)` | `rgba(255,255,255,0.2)` |
| 填充色 0 | `#ffffff` | `rgba(255,255,255,0.08)` |

### 暗色模式切换逻辑

```js
// 跟随系统
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
```

---

## 附录：文件索引

| 文件 | 职责 |
|------|------|
| `web/index.css` | CSS 变量定义 + 全局样式 + 动画 |
| `tailwind.config.js` | Tailwind 颜色/间距/圆角/字号扩展 |
| `web/team-panel/identity/member-colors.ts` | 成员身份色板 + 分配算法 |
| `web/team-panel/hooks/useTeamMemberColors.ts` | 成员色 localStorage 持久化 |
| `web/team-panel/components/AgentStatusBadge.tsx` | 状态徽章 |
| `web/team-panel/components/ViewToggle.tsx` | 视图切换控件 |
| `web/team-panel/components/TeamTabs.tsx` | 成员胶囊栏 |
| `web/team-panel/components/TeamWarmupOverlay.tsx` | 初始化遮罩 |
| `web/team-panel/components/ActivityBoardLayout.tsx` | 看板列布局 |
| `web/team-panel/components/ActivityControlBar.tsx` | 控制栏 |
| `web/team-panel/components/TaskCard.tsx` | 任务卡片 |
| `web/team-panel/components/MessageCard.tsx` | 消息卡片 |
| `web/team-panel/components/InterventionBar.tsx` | 介入控制栏 |
| `web/team-panel/index.tsx` | TeamPage 主页面 |
