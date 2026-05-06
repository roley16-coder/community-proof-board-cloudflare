@echo off
set LOCAL_CAPTURE_HOST=127.0.0.1
set LOCAL_CAPTURE_PORT=8788
if exist "%~dp0local-capture.env" (
  for /f "usebackq tokens=1,* delims==" %%A in ("%~dp0local-capture.env") do (
    if not "%%A"=="" if not "%%A:~0,1%"=="#" set "%%A=%%B"
  )
)
cd /d %~dp0\..
call "C:\Program Files\nodejs\npm.cmd" run local-capture
