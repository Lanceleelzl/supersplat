@echo off
chcp 65001
echo ==========================================
echo 🚁 正在启动 UAV 后端服务...
echo ==========================================

cd backend
call start_server.bat
