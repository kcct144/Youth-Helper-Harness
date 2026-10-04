@echo off
REM  Link .agents\skills -> .kilo\skills, so DSH (and other harnesses
REM  that read .agents) can find the same skill files without copying.
cd /d "%~dp0"

if exist ".agents\skills\" (
  echo .agents\skills already exists - nothing to do.
  pause
  exit /b 0
)

if not exist ".agents" mkdir ".agents"
mklink /J ".agents\skills" ".kilo\skills"
if errorlevel 1 (
  echo.
  echo Failed. Try running this file as administrator, or copy the folder manually.
) else (
  echo.
  echo Done. .agents\skills now points to .kilo\skills
)
pause
