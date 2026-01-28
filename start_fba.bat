@echo off
echo ==========================================
echo       FBA - Facial Based Attendance
echo ==========================================
echo Starting Backend and Frontend in separate windows...

start "FBA Backend" cmd /c run_backend.bat
timeout /t 5
start "FBA Frontend" cmd /c run_frontend.bat

echo.
echo Both services are starting. 
echo Backend: http://localhost:8000
echo Frontend: http://localhost:8080
echo.
echo Close the individual windows to stop the services.
pause
