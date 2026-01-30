@echo off
title FBA Backend Server
echo ========================================
echo        Starting FBA Backend...
echo ========================================

cd backend

:: Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    call venv\Scripts\activate
    echo Installing dependencies...
    pip install -r requirements.txt
) else (
    call venv\Scripts\activate
    :: Optional: Uncomment the next line to update dependencies on every start
    :: pip install -r requirements.txt
)

echo.
echo Starting FastAPI server...
python main.py
pause
