@echo off
cd /d "%~dp0"
echo Building site... (works / _AInote)
py -3 build.py 2>nul || python build.py 2>nul || python3 build.py
if errorlevel 1 (
  echo.
  echo [ERROR] Python not found. Please install Python, or tell me.
  echo.
  pause
  exit /b 1
)
echo.
echo Done! Opening the page...
start "" "_site\index.html"
pause
