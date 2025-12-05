# GLB Model Selection Visual Feedback Implementation

## 功能概述

我已经为GLB模型实现了选择时的视觉反馈功能，当用户从列表中选择GLB模型时，会显示高亮效果，类似于高斯泼溅模型的蓝色高亮。

## 实现的功能

### 1. Outline高亮效果
- GLB模型被选中时会显示黄色轮廓高亮
- 使用与高斯泼溅模型相同的选择颜色系统
- 基于现有的outline.ts系统，已经完全支持GLB模型

### 2. 边界框显示
- 选中的GLB模型会显示白色wireframe边界框
- 只有在启用bounds显示时才会出现
- 与高斯泼溅模型的边界框行为一致

### 3. 配置系统
- 默认启用outline选择功能
- 可以通过UI设置进行开关控制
- 颜色配置与现有选择系统统一

## 修改的文件

### `src/scene-config.ts`
```typescript
show: {
    grid: true,
    bound: true,
    shBands: 3,
    outlineSelection: true  // 新增：默认启用outline选择
},
```

### `src/main.ts`
```typescript
// 初始化outline选择设置
events.fire('view.setOutlineSelection', sceneConfig.show.outlineSelection);
```

### `src/gltf-model.ts`
- 添加了`import { Mat4, Color }`
- 实现了`onPreRender()`方法
- 添加了边界框渲染逻辑

## 现有基础设施（已经支持GLB）

### `src/outline.ts`
- `addModelToOutlineLayer()` - 将GLB模型添加到outline层
- `removeModelFromOutlineLayer()` - 从outline层移除GLB模型
- `setEntityOutlineLayer()` - 递归设置实体的outline层
- 监听`selection.changed`事件，自动处理GLB模型高亮

### Selection事件系统
- UI面板选择时触发`selection.changed`事件
- Outline系统自动响应并添加/移除高亮效果
- 支持Splat和GltfModel两种类型

## 使用方法

1. **启动应用**: 运行`npm run dev`
2. **加载GLB模型**: 拖拽GLB/GLTF文件到应用中
3. **选择模型**: 点击左侧面板中的模型名称
4. **观察效果**: 
   - 模型周围出现黄色outline高亮
   - 如果启用了bounds显示，还会看到白色边界框
5. **取消选择**: 点击其他地方或其他模型，高亮效果消失

## 技术特点

- **一致性**: 与高斯泼溅模型选择效果保持一致
- **性能优化**: 只为选中的模型渲染高亮效果
- **可配置**: 支持通过设置开关outline和bounds显示
- **兼容性**: 不影响现有的高斯泼溅模型选择功能

## 预期效果

- GLB模型选中时有明显的视觉反馈
- 用户可以清楚看到哪个模型被选中
- 提供与高斯泼溅模型一致的用户体验
- 支持边界框可视化，便于理解模型尺寸和位置

## 下一步

该实现已经完成并可以使用。如果需要进一步的调整，可以考虑：
1. 调整高亮颜色或强度
2. 添加更多视觉效果选项
3. 优化大型模型的性能表现