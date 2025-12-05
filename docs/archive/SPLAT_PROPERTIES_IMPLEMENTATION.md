# 高斯泼溅模型属性弹窗功能实现

## 功能概述

本次更新为SuperSplat项目添加了高斯泼溅模型的属性弹窗功能，使其与GLB模型的属性显示功能保持一致。用户现在可以通过点击高斯泼溅模型来查看其详细信息，包括GIS信息。

## 新增功能

### 1. 右键菜单支持
- 高斯泼溅模型现在支持右键菜单操作
- 包含功能：原位复制、删除模型、隐藏/显示模型
- 与GLB模型的右键菜单功能保持一致

### 2. 属性弹窗显示
- 点击高斯泼溅模型时在右侧显示属性面板
- 包含以下信息分组：
  - **基本信息**：模型名称和类型
  - **几何信息**：包围盒、总高斯点数、有效点数
  - **变换信息**：位置、旋转、缩放
  - **扩展信息（GIS信息）**：海拔高度、地理坐标、模型朝向

### 3. 模型复制功能
- 支持高斯泼溅模型的原位复制
- 复制的模型会自动命名为"[原名称]_复制"
- 保持所有变换属性和材质属性

### 4. 统一的用户体验
- 属性面板会根据选中的模型类型自动调整显示内容
- GLB模型显示无人机飞控信息，高斯泼溅模型显示GIS信息
- 支持在不同类型模型之间无缝切换

## 代码更改详情

### 修改的文件

#### 1. `src/ui/context-menu.ts`
- **导入更新**：添加了`Splat`类的导入
- **属性扩展**：新增`currentSplat`属性用于跟踪当前选中的高斯泼溅模型
- **事件处理**：更新右键菜单事件处理，支持高斯泼溅模型选择
- **菜单项功能**：扩展所有菜单项功能以支持高斯泼溅模型
- **新增方法**：
  - `duplicateSplatModel()`: 高斯泼溅模型复制逻辑
  - 更新的`deleteModel()`, `hideModel()`, `showModel()`方法

#### 2. `src/ui/properties-panel.ts`
- **导入更新**：添加了`Splat`类的导入
- **属性扩展**：新增`currentSplat`属性
- **UI文本更新**：占位符文本更新为"选择一个GLB模型或高斯泼溅模型以查看属性"
- **事件处理**：更新选择变化事件处理，支持高斯泼溅模型
- **新增方法**：
  - `showSplatProperties()`: 显示高斯泼溅模型属性
  - `updateSplatInfo()`: 更新高斯泼溅模型信息
  - `updateSplatGeometryInfo()`: 更新几何信息
  - `updateSplatTransformInfo()`: 更新变换信息
  - `calculateSplatGISInfo()`: 计算GIS信息
- **标题更新**：扩展信息部分标题更改为更通用的"扩展信息"

#### 3. `src/editor.ts`
- **新增事件处理**：添加了`splat.duplicate`事件的处理逻辑
- **新增方法**：
  - `duplicateSplatModel()`: 高斯泼溅模型复制辅助函数
  - 支持复制所有模型属性，包括变换、材质和渲染属性

## 技术实现细节

### 高斯泼溅模型属性获取
```typescript
// 基本信息
name: splat.name || splat.filename
type: "高斯泼溅模型 (PLY/SPLAT)"

// 几何信息
包围盒: splat.worldBound.halfExtents * 2
总高斯点数: splat.numSplats
有效点数: splat.numSplats - splat.numDeleted

// GIS信息（基于世界坐标）
海拔高度: centerPoint.y
地理坐标: (centerPoint.x, centerPoint.z)
模型朝向: -euler.y (航向角)
```

### 复制逻辑
```typescript
// 创建新实例
const duplicatedSplat = new Splat(originalSplat.asset);

// 复制变换属性
duplicatedSplat.entity.setPosition(originalPos);
duplicatedSplat.entity.setRotation(originalRot);
duplicatedSplat.entity.setLocalScale(originalScale);

// 复制材质属性
duplicatedSplat._tintClr.copy(originalSplat._tintClr);
duplicatedSplat._temperature = originalSplat._temperature;
// ... 其他属性
```

## 使用方法

1. **查看属性**：
   - 点击任意高斯泼溅模型
   - 属性面板将在右侧显示
   - 可折叠/展开各个信息分组

2. **右键操作**：
   - 在高斯泼溅模型上右键点击
   - 选择所需的操作（复制、删除、隐藏/显示）

3. **模型复制**：
   - 右键点击模型并选择"原位复制"
   - 或使用快捷键进行复制操作

## 注意事项

1. **GIS信息**：目前使用世界坐标作为地理坐标的示例，实际应用中应从模型元数据中获取真实的地理坐标信息。

2. **性能考虑**：高斯泼溅模型的复制会创建完整的新实例，对于大型模型可能消耗较多内存。

3. **兼容性**：所有更改都向后兼容，不会影响现有的GLB模型功能。

## 测试建议

1. 加载不同类型的高斯泼溅文件（.ply, .splat, .sog）
2. 测试属性面板的各个信息分组
3. 验证右键菜单的所有功能
4. 测试在GLB模型和高斯泼溅模型之间的切换
5. 验证模型复制功能的正确性

## 后续扩展可能性

1. **真实GIS坐标**：集成真实的地理坐标系转换
2. **更多属性**：添加更多高斯泼溅特有的属性显示
3. **批量操作**：支持多选模型的批量操作
4. **属性编辑**：允许用户直接编辑某些属性值

这次更新大大提升了高斯泼溅模型的用户体验，使其与GLB模型的功能保持一致，为用户提供了统一且丰富的模型管理功能。