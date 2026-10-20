#!/bin/sh
# Prepara una VM Ubuntu 24.04 recién creada (Azure) para WeatherMapZ. Ejecútalo una sola vez con sudo:
#
#   ssh azureuser@<IP> 'sudo sh -s' -- "<clave pública SSH de GitHub Actions>" < deploy/setup-server.sh
#
# Instala Docker, abre solo SSH/HTTP/HTTPS en el cortafuegos, añade 2 GB de swap (el import de
# edificios y PostGIS no caben holgados en 2 GB de RAM) y crea el usuario `deploy`, que es el que
# usa GitHub Actions. Ojo: estar en el grupo docker equivale a ser root en el servidor.
set -eu

DEPLOY_PUBLIC_KEY="${1:?Pasa como argumento la clave pública SSH que usará GitHub Actions}"
APP_DIR=/opt/weathermapz

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get -y upgrade
apt-get -y install ca-certificates curl ufw unattended-upgrades

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$DEPLOY_PUBLIC_KEY" /home/deploy/.ssh/authorized_keys ||
  echo "$DEPLOY_PUBLIC_KEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

install -d -m 750 -o deploy -g deploy "$APP_DIR"

echo "Servidor listo. Crea $APP_DIR/.env a partir de deploy/production.env.example."
