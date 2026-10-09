@echo off
title SITRAIN Simulator Web
echo ==========================================
echo   SITRAIN Simulator Web
echo ==========================================
echo.

REM Tuer les anciennes instances si elles tournent encore
taskkill /f /im PlcBridge.exe >nul 2>&1

REM Se placer dans le dossier de l'application
cd /d "%~dp0"

echo Demarrage du serveur...
echo Dossier : %cd%
echo.

"%~dp0publish\PlcBridge.exe" "%~dp0"

REM Code 3 : le serveur s'est relance en administrateur dans une autre fenetre
if "%errorlevel%"=="3" exit
pause
