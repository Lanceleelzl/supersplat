@echo off
chcp 65001
echo ==========================================
echo 🚀 正在启动全栈开发环境 (Frontend + Backend)...
echo ==========================================

:: 1. 启动后端 (新窗口)
echo [INFO] 正在启动后端服务...
start "UAV Backend Service" cmd /c "Run_Backend_Only.bat"

:: 2. 启动前端 (新窗口)
echo [INFO] 正在启动前端服务...
start "SuperSplat Frontend" cmd /c "Run_Frontend_Only.bat"

echo.
echo [SUCCESS] 全栈服务已启动！
echo - 前端: http://localhost:3000
echo - 后端: http://localhost:8000
echo.
echo 请不要关闭弹出的终端窗口。
pause
