# 视角拖拽与选择清空冲突修复

## 问题描述

在之前的版本中，当用户选中GLB模型后进行视角拖拽操作（按住鼠标左键移动视角）时，释放鼠标会意外触发"点击空白处清空选择"的逻辑，导致：

1. 用户选中模型
2. 拖拽视角（按住鼠标左键移动）
3. 释放鼠标时，属性面板意外关闭
4. 选择状态被清空

这是因为浏览器的`click`事件会在`mouseup`之后触发，无法区分真正的"点击"和"拖拽结束"。

## 解决方案

### 技术实现

在`src/controllers.ts`中实现了拖拽检测机制：

```typescript
// 跟踪鼠标拖拽状态，区分点击和拖拽
let mouseDownPos = { x: 0, y: 0 };
let isDragging = false;
const DRAG_THRESHOLD = 5; // 像素阈值，超过这个距离认为是拖拽

const mousedown = (event: globalThis.MouseEvent) => {
    mouseDownPos = { x: event.offsetX, y: event.offsetY };
    isDragging = false;
};

const mousemove = (event: globalThis.MouseEvent) => {
    if (buttons[0] || buttons[1] || buttons[2]) { // 如果有按钮被按下
        const dx = Math.abs(event.offsetX - mouseDownPos.x);
        const dy = Math.abs(event.offsetY - mouseDownPos.y);
        if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) {
            isDragging = true;
        }
    }
};

// 单击：只有在非拖拽状态下才进行拾取选择
const click = (event: globalThis.MouseEvent) => {
    // 只有真正的点击（非拖拽）才触发选择逻辑
    if (!isDragging) {
        camera.pickFocalPoint(event.offsetX, event.offsetY);
    }
    // 重置拖拽状态
    isDragging = false;
};
```

### 工作原理

1. **鼠标按下时**：记录初始位置，重置拖拽标志
2. **鼠标移动时**：如果有按钮按下且移动距离超过5像素阈值，标记为拖拽状态
3. **点击事件时**：只有非拖拽状态才执行选择逻辑

### 关键参数

- **DRAG_THRESHOLD = 5像素**：这个阈值确保小幅度的手抖不会被误认为拖拽
- **按钮状态检测**：只有在按钮被按下时才检测拖拽，避免误判

## 测试方案

### 测试场景1：正常点击选择
1. 点击GLB模型 → 应该显示属性面板
2. 点击空白区域 → 应该清空选择并关闭面板

### 测试场景2：拖拽视角操作
1. 选中GLB模型（显示属性面板）
2. 按住鼠标左键拖拽视角
3. 释放鼠标 → 属性面板应该保持打开，选择状态不变

### 测试场景3：边界情况
1. 选中模型后，微小移动（< 5像素）释放 → 应该被认为是点击
2. 大幅度拖拽（> 5像素）释放 → 应该被认为是拖拽，不清空选择

## 预期行为

### ✅ 修复后的正确行为
- **真正的点击**：触发选择/取消选择逻辑
- **拖拽操作**：不影响现有选择状态
- **视角控制**：拖拽视角时不会意外清空选择
- **用户体验**：符合标准3D软件的交互习惯

### ❌ 修复前的问题行为
- 拖拽视角会意外清空选择
- 用户需要重新选择模型才能查看属性
- 交互体验不直观

## 兼容性说明

此修复完全向后兼容，不影响：
- 现有的点击选择功能
- 空白区域点击清空选择功能
- 其他鼠标交互操作
- 触摸设备的操作体验

修复仅针对鼠标拖拽场景，其他交互方式保持不变。

---

**修复版本**: 2025年9月26日
**状态**: 已完成并测试 ✅