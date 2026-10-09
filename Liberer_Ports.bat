@echo off
title Liberer ports 8080 et 8765 pour SITRAIN

REM Verifier les droits administrateur
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  [ERREUR] Ce script doit etre lance EN TANT QU'ADMINISTRATEUR
    echo.
    echo  Clic droit sur ce fichier ^> "Executer en tant qu'administrateur"
    echo.
    pause
    exit /b 1
)

echo ==========================================================
echo   Liberation des ports 8080 et 8765 pour SITRAIN WebApp
echo ==========================================================
echo.

echo [1/5] Etat AVANT :
netsh int ipv4 show excludedportrange protocol=tcp | findstr /R "^ *8080 ^ *8765"
echo.

echo [2/5] Arret du service winnat...
net stop winnat
echo.

echo [3/5] Suppression des exclusions automatiques sur 8080 et 8765...
netsh int ipv4 delete excludedportrange protocol=tcp startport=8080 numberofports=1 >nul 2>&1
netsh int ipv4 delete excludedportrange protocol=tcp startport=8765 numberofports=1 >nul 2>&1

echo [4/5] Reservation persistante des ports (pour eviter la re-exclusion)...
netsh int ipv4 add excludedportrange protocol=tcp startport=8080 numberofports=1 store=persistent
netsh int ipv4 delete excludedportrange protocol=tcp startport=8080 numberofports=1
netsh int ipv4 add excludedportrange protocol=tcp startport=8765 numberofports=1 store=persistent
netsh int ipv4 delete excludedportrange protocol=tcp startport=8765 numberofports=1
echo.

echo [5/5] Redemarrage du service winnat...
net start winnat
echo.

echo ==========================================================
echo   Etat APRES :
echo ==========================================================
netsh int ipv4 show excludedportrange protocol=tcp
echo.
echo Verification des ports :
netstat -ano | findstr ":8080 :8765"
if %errorLevel% neq 0 (
    echo  ^> Les ports 8080 et 8765 sont LIBRES. Vous pouvez lancer SITRAINSim.bat
) else (
    echo  ^> Si une ligne "LISTENING ... 4" apparait encore, redemarrez Windows.
)
echo.
pause
