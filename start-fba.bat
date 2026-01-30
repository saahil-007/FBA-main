@echo off
title FBA Orchestrator
echo ========================================
echo     FBA - Facial Based Attendance
echo ========================================
echo.
echo Launching services...

:: Launch Backend
start "FBA Backend" cmd /k "run-backend.bat"

:: Launch Frontend
start "FBA Frontend" cmd /k "run-frontend.bat"

:: Get Local IP Address
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    set IP=%%a
    goto :found_ip
)
:found_ip
set IP=%IP:~1%

echo.
echo ========================================
echo Backend and Frontend are starting.
echo Access the app from other devices using:
echo http://%IP%:8080
echo.
echo IMPORTANT for Camera:
echo To use camera on other devices, you must:
echo 1. Use HTTPS (e.g. ngrok)
echo 2. OR enable "Insecure origins treated as secure" in Chrome
echo ========================================
echo.
pause
