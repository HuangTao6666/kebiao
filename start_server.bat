@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================================
echo   Schedule App - local server
echo   (KeBiao: mobile class schedule)
echo ============================================================
for /f "tokens=2 delims=:" %%i in ('ipconfig ^| findstr /i "IPv4"') do set LANIP=%%i
set LANIP=%LANIP: =%
echo.
echo   On your PHONE (same Wi-Fi), open this address:
echo.
echo       http://%LANIP%:8080
echo.
echo   Then use the browser menu - "Add to Home screen".
echo   Keep this window open. Press Ctrl+C to stop the server.
echo.
python -m http.server 8080 --bind 0.0.0.0
pause
