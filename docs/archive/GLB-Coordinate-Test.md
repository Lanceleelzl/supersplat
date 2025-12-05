# GLB包围盒坐标系测试指南

## 问题描述
GLB模型的包围盒位置不正确，只有当GLB模型位置为原点时，包围盒才显示在正确位置。问题可能在于worldBound.center没有正确包含实体的世界位置。

## 测试方法

### 1. 启用调试模式
```javascript
events.invoke('debug.modelAabb.enable');
```

### 2. 测试方法1（默认）
```javascript
events.invoke('debug.coordinateTransform.disable');
```
- 直接使用`worldBound.center`
- 假设worldBound已经包含了正确的世界坐标

### 3. 测试方法2
```javascript
events.invoke('debug.coordinateTransform.enable');
```
- 使用`entity.getWorldTransform().transformPoint(bound.center)`
- 手动将bound.center变换到世界坐标

### 4. 观察调试输出
控制台会显示：
- `entityPosition`: GLB实体的位置
- `worldBoundCenter`: worldBound计算的中心点
- `method1_worldBoundDirect`: 方法1的中心点
- `method2_transformedByEntity`: 方法2的中心点

## 预期结果

正确的方法应该使包围盒：
- 显示在GLB模型的实际位置
- 当GLB模型移动时，包围盒也跟随移动
- 包围盒大小与模型匹配

## 诊断步骤

1. 加载一个GLB模型
2. 将模型移动到非原点位置
3. 选择模型并启用边界框显示
4. 使用不同方法测试：
   - 如果方法1正确：包围盒在模型位置
   - 如果方法2正确：包围盒在模型位置
   - 如果都不对：需要method3（bound.center + entity.position）

## 快速测试命令
```javascript
// 完整测试流程
events.invoke('debug.modelAabb.enable');
// 选择GLB模型
// 启用边界框显示
// 测试方法1
events.invoke('debug.coordinateTransform.disable');
// 观察包围盒位置，如果不对则测试方法2
events.invoke('debug.coordinateTransform.enable');
```