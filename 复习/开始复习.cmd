@echo off
chcp 65001 >nul
echo Starting review server... (close this window to stop)
node "%~dp0server.mjs" %*
pause
