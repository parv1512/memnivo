@echo off
cd /d "%~dp0"
node scripts/run.cjs
if errorlevel 1 pause
