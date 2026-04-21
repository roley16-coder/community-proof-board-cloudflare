@echo off
set LOCAL_CAPTURE_TOKEN=change_this_token
set LOCAL_CAPTURE_PORT=8788
cd /d %~dp0\..
call "C:\Program Files\nodejs\npm.cmd" run local-capture
