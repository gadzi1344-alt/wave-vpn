#!/usr/bin/env bash
set -euo pipefail
read -r -p 'HTTPS-адрес Worker (без /telegram): ' base
read -r -s -p 'Токен Telegram-бота: ' token; echo
read -r -s -p 'WEBHOOK_SECRET: ' secret; echo
base="${base%/}"
[[ "$base" == https://* && "$base" != *[[:space:]]* ]] || { echo 'Нужен корректный HTTPS-адрес.'; exit 1; }
[[ "$token" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]] || { echo 'Некорректный формат токена.'; exit 1; }
[[ "$secret" =~ ^[A-Za-z0-9_-]{1,256}$ ]] || { echo 'Некорректный формат секрета.'; exit 1; }
result=$(curl --silent --show-error --fail --config - <<CONFIG
url = "https://api.telegram.org/bot${token}/setWebhook"
request = "POST"
data-urlencode = "url=${base}/telegram"
data-urlencode = "secret_token=${secret}"
CONFIG
) || { echo 'Не удалось подключиться к Telegram.'; exit 1; }
if printf '%s' "$result" | grep -Eq '"ok"[[:space:]]*:[[:space:]]*true'; then echo 'Webhook зарегистрирован.'; else echo 'Telegram не подтвердил webhook. Проверьте адрес и настройки.'; exit 1; fi
