@echo off
echo Stopping any existing python processes...
taskkill /IM python.exe /F 2>nul
echo.
echo Starting SERVER in STABLE MODE (No Auto-Reload)...
cd server
python run_stable.py
pause
