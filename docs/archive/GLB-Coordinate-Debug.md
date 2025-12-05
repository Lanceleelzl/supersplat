# GLB模型坐标系调试指南

## 启用调试模式

在浏### 边界框计算方法对比

现在实现了两种不同的边界框计算方法：

1. **方法1 (默认)**: 直接使用worldBound
   - 使用GLB模型已计算的世界边界框
   - 优点：简单直接，worldBound已经考虑了所有变换
   - 适用：大多数情况下应该是正确的

2. **方法2 (测试)**: 局部边界框 + 世界变换
   - 类似Splat模型的处理方式
   - 计算局部边界框，然后应用实体的世界变换
   - 优点：与Splat模型保持一致的计算方式中运行以下命令来启用GLB模型的调试信息：

```javascript
// 启用GLB模型的AABB调试信息
window.GltfModel.debugAabb = true;

// 或者通过事件启用
events.invoke('debug.modelAabb.enable');
```

## 调试信息说明

启用调试后，选择GLB模型时会在控制台显示：

1. **worldBound计算**: 
   - localCenter: 局部坐标系中的中心点
   - localHalfExtents: 局部坐标系中的半长度
   - worldCenter: 世界坐标系中的中心点
   - worldHalfExtents: 世界坐标系中的半长度

2. **边界框渲染信息**:
   - boundCenter: 边界框的中心点
   - boundHalfExtents: 边界框的半长度
   - entityPosition: 实体的位置
   - entityRotation: 实体的旋转
   - entityScale: 实体的缩放

## 坐标系问题诊断

### 可能的坐标系转换问题：

1. **GLB标准坐标系**: Y向上，Z向前，X向右（右手坐标系）
2. **PlayCanvas坐标系**: Y向上，Z向前，X向右（右手坐标系）  
3. **SuperSplat场景坐标系**: 可能存在特定的相机或场景变换

### 检查步骤：

1. 加载一个简单的GLB模型（比如单位立方体）
2. 启用调试模式和边界框显示
3. 观察边界框是否与模型对齐
4. 记录控制台输出的坐标信息

### 预期现象：

如果存在坐标系问题，您会看到：
- 边界框位置偏移
- 边界框大小不匹配
- 边界框旋转不正确

### 解决方案：

根据调试信息，可能需要在边界框计算中添加坐标系转换矩阵。

## 测试命令

```javascript
// 方法1: 通过事件系统（推荐）
events.invoke('debug.modelAabb.enable');              // 启用AABB调试
events.invoke('debug.coordinateTransform.enable');    // 启用坐标系转换测试

// 方法2: 直接访问类属性
window.GltfModel.debugAabb = true;
window.GltfModel.useCoordinateTransform = true;

// 测试步骤：
// 1. 加载GLB模型
// 2. 启用调试模式
// 3. 选择模型并启用边界框显示
// 4. 观察边界框是否正确对齐
// 5. 切换坐标系转换来对比效果

// 切换边界框计算方法
events.invoke('debug.coordinateTransform.enable');   // 方法2：局部边界框 + 世界变换
events.invoke('debug.coordinateTransform.disable');  // 方法1：直接使用worldBound

// 禁用调试
events.invoke('debug.modelAabb.disable');
events.invoke('debug.coordinateTransform.disable');
```