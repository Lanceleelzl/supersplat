@echo off
chcp 65001
echo ==========================================
echo 🎨 正在启动 SuperSplat 前端...
echo ==========================================
echo [INFO] 正在运行 npm run develop...
echo [INFO] 请稍候，浏览器稍后将自动打开 http://localhost:3000 (如果配置了自动打开)
echo.

:: 检查 node_modules
if not exist "node_modules" (
    echo [WARN] 未检测到 node_modules，正在尝试安装依赖...
    call npm install
)

cmd /k "npm run develop"
