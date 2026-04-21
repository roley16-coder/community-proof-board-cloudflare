@echo off
set /p TELEGRAM_BOT_TOKEN=Enter TELEGRAM_BOT_TOKEN: 
set /p TELEGRAM_WEBHOOK_SECRET=Enter TELEGRAM_WEBHOOK_SECRET: 
set /p TELEGRAM_ALLOWED_CHAT_IDS=Enter TELEGRAM_ALLOWED_CHAT_IDS (optional): 

cd /d %~dp0\..

echo %TELEGRAM_BOT_TOKEN% | "C:\Program Files\nodejs\npx.cmd" wrangler secret put TELEGRAM_BOT_TOKEN
echo %TELEGRAM_WEBHOOK_SECRET% | "C:\Program Files\nodejs\npx.cmd" wrangler secret put TELEGRAM_WEBHOOK_SECRET

if not "%TELEGRAM_ALLOWED_CHAT_IDS%"=="" (
  echo %TELEGRAM_ALLOWED_CHAT_IDS% | "C:\Program Files\nodejs\npx.cmd" wrangler secret put TELEGRAM_ALLOWED_CHAT_IDS
)

echo Done.
