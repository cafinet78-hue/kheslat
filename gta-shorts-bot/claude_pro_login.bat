@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==============================================
echo   Connect your Claude Pro subscription
echo ==============================================
where claude >nul 2>nul
if errorlevel 1 (
  if not exist "%USERPROFILE%\.local\bin\claude.exe" (
    echo Installing Claude Code ...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://claude.ai/install.ps1 | iex"
  )
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
echo.
echo 1) A browser page opens: log in with your Claude Pro account and press Authorize.
echo 2) If it asks for a code, copy it from the browser and paste it here (right-click), press Enter.
echo 3) It prints a long token starting with sk-ant-oat01-  - select it with the mouse and press Enter to copy.
echo.
claude setup-token
echo.
set /p TOKEN=Paste the token here (right-click) and press Enter: 
if "%TOKEN%"=="" (
  echo No token entered.
  pause
  exit /b
)
venv\Scripts\python -c "import sys;from pathlib import Path;from dotenv import set_key;p=Path('.env');p.exists() or p.write_text(Path('.env.example').read_text(encoding='utf-8'),encoding='utf-8');set_key(str(p),'CLAUDE_CODE_OAUTH_TOKEN',sys.argv[1].strip())" "%TOKEN%"
echo.
echo Done! Close START.bat window and open START.bat again.
pause
