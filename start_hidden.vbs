' Doc_Lib Launcher for Windows
' Double-click to start — opens a status window + browser. No terminal.
' Click the power button (⏻) in the browser or "Stop Server" in the status window to exit.

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
launcherPath = fso.GetParentFolderName(WScript.ScriptFullName) & "\Doc_Lib.pyw"

' Launch directly via shell — .pyw extension auto-uses pythonw.exe (no console)
WshShell.Run """" & launcherPath & """", 0, False
