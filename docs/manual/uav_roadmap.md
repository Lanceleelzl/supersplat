# 🚁 无人机安全通道规划路线图 (UAV Safety Path Planning Roadmap)

> **目标**: 构建一套基于 3D Gaussian Splatting 的高精度无人机航线规划系统。利用后端 C++ 高性能计算体素 (Voxel) 安全模型，并通过 Web 前端进行可视化验证与交互。

## 1. 架构设计 (Architecture)

采用 **B/S 架构 (Browser/Server)**，前端负责交互与可视化，后端负责核心算法计算。

### 1.1 整体架构图
```mermaid
graph TD
    Client[前端 SuperSplat (Web/TS)] -->|1. 上传/指定 Ply 路径| Server[后端计算服务 (Python/FastAPI)]
    Server -->|2. 调用| Core[核心算法库 (C++/PyBind11)]
    Core -->|3. 读取 Ply & 计算体素/SDF| Core
    Core -->|4. 返回结果 (Binary/JSON)| Server
    Server -->|5. 返回数据| Client
    Client -->|6. 渲染体素 & 路径| User[用户]
```

### 1.2 技术栈选型
- **前端 (Frontend)**: TypeScript + PlayCanvas (SuperSplat 现有架构)
  - **职责**: 模型加载、参数配置、结果渲染 (Voxel Layer)、交互操作。
- **后端服务 (Backend Service)**: Python (FastAPI)
  - **职责**: 提供 RESTful API，处理请求，作为胶水层连接 C++ 算法。
  - **优势**: 开发快，生态丰富，易于编写业务逻辑。
- **核心算法 (Core Algorithm)**: C++
  - **职责**: 解析 `.splat` 或 `.ply` 文件，构建 Octree/KD-Tree，计算 SDF (Signed Distance Field)，生成安全包围盒。
  - **优势**: 极致性能，处理千万级高斯点云无压力。
  - **接口**: 使用 `pybind11` 封装为 Python 模块。

---

## 2. 实施阶段 (Implementation Stages)

### 📅 阶段一：环境搭建与服务原型 (Infrastructure)
**目标**: 打通 Python 调用 C++ 的链路，并跑通简单的 Web 服务。

1.  **C++ 项目初始化**:
    - 配置 CMake 构建系统。
    - 引入 `pybind11`。
    - 编写一个简单的 "Hello World" 函数 (如 `add(a, b)`)。
2.  **Python 服务封装**:
    - 搭建 FastAPI 基础框架。
    - 编写 `start_server.bat` 一键启动脚本 (自动创建 venv, 安装依赖)。
    - 实现 API `/api/status` 验证服务存活。
3.  **前后端联调**:
    - SuperSplat 前端添加一个 "连接后端" 的测试按钮。
    - 验证前端能成功请求后端接口。

### 📅 阶段二：核心算法开发 (Core Algorithm)
**目标**: 实现从 Gaussian Splat 到体素 (Voxel) 的转换。

1.  **Ply/Splat 解析**:
    - C++ 实现高效读取 `.ply` 文件 (利用多线程)。
    - 提取位置 (Position) 和 协方差 (Covariance/Scale/Rot)。
2.  **体素化 (Voxelization)**:
    - 定义体素网格 (Grid)。
    - 遍历高斯点，标记被占据的体素。
    - **优化**: 使用八叉树 (Octree) 加速空间查询。
3.  **安全距离计算**:
    - 实现 SDF (有向距离场) 算法。
    - 根据设定的安全半径 (Radius)，膨胀障碍物区域。

### 📅 阶段三：可视化与交互 (Visualization)
**目标**: 在前端直观展示计算结果。

1.  **数据传输协议**:
    - 定义高效的二进制格式 (避免 JSON 解析开销) 传输体素数据。
2.  **前端渲染层 (Voxel Layer)**:
    - 使用 PlayCanvas 的 `Hardware Instancing` 技术渲染大量体素方块。
    - 实现体素的显隐控制、透明度调节。
3.  **交互调试**:
    - 允许用户在前端调整 "安全距离" 参数，实时触发生后端重算并刷新视图。

### 📅 阶段四：路径规划 (Path Planning)
**目标**: 自动生成安全航线。

1.  **路径算法**:
    - C++ 实现 A* 或 RRT* (Rapidly-exploring Random Tree) 算法。
    - 在安全体素空间中搜索路径。
2.  **路径平滑**:
    - 使用 B-Spline 对折线路径进行平滑处理。
3.  **结果导出**:
    - 将规划好的路径导出为无人机可执行的格式 (如 Waypoints JSON/CSV)。

---

## 3. 语言盲区辅助策略 (Language Gap Protocol)

针对主人对 Python/C++ 不熟悉的情况，执行以下策略：

- **黑盒交付**: 所有的 C++ 编译、Python 环境配置，全部脚本化。主人只需点击 `build.bat` 和 `start.bat`。
- **可视化验证**: 每一个算法步骤（如体素化结果），都必须能在前端看到图形化输出，而不是只看控制台日志。
- **详细注释**: C++ 核心代码必须包含中文原理说明。

## 5. 独立化迁移策略 (Decoupling Strategy)

考虑到未来算法服务可能需要独立部署或作为通用服务使用，我们在设计时遵循 **"Loose Coupling" (松耦合)** 原则。

### 5.1 独立化步骤
当需要将 `backend/` 目录拆分为独立仓库时，仅需执行以下步骤：

1.  **移动目录**: 将 `backend/` 文件夹移动到新位置（如 `UAV-Algorithm-Service`）。
2.  **Git 初始化**: 在新目录执行 `git init`。
3.  **依赖保持**: 后端拥有独立的 `requirements.txt` 和 `.gitignore`，不依赖 SuperSplat 根目录的任何配置。
4.  **API 兼容**: 只要保持 API 接口定义不变，前端无需修改代码，只需更新 API URL 配置即可。

### 5.2 跨域配置 (CORS)
- 在 `server/main.py` 中，我们已预留 CORS 配置，允许来自 SuperSplat (localhost:3000) 的跨域请求。独立部署后，只需更新允许的 Origin 列表。

---


## 4. 目录结构规划 (Directory Structure)
```text
├── backend/                # [新增] 后端服务目录
│   ├── algorithm/          # C++ 核心算法
│   │   ├── src/
│   │   ├── include/
│   │   ├── CMakeLists.txt
│   │   └── bindings.cpp    # PyBind11 绑定代码
│   ├── server/             # Python Web 服务
│   │   ├── main.py         # FastAPI 入口
│   │   └── routers/
│   ├── requirements.txt
│   ├── build_algo.bat      # C++ 编译脚本
│   └── start_server.bat    # 服务启动脚本
├── src/                    # 前端源码 (现有)
│   ├── services/           # [新增] API 通信模块
│   └── layers/             # [新增] 体素渲染层
└── docs/
    └── manual/
        └── uav_roadmap.md  # 本文档
```
