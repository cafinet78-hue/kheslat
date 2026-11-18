@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo    GTA VI Shorts Bot - Installer (Windows)
echo ==============================================

where python >nul 2>nul
if errorlevel 1 (
  echo [1/4] Installing Python 3.12 ...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python installed. CLOSE this window and run install_windows.bat again.
  pause
  exit /b
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [2/4] Installing FFmpeg ...
  winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
  echo.
  echo FFmpeg installed. CLOSE this window and run install_windows.bat again.
  pause
  exit /b
)

echo [3/4] Installing Python packages (a few minutes) ...
if not exist venv python -m venv venv
venv\Scripts\python -m pip install --upgrade pip
venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Package install failed. Check your internet / VPN and try again.
  pause
  exit /b
)

echo [4/4] Setup wizard ...
venv\Scripts\python -m gtabot setup
venv\Scripts\python -m gtabot doctor
echo.
echo Done! Next: put client_secret.json here, then double-click youtube_login.bat, then run.bat
pause
