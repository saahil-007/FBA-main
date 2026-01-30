@echo off
title FBA Frontend Server
echo ========================================
echo        Starting FBA Frontend...
echo ========================================

cd frontend

:: Check if node_modules exists
if not exist "node_modules" (
    echo node_modules not found. Installing dependencies...
    npm install
)

echo.
echo Starting Vite development server...
npm run dev
pause
