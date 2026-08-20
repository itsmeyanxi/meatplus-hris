' Launches the Laravel scheduler tick completely hidden — no console window flash.
' The scheduled task points wscript.exe at this file; window style 0 = hidden.
Set sh = CreateObject("WScript.Shell")
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\Users\ALL COMPANY HRIS\Documents\meatplus-hris\tools\schedule-runner.ps1""", 0, False
