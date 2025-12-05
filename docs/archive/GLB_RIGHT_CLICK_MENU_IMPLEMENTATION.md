# GLB模型右键菜单功能实现

## 功能概述

为SuperSplat编辑器添加了GLB模型的右键上下文菜单功能，用户可以右键点击选中的GLB模型来弹出操作菜单。

## 实现的功能

### 1. 上下文菜单 (ContextMenu)
- **文件**: `src/ui/context-menu.ts`
- **功能**: 提供右键菜单界面和交互逻辑
- **菜单项**:
  - 📋 **原位复制**: 复制选中的GLB模型并放置在附近位置
  - 🗑️ **删除模型**: 删除选中的GLB模型
  - 👁️ **隐藏模型**: 隐藏选中的GLB模型
  - 👁️‍🗨️ **显示模型**: 显示被隐藏的GLB模型

### 2. GLB模型复制功能
- **文件**: `src/editor.ts`
- **功能**: 实现GLB模型的克隆和复制逻辑
- **特性**:
  - 克隆原始实体和资产
  - 保持原有的变换、旋转、缩放属性
  - 新复制的模型在X轴偏移1个单位，便于区分
  - 自动选中新复制的模型

### 3. 样式设计
- **文件**: `src/ui/scss/context-menu.scss`
- **特性**:
  - 深色主题适配
  - 鼠标悬停效果
  - 禁用状态显示
  - 阴影和圆角边框

## 使用方法

1. **选择GLB模型**: 点击场景中的GLB模型进行选择
2. **右键操作**: 在选中的模型上右键点击
3. **选择操作**: 从弹出的上下文菜单中选择需要的操作

## 技术实现细节

### 事件系统
- 监听 `contextmenu` 事件捕获右键点击
- 监听 `selection.changed` 事件更新当前选中模型
- 触发 `model.duplicate` 事件执行复制操作

### 模型复制算法
```typescript
// 克隆实体
const clonedEntity = originalModel.entity.clone();

// 创建新的GltfModel实例
const clonedModel = new GltfModel(originalModel.asset, clonedEntity);

// 设置偏移位置
clonedModel.entity.setPosition(originalPos.x + 1, originalPos.y, originalPos.z);
```

### 菜单定位
- 自动检测屏幕边界，防止菜单超出视窗
- 动态调整菜单位置
- 点击空白区域或按ESC键自动隐藏

## 文件修改清单

1. **新增文件**:
   - `src/ui/context-menu.ts` - 上下文菜单组件
   - `src/ui/scss/context-menu.scss` - 上下文菜单样式

2. **修改文件**:
   - `src/editor.ts` - 添加GLB模型复制功能
   - `src/ui/editor.ts` - 集成上下文菜单到UI
   - `src/ui/scss/style.scss` - 导入上下文菜单样式

## 扩展性

该实现具有良好的扩展性，可以轻松添加更多菜单项：

```typescript
{
    text: '新功能',
    icon: '🔧',
    action: () => this.newFeature(),
    enabled: () => this.currentModel !== null
}
```

## 注意事项

1. 上下文菜单只在选中GLB模型时显示
2. 复制功能会在原位置偏移创建新模型
3. 所有操作都会触发相应的事件，便于其他系统响应
4. 菜单自动处理边界检测，确保不会超出屏幕范围

## 测试建议

1. 加载GLB模型到场景中
2. 选择模型后右键点击
3. 测试各个菜单功能
4. 验证复制的模型位置和属性
5. 测试菜单的边界检测功能