@echo off
title SITRAIN Simulator Web - Automate reel / NetToPLCSim (S7)
echo ==========================================
echo   SITRAIN Simulator Web - mode S7 Ethernet
echo ==========================================
echo.
echo  Automate S7-1500 / ET200SP reel : activer PUT/GET dans la CPU, rack 0 slot 1.
echo  S7-PLCSIM classique : lancer NetToPLCSim, utiliser son IP (port 102).
echo  Un port different du 102 se note IP:port (ex. 127.0.0.1:1102).
echo.
set /p IP="Adresse IP de l automate : "
if "%IP%"=="" ( echo Aucune adresse saisie. & pause & exit /b 1 )
set /p RACK="Rack [0] : "
if "%RACK%"=="" set RACK=0
set /p SLOT="Slot [1] : "
if "%SLOT%"=="" set SLOT=1

taskkill /f /im PlcBridge.exe >nul 2>&1
cd /d "%~dp0"
"%~dp0publish\PlcBridge.exe" "%~dp0" --plc-ip %IP% --rack %RACK% --slot %SLOT%
pause
