# GLB包围盒坐标修复测试

## 当前状态

从您的控制台输出可以看到GLB模型（zbjz_综合楼.glb）已经成功加载，但包围盒位置不正确。

## 修复方案

我已经实现了强制调试输出，现在包围盒渲染时会自动显示所有三种坐标计算方法的结果。

### 测试步骤

1. **加载GLB模型**（您已经完成）

2. **选择GLB模型并启用边界框显示**
   - 在左侧面板点击GLB模型名称选择它
   - 启用边界框显示（如果尚未启用）

3. **观察控制台输出**
   现在应该会看到类似这样的调试信息：
   ```
   🔍 DEBUG: GLB Bounding box methods comparison
   {
     filename: "zbjz_综合楼.glb",
     entityPosition: "x, y, z",
     worldBoundCenter: "x, y, z", 
     method1_worldBoundDirect: "x, y, z",
     method2_transformedByEntity: "x, y, z",
     method3_boundPlusEntityPos: "x, y, z",
     selectedMethod: "method1 or method3"
   }
   ```

4. **测试不同方法**
   ```javascript
   // 测试方法3（bound.center + entity.position）
   events.invoke('debug.coordinateTransform.enable');
   
   // 返回方法1（直接使用worldBound.center）  
   events.invoke('debug.coordinateTransform.disable');
   ```

## 预期分析

根据您的描述，正确的方法应该是：
- **method3**: `bound.center + entity.position`
- 这将把GLB模型的局部边界框中心转换为世界坐标

## 立即测试

1. 选择您已加载的GLB模型
2. 启用边界框显示
3. 查看控制台的坐标对比
4. 运行 `events.invoke('debug.coordinateTransform.enable')` 测试method3

如果method3正确，包围盒应该移动到模型的实际位置而不是原点。