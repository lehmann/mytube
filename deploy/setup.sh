#!/usr/bin/env bash
# setup.sh — provisionamento inicial do servidor Ubuntu
# Execute uma única vez como root: sudo bash deploy/setup.sh
#
# O que este script faz:
#   1. Instala Node.js 20, nginx, git e yt-dlp via apt/pip
#   2. Cria o usuário de sistema "myyoutube"
#   3. Clona o repositório em /opt/myyoutube
#   4. Instala dependências npm e constrói o cliente
#   5. Registra e ativa os serviços systemd (backend + timer de sync)
#   6. Configura o nginx como reverse proxy
#
# Repositório privado?
#   Configure um deploy key no GitHub e adicione-o em ~/.ssh/
#   antes de executar, ou troque a REPO_URL por um token:
#   https://<token>@github.com/lehmann/myyoutube

set -euo pipefail

# ── Configuração ────────────────────────────────────────────────────────────
REPO_URL="https://github.com/lehmann/myyoutube"
BRANCH="main"
APP_DIR="/opt/myyoutube"
APP_USER="myyoutube"
NODE_MAJOR=20
# ────────────────────────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
info() { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
die()  { echo -e "${RED}✗ ERRO:${NC} $*" >&2; exit 1; }
step() { echo -e "\n${BOLD}── $* ──${NC}"; }

[ "$EUID" -eq 0 ] || die "Execute como root: sudo bash $0"

# ── 1. Node.js ───────────────────────────────────────────────────────────────
step "Node.js ${NODE_MAJOR}"
if node --version 2>/dev/null | grep -q "^v${NODE_MAJOR}"; then
    info "Node.js $(node --version) já instalado."
else
    info "Instalando Node.js ${NODE_MAJOR} via NodeSource..."
    apt-get update -qq
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null
    apt-get install -y nodejs
    info "Node: $(node --version) | npm: $(npm --version)"
fi

# ── 2. nginx + git + yt-dlp ──────────────────────────────────────────────────
step "nginx, git e yt-dlp"
apt-get install -y nginx git python3-pip
# yt-dlp: instalado globalmente via pip para ficar em /usr/local/bin
pip3 install -q --upgrade yt-dlp
info "nginx $(nginx -v 2>&1 | grep -oP '\d+\.\d+\.\d+')"
info "yt-dlp $(yt-dlp --version)"

# ── 3. Usuário de sistema ────────────────────────────────────────────────────
step "Usuário $APP_USER"
if id "$APP_USER" &>/dev/null; then
    info "Usuário $APP_USER já existe."
else
    useradd --system --shell /usr/sbin/nologin --home-dir "$APP_DIR" "$APP_USER"
    info "Usuário $APP_USER criado."
fi

# ── 4. Clonar repositório ────────────────────────────────────────────────────
step "Repositório"
if [ -d "$APP_DIR/.git" ]; then
    info "Repositório já existe em $APP_DIR — atualizando..."
    runuser -u "$APP_USER" -- git -C "$APP_DIR" pull origin "$BRANCH"
else
    info "Clonando $REPO_URL..."
    git clone "$REPO_URL" "$APP_DIR"
    chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
fi

# ── 5. Dependências e build ──────────────────────────────────────────────────
step "npm install + build"
runuser -u "$APP_USER" -- npm ci --prefix "$APP_DIR"
runuser -u "$APP_USER" -- npm run build --workspace=client --prefix "$APP_DIR"
# Permite que o nginx (www-data) leia os assets compilados
chmod -R a+rX "$APP_DIR/client/dist"
info "Build concluído em $APP_DIR/client/dist"

# ── 6. Permissão de execução nos scripts ────────────────────────────────────
chmod +x "$APP_DIR/deploy/sync.sh" "$APP_DIR/deploy/update.sh"

# ── 7. Serviços systemd ──────────────────────────────────────────────────────
step "systemd"
DEPLOY="$APP_DIR/deploy"

cp "$DEPLOY/myyoutube-server.service" /etc/systemd/system/
cp "$DEPLOY/myyoutube-sync.service"   /etc/systemd/system/
cp "$DEPLOY/myyoutube-sync.timer"     /etc/systemd/system/

systemctl daemon-reload
systemctl enable --now myyoutube-server
systemctl enable --now myyoutube-sync.timer

info "myyoutube-server: $(systemctl is-active myyoutube-server)"
info "myyoutube-sync.timer: $(systemctl is-active myyoutube-sync.timer)"

# ── 8. nginx ─────────────────────────────────────────────────────────────────
step "nginx"
cp "$DEPLOY/nginx.conf" /etc/nginx/sites-available/myyoutube

# Ativa o site e remove o default
ln -sf /etc/nginx/sites-available/myyoutube /etc/nginx/sites-enabled/myyoutube
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx
info "nginx recarregado."

# ── Resumo ───────────────────────────────────────────────────────────────────
IP=$(hostname -I | awk '{print $1}')
echo ""
echo -e "${BOLD}╔══════════════════════════════════════╗${NC}"
echo -e "${BOLD}║   MyYouTube instalado com sucesso!   ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════╝${NC}"
echo ""
echo -e "  App:          ${GREEN}http://${IP}${NC}"
echo -e "  Backend:      http://127.0.0.1:3001"
echo -e "  Sync:         a cada 10 min (systemd timer)"
echo ""
echo -e "  Logs backend: ${YELLOW}journalctl -u myyoutube-server -f${NC}"
echo -e "  Logs sync:    ${YELLOW}journalctl -u myyoutube-sync -f${NC}"
echo -e "  Atualizar já: ${YELLOW}sudo bash $APP_DIR/deploy/update.sh${NC}"
echo ""
