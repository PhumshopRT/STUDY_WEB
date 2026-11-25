@echo off
chcp 65001 > nul
cd /d "%~dp0"
title StudyVault Portal Launcher
echo ===================================================
echo   📚 กำลังเปิด StudyVault Portal (คลังสรุปวิชา)
echo ===================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo [✓] ตรวจพบ Python 3
    echo [*] กำลังเปิดเว็บเซิร์ฟเวอร์จำลองที่ http://localhost:3000
    echo [*] กำลังเปิดเบราว์เซอร์อัตโนมัติ...
    start "" /min cmd /c "timeout /t 1 /nobreak >nul && start http://localhost:3000"
    python -m http.server 3000
) else (
    echo [!] ไม่พบ Python รันไฟล์ index.html ตรงๆ
    start "" index.html
)

pause
