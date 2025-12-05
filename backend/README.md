# 🚁 UAV Backend Service

这是 **SuperSplat** 项目的后端计算服务，专为无人机安全通道规划设计。

## 🏗️ 目录结构 (Directory Structure)

- `server/`: Python (FastAPI) Web 服务层。
  - 负责响应前端请求。
  - 调用底层 C++ 算法。
- `algorithm/`: C++ 核心算法层。
  - `.ply` 高斯文件解析。
  - 体素化 (Voxelization) 计算。
  - SDF 安全距离场生成。
- `start_server.bat`: 一键启动脚本 (双击即可)。

## 🚀 快速开始 (Quick Start)

1. 确保已安装 **Python 3.10+**。
2. 双击根目录下的 `start_server.bat`。
3. 服务将在 `http://localhost:8000` 启动。

## 🛠️ 开发说明 (Development)

- **C++ 编译**: 运行 `backend/algorithm/build.bat` (待创建)。
- **Python 依赖**: `pip install -r backend/requirements.txt`。

## 📦 独立化 (Decoupling)

本目录设计为**完全自包含 (Self-Contained)**。如果您想将其移动到另一个项目或独立仓库：

1. 直接将 `backend` 文件夹剪切到新位置。
2. 这是一个完整的 Python 项目，拥有独立的 `.gitignore` 和依赖配置。
3. 唯一的外部依赖是前端的 API 调用，只要 API 接口保持不变，迁移对前端是透明的。
