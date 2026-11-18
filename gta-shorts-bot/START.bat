@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist venv (
  echo First run install_windows.bat
  pause
  exit /b
)
echo ==============================================
echo   GTA 6 Shorts Bot is running.
echo   Control panel: http://localhost:8080
echo   KEEP THIS WINDOW OPEN (minimize it).
echo ==============================================
start "" cmd /c "timeout /t 5 >nul & start http://localhost:8080"
venv\Scripts\python -m gtabot web --port 8080
pause
