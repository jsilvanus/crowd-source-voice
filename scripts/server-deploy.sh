#!/usr/bin/env bash
# Deploys or redeploys crowd-source-voice on this server:
#   clone (first run) or pull, create .env.server with fresh secrets (first run), build the image,
#   start PostgreSQL, run the migrations (and the seed on the first deploy), (re)start the app on
#   127.0.0.1:4102 for the host's nginx.
#
#   bash /home/deploy/deploy/crowd-source-voice/scripts/server-deploy.sh
#   (or a copy of this file from anywhere: it clones the repository on the first run)
#
# Environment (all optional):
#   BASE_DIR       /home/deploy/deploy        the checkout goes to $BASE_DIR/crowd-source-voice
#   DEPLOY_BRANCH  main                       branch to deploy
#   REPO_URL       https://github.com/jsilvanus/crowd-source-voice.git
#   DOMAIN         asked on the first run     public domain (only used when .env.server is created)
#   ADMIN_EMAIL    asked on the first run     first admin account (created by the seed)
#   HOST_PORT      4102                       127.0.0.1 port nginx proxies to (first run only)
#
# Secrets live in $BASE_DIR/crowd-source-voice/.env.server (mode 600, gitignored). It is never
# overwritten; edit it and run this script again to apply changes.
set -euo pipefail

NAME=crowd-source-voice
DEFAULT_DOMAIN=voice.italeino.fi
BASE_DIR=${BASE_DIR:-/home/deploy/deploy}
APP_DIR=$BASE_DIR/$NAME
BRANCH=${DEPLOY_BRANCH:-main}
REPO_URL=${REPO_URL:-https://github.com/jsilvanus/$NAME.git}
ENV_FILE=$APP_DIR/.env.server
KEPT_ENV=$BASE_DIR/.kept/$NAME.env
SEEDED_MARK=$APP_DIR/.env.server.seeded
SELF=scripts/server-deploy.sh

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }
secret() { openssl rand -hex 32; }

command -v git >/dev/null || die "git is not installed"
command -v openssl >/dev/null || die "openssl is not installed"
docker compose version >/dev/null 2>&1 || die "docker compose (v2) is not available for $(id -un)"

# --- 1. Code ------------------------------------------------------------------------------------
# After updating the checkout, re-run the checkout's own copy of this script (once), so a changed
# script takes effect in the same deployment.
if [ -z "${SERVER_DEPLOY_REEXEC:-}" ]; then
  if [ -d "$APP_DIR/.git" ]; then
    log "Updating $APP_DIR ($BRANCH)"
    git -C "$APP_DIR" fetch --prune origin "$BRANCH"
    git -C "$APP_DIR" checkout -q "$BRANCH"
    git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
  else
    [ -e "$APP_DIR" ] && die "$APP_DIR exists but is not a git checkout"
    log "Cloning $REPO_URL ($BRANCH) into $APP_DIR"
    mkdir -p "$BASE_DIR"
    git clone --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
  fi
  if [ -f "$APP_DIR/$SELF" ]; then
    SERVER_DEPLOY_REEXEC=1 exec bash "$APP_DIR/$SELF" "$@"
  fi
fi
cd "$APP_DIR"
log "Deploying $NAME at commit $(git rev-parse --short HEAD)"

# --- 2. Settings and secrets (first run only) ----------------------------------------------------
if [ ! -f "$ENV_FILE" ] && [ -f "$KEPT_ENV" ]; then
  log "Restoring settings kept by server-remove.sh ($KEPT_ENV)"
  mv "$KEPT_ENV" "$ENV_FILE"
  touch "$SEEDED_MARK"   # the kept database already has its admin
fi
if [ ! -f "$ENV_FILE" ]; then
  if [ -z "${DOMAIN:-}" ] && [ -t 0 ]; then
    read -r -p "Public domain for $NAME [$DEFAULT_DOMAIN]: " DOMAIN
  fi
  DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
  if [ -z "${ADMIN_EMAIL:-}" ] && [ -t 0 ]; then
    read -r -p "Admin e-mail for $NAME [admin@$DOMAIN]: " ADMIN_EMAIL
  fi
  ADMIN_EMAIL=${ADMIN_EMAIL:-admin@$DOMAIN}
  umask 077
  cat > "$ENV_FILE" <<EOF
# crowd-source-voice server settings (scripts/server-deploy.sh). Never commit this file.
DOMAIN=$DOMAIN
HOST_PORT=${HOST_PORT:-4102}

# Bundled PostgreSQL (docker-compose.server.yml). The password only applies when the volume is created.
POSTGRES_PASSWORD=$(secret)

JWT_SECRET=$(secret)
# Never change after data has been exported (speaker ids derive from it).
SPEAKER_ID_SALT=$(secret)
# Optional read-only token for dataset sync (e.g. liturgos-auditor): EXPORT_API_TOKEN=\$(openssl rand -hex 32)
EXPORT_API_TOKEN=
CLIENT_URL=https://$DOMAIN
LOG_LEVEL=info

# local = files in the uploads volume; s3 = see docs/DEPLOYMENT.md (S3_* variables).
STORAGE_DRIVER=local

# First admin, created by the seed on the first deploy only (changing these later has no effect).
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$(openssl rand -base64 18 | tr -d '/+=')
EOF
  chmod 600 "$ENV_FILE"
  log "Created $ENV_FILE"
fi

dc() { docker compose -p "$NAME" --project-directory "$APP_DIR" -f docker-compose.server.yml --env-file "$ENV_FILE" "$@"; }
env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

# --- 3. Build, database, migrations, start -------------------------------------------------------
log "Building image"
dc build --pull

log "Starting database"
dc up -d --wait db

log "Running migrations"
dc run --rm --no-deps app node server/db/migrate.js

if [ ! -f "$SEEDED_MARK" ]; then
  log "First deploy: seeding the admin account and the sample corpus"
  dc run --rm --no-deps app node server/db/seed.js
  touch "$SEEDED_MARK"
  log "Admin login: $(env_value ADMIN_EMAIL) / $(env_value ADMIN_PASSWORD)   (also in $ENV_FILE)"
fi

log "Starting app"
dc up -d --remove-orphans

# --- 4. Check ------------------------------------------------------------------------------------
PORT=$(env_value HOST_PORT)
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/api/health"; then
    docker image prune -f >/dev/null
    log "OK: $NAME is up on 127.0.0.1:$PORT (https://$(env_value DOMAIN) once nginx is set up)"
    exit 0
  fi
  sleep 2
done
dc logs --tail 50 app
die "$NAME did not answer on http://127.0.0.1:$PORT/api/health"
