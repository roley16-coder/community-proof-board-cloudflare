param(
  [Parameter(Mandatory = $true)]
  [string]$BotToken,

  [Parameter(Mandatory = $true)]
  [string]$WebhookSecret,

  [string]$BaseUrl = "https://proof.sellution.pro"
)

$webhookUrl = "$BaseUrl/api/telegram/webhook/$WebhookSecret"
$payload = @{
  url = $webhookUrl
  allowed_updates = @("message")
} | ConvertTo-Json -Compress

Write-Host "Setting Telegram webhook to $webhookUrl"
$response = Invoke-RestMethod -Method Post `
  -Uri "https://api.telegram.org/bot$BotToken/setWebhook" `
  -ContentType "application/json" `
  -Body $payload

$response | ConvertTo-Json -Depth 5
