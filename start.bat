@echo off
cd /d "%~dp0"
chcp 65001 >nul
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8
echo Starting maimai draw terminal ...
start "" http://127.0.0.1:8770/
python -m http.server 8770 --bind 127.0.0.1
pause
