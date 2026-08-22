# Colleague Plugin — Design System Specification

> Colleague Plugin Custom Design System
>
> This document defines the complete design specification for the colleague-plugin project, including color systems, typography, spacing, border radius, animations, component visual specs, and Tailwind CSS mapping rules. All UI code must follow this specification.

---

## Table of Contents

1. [Color Palette](#1-color-palette)
2. [Typography System](#2-typography-system)
3. [Spacing System](#3-spacing-system)
4. [Border Radius System](#4-border-radius-system)
5. [Size System](#5-size-system)
6. [Animation System](#6-animation-system)
7. [Scrollbar Specification](#7-scrollbar-specification)
8. [Global Base Styles](#8-global-base-styles)
9. [Tailwind CSS Mapping](#9-tailwind-css-mapping)
10. [Component Visual Specs](#10-component-visual-specs)
11. [Dark Mode](#11-dark-mode)

---

## 1. Color Palette

All colors are defined as CSS custom properties (CSS Variables), referenced via `var(--xxx)`.
Full Light / Dark dual-theme support.

### 1.1 CP Brand Color Series

A 10-step gray-purple gradient palette, from extremely light to extremely dark. Used for brand identity, gradients, and decorative areas.

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--cp-1` | `#eff0f6` | `#2a2a2a` | Lightest — large-area background |
| `--cp-2` | `#e5e7f0` | `#3d4150` | Light — disabled state background |
| `--cp-3` | `#d1d5e5` | `#525a77` | |
| `--cp-4` | `#b5bcd6` | `#6a749b` | Hover state |
| `--cp-5` | `#97a0c5` | `#838fba` | |
| `--cp-6` | `#7583b2` | `#a1aacb` | **Brand primary** |
| `--cp-7` | `#596590` | `#b5bcd6` | |
| `--cp-8` | `#3f4868` | `#d1d5e5` | Selected state |
| `--cp-9` | `#262c41` | `#e5e7f0` | |
| `--cp-10` | `#0d101c` | `#eff0f6` | Darkest |

### 1.2 Background Color Scale

An 11-step grayscale system, from pure white to pure black. Used for page backgrounds, card backgrounds, hover states, and disabled states.

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--bg-base` / `--bg-0` | `#ffffff` | `#0e0e0e` | **Primary background** — page/panel base |
| `--bg-1` | `#f9fafb` | `#1a1a1a` | Secondary background — cards/column headers |
| `--bg-2` | `#f2f3f5` | `#262626` | Tertiary background — chip base/control bar |
| `--bg-3` | `#e5e6eb` | `#333333` | Borders/dividers |
| `--bg-4` | `#c9cdd4` | `#404040` | |
| `--bg-5` | `#adb4c1` | `#4d4d4d` | |
| `--bg-6` | `#86909c` | `#5a5a5a` | Disabled/secondary text |
| `--bg-8` | `#4e5969` | `#737373` | |
| `--bg-9` | `#1d2129` | `#a6a6a6` | |
| `--bg-10` | `#0c0e12` | `#d9d9d9` | |
| `--bg-hover` | `#f3f4f6` | `#1f1f1f` | Hover background |
| `--bg-active` | `#e5e6eb` | `#2d2d2d` | Active/pressed background |

> **Usage rule**: Numeric keys support both `bg-*` and `border-*` semantics.

### 1.3 Text Color Scale

4-level text hierarchy, ensuring contrast readability.

| Variable | Tailwind alias | Light | Dark | Contrast | Usage |
|----------|---------------|------|------|----------|-------|
| `--text-primary` | `text-t-primary` | `#000000` | `#ffffff` | 21:1 / 19:1 | **Primary text** — titles, body |
| `--text-secondary` | `text-t-secondary` | `#454d5f` | `#ced3da` | 7.5:1 / 11:1 | Secondary text — labels, descriptions |
| `--color-text-3` | `text-t-tertiary` | `#86909c` | `#5a5a5a` | — | Tertiary hint text |
| `--text-disabled` | `text-t-disabled` | `#c9cdd4` | `#737373` | — | Disabled text |

Arco Design alignment aliases: `--color-text-1` = `--text-primary`, `--color-text-2` = `--text-secondary`.

### 1.4 Semantic Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--primary` | `#165dff` | `#4d9fff` | Primary interaction color |
| `--success` | `#00b42a` | `#23c343` | Success/completed |
| `--warning` | `#ff7d00` | `#ff9a2e` | Warning/paused |
| `--danger` | `#f53f3f` | `#f76560` | Danger/failed/delete |
| `--info` | `#165dff` | `#4d9fff` | Info hint |

### 1.5 Border Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--border-base` | `#e5e6eb` | `#333333` | **Base border** — cards/dividers |
| `--border-light` | `#f2f3f5` | `#262626` | Light border |
| `--border-special` | `var(--bg-3)` | `#60677e` | Special border |

### 1.6 Brand Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--brand` | `#7583b2` | `#a1aacb` | **Brand primary** — selected state/emphasis/Leader |
| `--brand-light` | `#eff0f6` | `#3d4150` | Brand light background |
| `--brand-hover` | `#b5bcd6` | `#6a749b` | Brand hover color |

### 1.7 Member Identity Palette

An 8-color low-saturation palette for distinguishing members in parallel views. Index 0 is fixed for the Leader (brand color).

| Index | Color value | Name | Usage |
|-------|------------|------|-------|
| 0 | `var(--brand)` | Brand | Leader (fixed) |
| 1 | `#5c9ea4` | Misty Teal | 1st member |
| 2 | `#b58a5e` | Warm Brown | 2nd member |
| 3 | `#9481bf` | Lotus Purple | 3rd member |
| 4 | `#c07d97` | Dusty Rose | 4th member |
| 5 | `#6ba07e` | Sage Green | 5th member |
| 6 | `#4f8ac9` | Misty Blue | 6th member |
| 7 | `#c99a4b` | Amber | 7th member |

**Allocation algorithm**:
1. Leader → color slot 0 (pinned)
2. Previously assigned members → retain original color slot (pinned, unaffected by other member additions/removals)
3. New members → take the smallest unoccupied non-zero color slot
4. When palette is full → cycle by modulo of length (skip 0)

**Persistence**: Stored only in localStorage, not persisted to database. Key: `team-member-colors-{teamId}`.

### 1.8 Special Colors

| Variable | Light | Dark | Usage |
|----------|-------|------|-------|
| `--fill` | `#f7f8fa` | `#1a1a1a` | Generic fill color |
| `--fill-2` | `#f2f3f5` | `#262626` | Secondary fill — avatar background |
| `--fill-3` | `#e5e6eb` | `#333333` | Tertiary fill |
| `--inverse` | `#ffffff` | `#ffffff` | Inverse color |
| `--message-user-bg` | `#e9efff` | `#1e2a3a` | User message background |
| `--message-tips-bg` | `#f0f4ff` | `#1a2333` | Tip message background |
| `--workspace-btn-bg` | `#eff0f1` | `#1f1f1f` | Workspace button background |

---

## 2. Typography System

### Body Font Stack

```css
font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC',
  'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
```

Cross-platform adaptive: macOS → SF Pro / PingFang SC; Windows → Segoe UI / Microsoft YaHei.
Rendering optimization: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`

### Monospace Font Stack

```css
font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, "Cascadia Code",
  "Roboto Mono", Consolas, "Liberation Mono", monospace;
```

Tailwind alias: `font-mono`. Used for code blocks, file paths, command-line text, version numbers.

### Font Size Scale

| Class | Pixels | Usage |
|-------|--------|-------|
| `text-9px` | 9px | Extra-small annotation — avatar badge |
| `text-10px` | 10px | Avatar initials |
| `text-11px` | 11px | Auxiliary info — timestamps, chips |
| `text-12px` | 12px | Secondary text — labels, descriptions |
| `text-13px` | 13px | **Standard body** — card titles, buttons |
| `text-14px` | 14px | Emphasized body — member names (bold) |
| `text-15px` | 15px | Title — warmup status title |
| `text-16px` | 16px | Page title |

### Font Weight

| Class | Value | Usage |
|-------|-------|-------|
| `font-500` | 500 | Button text, labels |
| `font-600` | 600 | **Standard bold** — member names, card titles |
| `font-700` | 700 | Heavy emphasis — badges, CLI initials |

---

## 3. Spacing System

Colleague Plugin uses pixel-precise spacing, not Tailwind's default 4px base multiples.
Non-standard values are registered via Tailwind `spacing.extend`:

| Value | Usage |
|-------|-------|
| `1px` | Extra-fine spacing — overlay stroke offset |
| `2px` | Fine spacing — segmented control padding |
| `4px` | Base small spacing — gap within chips |
| `6px` | Gap within chips, avatar badge offset |
| `8px` | **Standard spacing** — card padding, column gap |
| `10px` | Warmup avatar gap, chip padding |
| `12px` | Control bar gap, page padding |
| `14px` | Warmup content area gap |
| `16px` | Page title icon |
| `18px` | Status tag height |
| `20px` | Hover action button width |
| `22px` | Tab avatar size |
| `24px` | Scroll arrow circle background |
| `28px` | Edge fade indicator width |
| `32px` | Button/input height |
| `34px` | Chip height |
| `40px` | Column header height |
| `48px` | Scroll arrow mask width |

---

## 4. Border Radius System

| Class | Pixels | Usage |
|-------|--------|-------|
| `rounded-2px` | 2px | Progress bar |
| `rounded-4px` | 4px | Small labels, chips |
| `rounded-6px` | 6px | Segmented control buttons, action buttons |
| `rounded-8px` | 8px | **Standard radius** — cards, column containers, inputs |
| `rounded-999px` | 999px | **Full circle** — chips, avatars, status badges |

---

## 5. Size System

### Fixed Widths

| Value | Usage |
|-------|-------|
| `16px` | Board column header avatar, title icon |
| `22px` | Tab avatar |
| `28px` | Fade indicator width |
| `30px` | Segmented control width |
| `34px` | Chip height, warmup avatar |
| `40px` | Column header height |
| `48px` | Scroll arrow mask width |

### Minimum Widths

| Value | Usage |
|-------|-------|
| `240px` | Single chat view min-w |
| `288px` | Board column width |
| `400px` | Parallel column base width |

### Maximum Widths

| Value | Usage |
|-------|-------|
| `140px` | Model selector |
| `220px` | Chip max-w |
| `320px` | Warmup error card |
| `420px` | Warmup content area |

---

## 6. Animation System

### 6.1 wiggle

Pending permission badge (`‼️`), 3-second loop, active in first 20%.

```css
@keyframes wiggle {
  0%, 20%, 100% { transform: rotate(0deg); }
  4% { transform: rotate(8deg); }
  8% { transform: rotate(-8deg); }
  12% { transform: rotate(6deg); }
  16% { transform: rotate(-4deg); }
}
/* Class: animate-wiggle */
```

### 6.2 loading (spin)

```css
@keyframes loading { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
/* Class: loading, 1s linear infinite */
```

### 6.3 team-warmup-sweep (progress bar sweep)

```css
@keyframes team-warmup-sweep {
  0%   { width: 20%; margin-inline-start: 0; }
  50%  { width: 60%; margin-inline-start: 40%; }
  100% { width: 20%; margin-inline-start: 0; }
}
/* Class: team-warmup-sweep, 1.4s ease-in-out infinite */
```

### 6.4 team-warmup-breathe (avatar breathing)

```css
@keyframes team-warmup-breathe { 0%, 100% { opacity: 0.55; } 50% { opacity: 0.9; } }
/* Class: team-warmup-breathe, 1.6s ease-in-out infinite */
```

### 6.5 activity-card-pulse (card highlight pulse)

```css
@keyframes activity-card-pulse {
  0% { box-shadow: 0 0 0 0 var(--brand); }
  100% { box-shadow: 0 0 0 4px transparent; }
}
/* Class: activity-card-highlight, 1.4s ease-out */
```

### 6.6 Transition Duration Standards

| Duration | Usage |
|----------|-------|
| `150ms` | Color/background transition — hover/selected toggle |
| `300ms` | Scrollbar thumb transition |

---

## 7. Scrollbar Specification

```css
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: transparent; border-radius: 3px; transition: background 0.3s; }
::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.2); } /* Light */
[data-theme='dark'] ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.2); } /* Dark */
```

Hidden scrollbar: `.scrollbar-hide`

---

## 8. Global Base Styles

### Box Model + Border Baseline

```css
* { box-sizing: border-box; color: inherit; }
*, ::before, ::after { border-width: 0; border-style: solid; border-color: transparent; }
```

### Global Variables

```css
:root { --app-min-width: 360px; --titlebar-height: 36px; }
```

### Icon Alignment Fix

```css
.i-icon { display: inline-flex; align-items: center; justify-content: center; vertical-align: middle; }
```

---

## 9. Tailwind CSS Mapping

### Color Quick Reference

| Semantic | CSS variable | Tailwind prefix | Example |
|----------|-------------|-----------------|---------|
| Primary text | `--text-primary` | `text-t-primary` | `text-t-primary` |
| Secondary text | `--text-secondary` | `text-t-secondary` | `text-t-secondary` |
| Primary background | `--bg-base` | `bg-bg-base` | `bg-bg-base` |
| Secondary background | `--bg-1` | `bg-1` | `bg-1` |
| Tertiary background | `--bg-2` | `bg-2` | `bg-2` |
| Brand color | `--brand` | `brand` | `bg-brand`, `text-brand` |
| Base border | `--border-base` | `border-base` | `border-border-base` |
| Fill | `--fill-2` | `fill-2` | `bg-fill-2` |
| Inverse | `--inverse` | `inverse` | `text-inverse` |

### Inline CSS Variable References

```tsx
style={{ color: 'var(--brand)' }}
style={{ background: `color-mix(in srgb, ${memberColor} 4%, var(--bg-base))` }}
style={{ boxShadow: `0 0 0 2px ${memberColor}, 0 0 12px 2px color-mix(in srgb, ${memberColor} 45%, transparent)` }}
style={{ background: 'linear-gradient(90deg, var(--brand-hover), var(--brand))' }}
```

---

## 10. Component Visual Specs

### 10.1 TeamTabs (Member Chip Bar)

- Container: `min-h-48px bg-1 border-t/x/b border-solid border-[var(--border-base)]`
- Chip: `h-34px rounded-999px bg-[var(--bg-2)] ps-6px pe-10px max-w-220px`
- Selected: `borderColor: memberColor` (identity color border, no background change)
- Avatar: `w-22px h-22px rounded-full bg-[var(--fill-2)]`
- Member name: `text-13px font-600`, color = identity color
- Status badge: `w-8px h-8px`, overlay at avatar's bottom-right
- Scroll list: `overflow-x-auto [scrollbar-width:none]`
- Edge fades: `w-28px linear-gradient(90deg/270deg, var(--bg-1), transparent)`
- Add member: fixed right `border-s text-13px font-500`

### 10.2 AgentStatusBadge (Status Badge)

| Status | Color | Animation |
|--------|-------|-----------|
| pending / idle / completed | `bg-gray-400` | — |
| active | `bg-green-500` | `animate-pulse` |
| failed | `bg-red-500` | — |
| dormant | `bg-transparent border border-gray-400` | — |

Overlay mode: `absolute -bottom-1px -end-1px w-8px h-8px border-2 border-solid border-[var(--bg-base)]`

### 10.3 TeamViewToggle (View Toggle)

- Segmented container: `p-2px rounded-8px bg-2`
- Button: `h-26px w-30px rounded-6px`
- Selected: `bg-[var(--brand)] text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]`
- Unselected: `bg-transparent text-[var(--color-text-3)] hover:bg-[var(--bg-3)]`
- Transition: `transition-colors duration-150`

### 10.4 TeamWarmupOverlay (Initialization Overlay)

- Position: `absolute top: 41px bottom-0 start-0 end-0 z-20`
- Background: `color-mix(in srgb, var(--bg-1) 80%, transparent)`
- Blur: `backdropFilter: blur(3px)`
- Content area: `max-w-420px gap-14px px-40px py-28px`
- Avatar: `w-34px h-34px gap-10px`
- Title: `text-15px font-600 text-[var(--text-primary)]`
- Subtitle: `text-12px text-[var(--color-text-3)]`
- Progress bar: `w-180px h-4px rounded-2px`, track `bg-[var(--bg-3)]`, fill `team-warmup-sweep`
- Failed avatar: `grayscale`, `boxShadow: 0 0 0 2px var(--danger)`
- Failure badge: `w-14px h-14px rounded-full bg-[var(--danger)] text-white text-9px font-700`
- Retry button: `h-32px px-18px rounded-8px bg-[var(--brand)] text-white text-13px font-500`

### 10.5 ActivityBoardLayout (Board Columns)

- Board container: `flex h-full gap-8px overflow-auto p-8px`
- Column width: `w-288px shrink-0`
- Column container: `rounded-8px bg-2 border border-solid border-[var(--border-base)]`
- Column header: `px-10px py-8px border-b border-solid border-[var(--border-base)]`
- Column header avatar: `w-16px h-16px rounded-full bg-[var(--fill-2)]`
- Column header count: `text-11px text-[var(--color-text-3)] ms-auto`
- Column body: `flex-1 overflow-auto flex flex-col gap-8px p-8px`
- Empty state: `text-12px text-[var(--color-text-3)] text-center py-12px`

### 10.6 TaskCard (Task Card)

- Container: `rounded-8px border border-solid border-[var(--border-base)] bg-1 p-8px flex flex-col gap-6px`
- Title: `text-13px font-medium text-[var(--color-text-1)] truncate flex-1`
- Status tag: `text-11px px-6px h-18px rounded-full text-white`
- Assignee color dot: `w-8px h-8px rounded-full`
- Dependency chip: `text-11px px-6px h-18px rounded-4px`, `color-mix(var(--warning) 12%, transparent)`
- Description: `text-12px text-[var(--color-text-2)]`, collapsed to 2 lines
- Timestamp: `text-11px text-[var(--color-text-3)] ms-auto shrink-0`

### 10.7 MessageCard (Message Card)

- Container: same as TaskCard
- from→to row: `text-12px text-[var(--color-text-2)] gap-6px`
- Member chip: `w-8px h-8px rounded-full` + `truncate text-12px`
- Broadcast tag: `px-6px h-18px rounded-4px text-11px text-white bg-[var(--primary)]`
- Read/unread: `px-6px h-18px rounded-4px text-11px text-white`, success/warning
- Message body: `text-13px text-[var(--color-text-1)]`, collapsed to 3 lines

### 10.8 ActivityControlBar (Control Bar)

- Container: `flex flex-wrap gap-12px px-12px py-8px border-b bg-2`
- Segmented control: `p-2px rounded-8px bg-1`
- Button: `px-10px h-24px text-12px rounded-6px`
- Selected: `bg-[var(--brand)] text-white`

### 10.9 InterventionBar (Intervention Control Bar — Differentiated)

- Container: `border-t border-solid border-[var(--border-base)] bg-1 px-12px py-8px`
- Button base: `h-32px px-12px rounded-8px text-13px font-500 transition-colors duration-150`
- Pause: `background: var(--warning)`, text-white
- Resume: `background: var(--success)`, text-white
- Revise/Takeover/Skip: `bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-2)]`
- Input: `h-32px px-12px text-13px bg-[var(--bg-2)] border-[var(--border-base)] rounded-8px focus:border-[var(--brand)]`

### 10.10 Page Title Bar

- Height: `h-40px`
- Layout: `flex items-center justify-between px-12px border-b border-solid border-[var(--border-base)] bg-1`
- Title: `text-16px font-bold text-[var(--text-primary)]`
- Icon: `w-16px h-16px text-[var(--text-primary)]`

---

## 11. Dark Mode

Switched via `[data-theme='dark']` attribute. All CSS variables are reassigned under the Dark selector.

```html
<html data-color-scheme="default" data-theme="dark">
```

### Dark Mode Core Differences

| Dimension | Light | Dark |
|-----------|-------|------|
| Primary background | `#ffffff` | `#0e0e0e` |
| Secondary background | `#f9fafb` | `#1a1a1a` |
| Primary text | `#000000` | `#ffffff` |
| Brand color | `#7583b2` (darker) | `#a1aacb` (lighter) |
| Brand light background | `#eff0f6` (light purple) | `#3d4150` (dark purple) |
| Border | `#e5e6eb` | `#333333` |
| Scrollbar hover | `rgba(0,0,0,0.2)` | `rgba(255,255,255,0.2)` |
| Fill 0 | `#ffffff` | `rgba(255,255,255,0.08)` |

### Dark Mode Toggle Logic

```js
// Follow system
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
```

---

## Appendix: File Index

| File | Responsibility |
|------|---------------|
| `web/index.css` | CSS variable definitions + global styles + animations |
| `tailwind.config.js` | Tailwind color/spacing/radius/font-size extensions |
| `web/team-panel/identity/member-colors.ts` | Member identity palette + allocation algorithm |
| `web/team-panel/hooks/useTeamMemberColors.ts` | Member color localStorage persistence |
| `web/team-panel/components/AgentStatusBadge.tsx` | Status badge |
| `web/team-panel/components/ViewToggle.tsx` | View toggle control |
| `web/team-panel/components/TeamTabs.tsx` | Member chip bar |
| `web/team-panel/components/TeamWarmupOverlay.tsx` | Initialization overlay |
| `web/team-panel/components/ActivityBoardLayout.tsx` | Board column layout |
| `web/team-panel/components/ActivityControlBar.tsx` | Control bar |
| `web/team-panel/components/TaskCard.tsx` | Task card |
| `web/team-panel/components/MessageCard.tsx` | Message card |
| `web/team-panel/components/InterventionBar.tsx` | Intervention control bar |
| `web/team-panel/index.tsx` | TeamPage main page |
