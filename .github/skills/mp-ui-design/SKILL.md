---
name: mp-ui-design
description: "Design and style WeChat mini-program UI for Jupiter 木星小女巫. Use when: building new pages, creating components, styling interfaces, beautifying UI, updating layouts, or any SCSS/visual design work in this Taro mini-program project."
---

# 微信小程序 UI 设计（木星小女巫）

本 Skill 指导在 Taro + React 微信小程序中创建高质量、风格统一的界面。

## 设计方向

**美学定位**：温暖大地色系 + 柔和玻璃拟态，营造占星/神秘学的沉静氛围。
整体风格应如同一本精致的手工占星笔记本——温润、有质感、不浮夸。

## 设计令牌（Design Tokens）

所有新组件/页面必须遵循以下设计系统：

### 色彩

| 用途 | 值 |
|------|---|
| 主强调色 | `#c97b6e`（赤陶红） |
| 辅助强调 | `#e8a882`（暖棕） |
| 深色文字 | `#3d1c0a` |
| 标题文字 | `#7a3520` |
| 页面背景 | `linear-gradient(160deg, #f5ece0, #fdf6ee)` |
| 卡片/容器 | `rgba(255, 255, 255, 0.72)` 或 `#fff`（需要不透明时） |
| 弱化文字 | `rgba(61, 28, 10, 0.38)`~`rgba(61, 28, 10, 0.85)` 不透明度梯度 |
| 边框 | `rgba(185, 110, 80, 0.18)`~`rgba(185, 110, 80, 0.25)` |
| 按钮渐变 | `linear-gradient(135deg, #c97b6e, #e8a882)` |

### 圆角

| 场景 | 值 |
|------|---|
| 胶囊按钮/标签 | `999rpx` |
| 卡片/容器 | `24rpx` |
| 菜单项 | `20rpx` |
| 输入框 | `16rpx` |

### 字号

| 层级 | 大小 |
|------|------|
| 大标题（H1） | `34rpx` `font-weight: 700` |
| 中标题（H2） | `32rpx` `font-weight: 700` |
| 小标题（H3） | `30rpx` `font-weight: 700` |
| 正文 | `28-30rpx` `line-height: 1.7-1.8` |
| 标签/导航 | `22-26rpx` |

### 阴影

```scss
// 卡片柔和阴影
box-shadow: 0 2px 14px rgba(180, 90, 60, 0.08);
// 底部导航阴影
box-shadow: 0 -2px 14px rgba(180, 90, 60, 0.1);
```

## 平台限制（微信小程序）

以下是与 Web 前端的关键差异，设计时必须遵守：

1. **无自定义字体** — 不支持 `@font-face`，只能使用系统字体。通过 `font-weight`、`letter-spacing`、`color` 制造字体层次感。
2. **有限的 CSS 动画** — 仅支持 `transition` 和简单 `@keyframes`。用 `opacity`、`transform` 实现过渡即可，不要使用复杂动画。
3. **WXSS 不是 CSS** — 使用 `rpx` 单位（750rpx = 屏幕宽度）。不支持 `calc()` 嵌套、`CSS Grid` 支持有限，优先使用 `flex` 布局。
4. **组件受限** — 使用 Taro 组件（`View`、`Text`、`ScrollView`、`Image`、`Picker`），不要用 HTML 标签。
5. **`ScrollView` 不能嵌套** — 避免在已有 `ScrollView` 的页面内再放 `ScrollView`。
6. **层叠问题** — 背景半透明容器上的子元素可能出现文字重叠，需确保容器有 `z-index` 和不透明背景。
7. **无 hover 状态** — 移动端无鼠标，不要设计 hover 效果。用 `active` 态代替。

## Markdown 内容渲染规范

报告类内容统一使用以下样式：

```scss
// H1：左边框强调
.md-h1 {
  padding: 8rpx 0 8rpx 20rpx;
  border-left: 6rpx solid #c97b6e;
  margin: 28rpx 0 16rpx;
}
.md-h1 Text { font-size: 34rpx; font-weight: 700; color: #7a3520; }

// H2：背景色块
.md-h2 {
  background: rgba(185, 110, 80, 0.1);
  border-left: 5rpx solid #b96e50;
  padding: 10rpx 20rpx;
  border-radius: 0 10rpx 10rpx 0;
  margin: 24rpx 0 12rpx;
}
.md-h2 Text { font-size: 32rpx; font-weight: 700; color: #3d1c0a; }

// H3：菱形标记
.md-h3 { display: flex; align-items: baseline; margin: 20rpx 0 8rpx; }
.md-h3-bullet { font-size: 20rpx; color: #b96e50; margin-right: 8rpx; }

// 列表项
.md-bullet { display: flex; align-items: flex-start; padding-left: 8rpx; margin: 6rpx 0; }
.md-bullet-dot { color: #c97b6e; margin-right: 10rpx; font-size: 26rpx; }
```

## 设计原则

1. **温度感** — 用暖色调和柔和圆角传递亲和力，避免冰冷的灰蓝色系。
2. **呼吸感** — 给内容充足的 `padding` 和 `margin`，不要拥挤。卡片间距 `28rpx`+。
3. **层次感** — 用不透明度梯度（而非字号变化）建立文字层级：标题 100%、正文 85%、辅助文字 45%。
4. **一致性** — 所有交互元素（按钮、标签）使用同一个渐变 `linear-gradient(135deg, #c97b6e, #e8a882)`。
5. **克制** — 不要过度装饰。一个页面最多一个视觉焦点（如渐变按钮或头像光环）。

## 禁止事项

- 不要使用蓝色、紫色渐变或冷色调
- 不要使用 `Inter`、`Roboto`、`Arial` 等与本应用气质不符的西文字体名
- 不要使用 `px` 单位（用 `rpx`）
- 不要使用嵌套 `ScrollView`
- 不要让文字放在半透明背景上而不处理可读性
