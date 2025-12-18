# 🚁 DJI Inspection Mission Export (KMZ/WPML) Plan

> **任务目标**: 实现符合 DJI WPML (Waypoint Markup Language) 标准的巡检航线导出功能，支持 M4TD (Matrice 30/30T Dock) 及大疆司空 2 (FlightHub 2) 平台。

## 1. 现状分析 (Analysis)

### 1.1 样本文件解析 (`docs/wpmz`)
- **格式**: KMZ (Zip 压缩包)。
- **核心文件**:
  - `template.kml`: 定义任务全局配置 (`missionConfig`)、坐标系 (`WGS84`)、负载参数 (`payloadParam`)。
  - `waylines.wpml`: 定义具体航点 (`Placemark`)、动作 (`actionGroup`)、具体执行参数。
- **关键特征**:
  - **动作类型**: 使用了 `orientedShoot` (定向拍照)，包含云台 Pitch/Yaw 和焦距信息。
  - **坐标系**: WGS84 + EGM96 (高程)。
  - **设备标识**: `droneEnumValue=100` (需确认具体对应型号，通常为 M30 系列), `payloadEnumValue=99`。

### 1.2 缺失参数 (Gap Analysis)
为了完全匹配大疆司空 2 的导入要求，我们需要在导出界面增加以下全局参数配置：

| 参数名称 | XML 字段 | 说明 | 默认值建议 |
| :--- | :--- | :--- | :--- |
| **安全起飞高度** | `wpml:takeOffSecurityHeight` | 机场/Dock 必须参数 | 60m |
| **失控行为** | `wpml:exitOnRCLost` | 信号丢失后的动作 | `goContinue` (继续执行) / `goBack` (返航) |
| **全局速度** | `wpml:autoFlightSpeed` | 航线默认速度 | 5 m/s |
| **返航高度** | `wpml:globalRTHHeight` | 任务结束或触发返航时的高度 | 100m (示例中为 0，需修正) |
| **偏航角模式** | `wpml:waypointHeadingMode` | 机头朝向模式 | `manually` (手动/自定义) / `followWayline` |
| **参考起飞点** | `wpml:takeOffRefPoint` | 经纬度、高度 | 需取第一个航点或用户指定 |

## 2. 架构设计 (Architecture)

### 2.1 数据结构 (TypeScript Interfaces)
将在 `src/types/dji-wpml.ts` 中定义严格的 XML 映射接口：

```typescript
// 核心配置接口
interface MissionConfig {
  flyToWaylineMode: 'safely';
  finishAction: 'goHome';
  exitOnRCLost: 'goContinue' | 'goBack' | 'landing' | 'hover';
  takeOffSecurityHeight: number;
  globalRTHHeight: number;
  droneInfo: {
    droneEnumValue: number; // 100
    droneSubEnumValue: number;
  };
  payloadInfo: {
    payloadEnumValue: number; // 99
    payloadPositionIndex: number;
  };
}

// 航点接口
interface Waypoint {
  latitude: number;
  longitude: number;
  height: number; // 相对起飞点或 WGS84 椭球高
  headingParam?: {
    mode: 'manually' | 'followWayline';
    heading?: number;
  };
  actions?: ActionGroup[];
}
```

### 2.2 模块划分
1.  **WPML Builder (`src/utils/wpml/builder.ts`)**:
    - 负责将内部 `InspectionPoint` 数组转换为 WPML XML 字符串。
    - 处理 `template.kml` 和 `waylines.wpml` 的生成。
    - 处理 UUID 生成 (Action UUID)。
2.  **KMZ Packager (`src/utils/wpml/packager.ts`)**:
    - 使用 `JSZip` 打包 XML 文件。
    - 生成最终 `.kmz` Blob。
3.  **UI Component (`src/components/Export/DJIExportModal.tsx`)**:
    - 表单填写全局参数 (RTH, Speed, etc.)。
    - 调用 Builder 和 Packager。

## 3. 执行步骤 (Execution Steps)

1.  **Step 1: 基础设施搭建**:
    - 安装 `jszip` (如果未安装)。
    - 创建 `src/types/dji-wpml.ts` 定义 XML 结构类型。
2.  **Step 2: 核心逻辑实现**:
    - 实现 `template.kml` 生成器：填充全局配置。
    - 实现 `waylines.wpml` 生成器：遍历巡检点，生成 `Placemark` 和 `orientedShoot` 动作。
    - **难点攻克**: 坐标转换 (若项目使用非 WGS84)，云台角度计算。
3.  **Step 3: 打包逻辑**:
    - 实现 Zip 打包流，确保目录结构为 `wpmz/template.kml` 等。
4.  **Step 4: UI 交互**:
    - 添加导出按钮，弹出配置模态框。
    - 联调导出。
5.  **Step 5: 验证**:
    - 导出文件解压检查。
    - 对比 `docs/wpmz` 中的样本文件。

## 4. 验证标准 (Verification)
- [ ] 解压导出的 KMZ，包含 `wpmz` 文件夹。
- [ ] `template.kml` 包含正确的 `missionConfig`。
- [ ] `waylines.wpml` 包含正确的动作组 (`actionGroup`) 和 `orientedShoot`。
- [ ] 坐标精度保留至少 9 位小数。
