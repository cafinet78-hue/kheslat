@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo    GTA 6 Shorts Bot - Installer (Windows)
echo ==============================================

where python >nul 2>nul
if errorlevel 1 (
  echo [1/3] Installing Python 3.12 ...
  winget install -e --id Python.Python.3.12 --accept-package-agreements --accept-source-agreements
  echo.
  echo Python installed. CLOSE this window and double-click install_windows.bat again.
  pause
  exit /b
)

where ffmpeg >nul 2>nul
if errorlevel 1 (
  echo [2/3] Installing FFmpeg ...
  winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
  echo.
  echo FFmpeg installed. CLOSE this window and double-click install_windows.bat again.
  pause
  exit /b
)

echo [3/3] Installing the program (5-10 minutes, please wait) ...
if not exist venv python -m venv venv
venv\Scripts\python -m pip install --upgrade pip
venv\Scripts\python -m pip install -r requirements.txt
if errorlevel 1 (
  echo.
  echo Install failed. Check your internet / VPN and run install_windows.bat again.
  pause
  exit /b
)
if not exist config.yaml copy config.example.yaml config.yaml >nul
if not exist .env copy .env.example .env >nul

echo.
echo ==============================================
echo   Installed! Opening the control panel...
echo   Next time just double-click  START.bat
echo ==============================================
call START.bat
