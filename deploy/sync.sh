#!/usr/bin/env bash
# sync.sh — chamado pelo mytube-sync.timer
# Detecta novos commits, reinstala deps e/ou reconstrói o cliente se necessário,
# depois reinicia o serviço backend.

set -euo pipefail

APP_DIR="/opt/mytube"
APP_USER="mytube"
BRANCH="main"
TAG="mytube-sync"

log()  { logger -t "$TAG" "$*"; echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
info() { log "INFO  $*"; }
err()  { log "ERROR $*"; }

cd "$APP_DIR"

# Verifica conectividade antes de tentar fetch
if ! git fetch origin "$BRANCH" --quiet 2>&1; then
    err "git fetch falhou — sem rede ou repositório inacessível."
    exit 1
fi

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    info "Sem novidades (${LOCAL:0:7})."
    exit 0
fi

info "Novos commits: ${LOCAL:0:7} → ${REMOTE:0:7}. Atualizando..."
runuser -u "$APP_USER" -- git pull origin "$BRANCH" --quiet

CHANGED=$(git diff --name-only "$LOCAL" HEAD)

if echo "$CHANGED" | grep -qE "package-lock\.json"; then
    info "package-lock.json alterado — reinstalando dependências..."
    runuser -u "$APP_USER" -- npm ci --prefer-offline
fi

if echo "$CHANGED" | grep -qE "^client/"; then
    info "Arquivos do cliente alterados — rebuilding..."
    runuser -u "$APP_USER" -- npm run build --workspace=client
    # Garante que o nginx consiga ler os novos assets
    chmod -R a+rX "$APP_DIR/client/dist"
fi

info "Reiniciando mytube-server..."
systemctl restart mytube-server

info "Atualização concluída. HEAD: $(git rev-parse HEAD | cut -c1-7)"
info "Arquivos alterados:"
echo "$CHANGED" | sed 's/^/  /'
