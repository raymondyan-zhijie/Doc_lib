:: Doc_Lib Launcher for Windows (batch alternative)
:: Double-click to start — status window + browser, no terminal.
@echo off
cd /d "%~dp0"
start "" pythonw Doc_Lib.pyw
if %errorlevel% neq 0 start "" python Doc_Lib.pyw
