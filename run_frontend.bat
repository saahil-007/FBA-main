@echo off
echo Starting FBA Frontend...
cd frontend
if not exist node_modules (
    echo Installing dependencies...
    npm install
)
echo Running Frontend on http://localhost:8080
npm run dev
pause
