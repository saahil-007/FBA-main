@echo off
echo Starting FBA Backend...
cd backend
if not exist venv (
    echo Creating virtual environment...
    python -m venv venv
)
call venv\Scripts\activate
echo Installing/Updating dependencies...
pip install -r requirements.txt
echo Running Backend on http://localhost:8000
python main.py
pause
