#!/usr/bin/env bash
# update.sh — atualização manual imediata (não espera pelo timer)
# Uso: sudo bash deploy/update.sh

set -euo pipefail

APP_DIR="/opt/myyoutube"
APP_USER="myyoutube"
BRANCH="main"

[ "$EUID" -eq 0 ] || { echo "Execute como root: sudo bash $0"; exit 1; }

cd "$APP_DIR"
echo "Buscando atualizações..."

BEFORE=$(git rev-parse HEAD)
runuser -u "$APP_USER" -- git pull origin "$BRANCH"
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "Já está atualizado (${BEFORE:0:7})."
    exit 0
fi

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
echo ""
echo "Commits: ${BEFORE:0:7} → ${AFTER:0:7}"
echo "Arquivos alterados:"
echo "$CHANGED" | sed 's/^/  /'
echo ""

if echo "$CHANGED" | grep -qE "package-lock\.json"; then
    echo "Reinstalando dependências..."
    runuser -u "$APP_USER" -- npm ci --prefer-offline
fi

if echo "$CHANGED" | grep -qE "^client/"; then
    echo "Reconstruindo cliente..."
    runuser -u "$APP_USER" -- npm run build --workspace=client
    chmod -R a+rX "$APP_DIR/client/dist"
fi

systemctl restart myyoutube-server
echo ""
echo "Serviço reiniciado. Status:"
systemctl status myyoutube-server --no-pager -l
