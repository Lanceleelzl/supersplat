# 自定义功能代码备份

## 概述
本文档记录了SuperSplat项目中所有的二次开发功能，确保在合并官方更新时不丢失这些自定义功能。

## 1. GLB模型支持功能

### 1.1 核心文件
- `src/gltf-model.ts` - GLB模型类定义
- `src/asset-loader.ts` - GLB模型加载器
- `src/camera.ts` - GLB模型拾取系统

### 1.2 关键特性
- 支持GLB/GLTF模型导入和显示
- 多阶段拾取系统（物理拾取、AABB拾取、fallback机制）
- 模型复制和重命名功能
- 变换控制器集成
- 物理碰撞检测

### 1.3 关键代码标识
```typescript
// GLB模型标识
isInspectionModel: boolean
inspectionPointName: string
inspectionMarkerName: string

// 拾取相关
GLB模型拾取
camera.focalPointPicked
_gltfModel
```

## 2. 巡检打点功能

### 2.1 核心文件
- `src/editor.ts` - 巡检点位创建和管理逻辑
- `src/ui/menu.ts` - 巡检菜单
- `src/ui/splat-list.ts` - 巡检点位场景管理器显示
- `src/ui/properties-panel.ts` - 巡检点位属性面板
- `src/ui/localization.ts` - 巡检功能多语言支持
- `static/model/marker.glb` - 巡检点位3D模型

### 2.2 关键特性
- 在相机位置创建巡检点位
- 自动编号（XJ-1, XJ-2...）
- 场景管理器中的层级显示
- 巡检点位复制、删除、显示/隐藏
- 巡检参数导出功能
- 快照预览功能

### 2.3 关键事件
```typescript
// 巡检相关事件
'inspection.addPoint'
'inspection.duplicatePoint'
'inspection.duplicateModel'
'inspection.deletePoint'
'inspection.togglePointVisibility'
'inspection.exportParams'
'marker.selected'
'marker.transform'
```

## 3. 相机拾取系统增强

### 3.1 核心文件
- `src/camera.ts` - 主要拾取逻辑

### 3.2 关键特性
- 物理拾取优先级
- GLB模型多阶段拾取
- Splat点云拾取
- 调试模式支持

### 3.3 拾取流程
1. 物理拾取（Physics raycast）
2. GLB模型AABB拾取（两阶段）
3. GLB模型fallback机制
4. Splat点云拾取

## 4. UI组件扩展

### 4.1 场景管理器扩展
- 巡检点位分类显示
- 层级结构支持
- 右键菜单集成

### 4.2 属性面板扩展
- 巡检点位专用信息显示
- 无人机飞行参数计算
- 几何和变换信息

### 4.3 菜单系统扩展
- 巡检菜单项
- 快照预览功能
- 导出功能

## 5. 关键依赖文件

### 5.1 样式文件
- `src/ui/scss/splat-list.scss` - 巡检点位样式

### 5.2 资源文件
- `static/model/marker.glb` - 巡检点位模型
- `src/ui/svg/kuaizhao.svg` - 快照图标

### 5.3 工具文件
- `src/ui/excel-exporter.ts` - Excel导出功能
- `src/ui/inspection-export-panel.ts` - 导出面板

## 6. 合并时需要特别注意的冲突点

### 6.1 asset-loader.ts
- GLB加载逻辑 vs LCC加载逻辑
- 导入语句冲突

### 6.2 editor.ts
- 巡检功能事件处理
- 模型复制逻辑

### 6.3 camera.ts
- GLB拾取系统 vs 官方拾取系统

### 6.4 UI组件
- 场景管理器显示逻辑
- 菜单系统扩展

## 7. 保护策略

1. **优先保护自定义功能**：确保GLB支持和巡检功能不受影响
2. **选择性集成官方更新**：仅集成不冲突的官方功能
3. **分步骤合并**：先保护自定义功能，再逐步集成新功能
4. **充分测试**：每次合并后都要测试所有自定义功能

## 8. 测试清单

### 8.1 GLB模型功能
- [ ] GLB模型导入
- [ ] GLB模型显示
- [ ] GLB模型拾取（点击选择）
- [ ] GLB模型变换（移动、旋转、缩放）
- [ ] GLB模型复制
- [ ] GLB模型删除

### 8.2 巡检功能
- [ ] 添加巡检点位
- [ ] 巡检点位显示在场景管理器
- [ ] 巡检点位复制
- [ ] 巡检点位删除
- [ ] 巡检点位显示/隐藏
- [ ] 巡检参数导出
- [ ] 快照预览功能

### 8.3 集成功能
- [ ] 与Splat点云的协同工作
- [ ] 场景保存和加载
- [ ] 属性面板信息显示