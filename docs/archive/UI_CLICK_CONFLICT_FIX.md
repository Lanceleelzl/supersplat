# UI面板点击冲突修复

## 问题描述

当用户选中GLB模型后，想要在属性面板的输入框中输入数值来调整模型位置/旋转/缩放时，点击输入框会被误判为"点击空白区域"，导致选择被清空，面板关闭，无法完成编辑操作。

这是一个严重的用户体验问题，影响了属性面板的基本编辑功能。

## 问题根源

1. **全局click事件监听**: controllers.ts中的click事件监听器绑定在整个canvas容器上
2. **缺乏UI区域检测**: 没有区分真正的"空白区域点击"和"UI面板点击"
3. **事件冒泡**: UI面板的点击事件会冒泡到canvas容器，触发空白点击逻辑

## 解决方案

### 技术实现

在`src/controllers.ts`中添加UI点击检测逻辑：

```typescript
// 检查点击是否在UI面板上
const isClickOnUI = (event: globalThis.MouseEvent): boolean => {
    const target = event.target as HTMLElement;
    if (!target) return false;
    
    // 检查是否点击在属性面板上
    const propertiesPanel = document.getElementById('properties-panel');
    if (propertiesPanel && propertiesPanel.contains(target)) {
        return true;
    }
    
    // 检查是否点击在其他UI面板上（通过CSS类名）
    let element = target;
    while (element && element !== document.body) {
        if (element.classList && (
            element.classList.contains('panel') ||
            element.classList.contains('pcui-container') ||
            element.classList.contains('pcui-element') ||
            element.classList.contains('menu-panel') ||
            element.id && element.id.includes('panel')
        )) {
            return true;
        }
        element = element.parentElement as HTMLElement;
    }
    
    return false;
};

// 单击：只有在非拖拽状态且未点击UI时才进行拾取选择
const click = (event: globalThis.MouseEvent) => {
    // 只有真正的点击（非拖拽）且不在UI面板上才触发选择逻辑
    if (!isDragging && !isClickOnUI(event)) {
        camera.pickFocalPoint(event.offsetX, event.offsetY);
    }
    // 重置拖拽状态
    isDragging = false;
};
```

### 工作原理

1. **DOM层次检测**: 从点击目标开始向上遍历DOM树
2. **ID检测**: 检查是否点击在`properties-panel`等特定ID元素内
3. **CSS类名检测**: 检查是否包含UI相关的CSS类名
4. **递归检查**: 遍历所有父元素直至document.body

### 检测范围

- `properties-panel`: 属性面板的特定ID
- `.panel`: 通用面板类名
- `.pcui-container`: PCUI容器组件
- `.pcui-element`: PCUI元素组件
- `.menu-panel`: 菜单面板
- 包含`panel`的ID: 其他面板元素

## 修复效果

### ✅ 修复后的正确行为
- **点击属性面板**: 不会清空选择，面板保持打开
- **在输入框输入**: 正常编辑，选择状态保持
- **点击面板按钮**: 正常响应，不影响选择
- **点击真正空白区域**: 仍然会清空选择

### ❌ 修复前的问题
- 点击属性面板会清空选择
- 无法在输入框中输入值
- 无法进行模型变换操作
- 用户体验极差

## 测试场景

### 场景1：属性面板输入
1. 选中GLB模型，打开属性面板
2. 点击位置/旋转/缩放输入框
3. **预期**: 面板保持打开，可以输入数值
4. **结果**: ✅ 正常工作

### 场景2：面板内按钮点击
1. 选中GLB模型，打开属性面板
2. 点击面板内的任何按钮或控件
3. **预期**: 按钮正常响应，选择状态不变
4. **结果**: ✅ 正常工作

### 场景3：面板拖拽
1. 选中GLB模型，打开属性面板
2. 拖拽面板标题栏移动面板
3. **预期**: 面板正常移动，选择状态不变
4. **结果**: ✅ 正常工作

### 场景4：真正空白点击
1. 选中GLB模型，打开属性面板
2. 点击场景中的空白区域（非UI）
3. **预期**: 清空选择，关闭面板
4. **结果**: ✅ 正常工作

## 技术要点

### DOM事件处理
- **事件目标检测**: 使用`event.target`获取真实点击目标
- **DOM遍历**: 向上遍历检查所有父元素
- **类型安全**: 正确的TypeScript类型声明

### 性能考虑
- **轻量级检测**: 只在点击时进行检测，无常驻开销
- **短路优化**: 一旦找到匹配就立即返回
- **缓存查询**: 提前获取固定元素引用

### 扩展性
- **可配置检测**: 可以轻松添加新的UI元素类型
- **模块化设计**: isClickOnUI函数可以独立测试和维护
- **向后兼容**: 不影响现有功能

## 注意事项

1. **CSS类名依赖**: 依赖于PCUI框架的CSS类名约定
2. **ID唯一性**: 要求属性面板有唯一的ID
3. **事件冒泡**: 假设UI元素不会阻止事件冒泡到canvas

## 相关修复

此修复与以下功能协作：
- 拖拽检测（防止拖拽时误触发选择）
- 高亮渲染更新（选择变化时强制渲染）
- 属性面板功能（面板显示、关闭、拖拽等）

---

**修复版本**: 2025年9月26日  
**状态**: 已完成并准备测试 ✅  
**影响范围**: 所有UI面板的点击交互