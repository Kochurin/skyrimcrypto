@echo off
chcp 65001 >nul
title SkyrimCrypto
cd /d "%~dp0"
if not exist node_modules (
  echo [запуск] Первый запуск: устанавливаю зависимости...
  call npm.cmd install || goto :error
)
call npm.cmd run dev
if errorlevel 1 goto :error
exit /b 0
:error
echo.
echo Не получилось запустить. Сообщения выше подскажут причину.
pause
