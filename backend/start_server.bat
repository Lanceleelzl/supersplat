@echo off
chcp 65001
echo ==========================================
echo 🚁 正在启动 UAV 安全计算服务...
echo ==========================================

:: 1. 检查 Python 环境
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] 未检测到 Python，请先安装 Python 3.10+ 并添加到 PATH。
    pause
    exit /b
)

:: 2. 检查虚拟环境 (可选，此处简化为直接检查依赖)
if not exist "venv" (
    echo [INFO] 正在创建虚拟环境...
    python -m venv venv
)

:: 3. 激活环境
call venv\Scripts\activate

:: 4. 安装依赖 (如果 requirements.txt 存在)
if exist "requirements.txt" (
    echo [INFO] 正在检查依赖更新...
    pip install -r requirements.txt
)

:: 5. 启动 FastAPI 服务
echo [SUCCESS] 服务启动成功！请保持此窗口开启。
echo [INFO] API 地址: http://localhost:8000
echo.
:: uvicorn server.main:app --reload --host 0.0.0.0 --port 8000
echo (目前是演示脚本，请等待代码实现...)
pause
