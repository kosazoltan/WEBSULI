#!/bin/bash

# Kilépés hiba esetén
set -e

echo "🚀 VPS Környezet Telepítése (Ubuntu 20.04/22.04)..."

# Rendszer frissítése
echo "📦 Csomaglista frissítése..."
sudo apt-get update && sudo apt-get upgrade -y

# Alapvető eszközök telepítése
echo "🛠️  Eszközök telepítése (curl, git, build-essential)..."
sudo apt-get install -y curl git build-essential

# Node.js telepítése (v20 LTS)
echo "🟢 Node.js 20.x telepítése..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PostgreSQL telepítése
echo "🐘 PostgreSQL telepítése..."
sudo apt-get install -y postgresql postgresql-contrib

# Nginx telepítése
echo "🌐 Nginx telepítése..."
sudo apt-get install -y nginx

# PM2 telepítése (Process Manager)
echo "⚙️  PM2 telepítése..."
sudo npm install -g pm2

# Tűzfal beállítás (UFW)
echo "shield  Tűzfal beállítása..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
# sudo ufw enable # Ezt manuálisan ajánlott, nehogy kizárd magad

# PostgreSQL Felhasználó és Adatbázis létrehozása
echo "🗄️  Adatbázis előkészítése..."

# Auto-generate password if not provided
if [ -z "$DB_PASSWORD" ]; then
  echo "GENERATING SECURE PASSWORD..."
  DB_PASSWORD=$(openssl rand -base64 12)
fi

echo "Using Database Password: $DB_PASSWORD"


sudo -u postgres psql -c "CREATE USER websuli WITH PASSWORD '$DB_PASSWORD';" || echo "Felhasználó már létezik"
sudo -u postgres psql -c "CREATE DATABASE websuli OWNER websuli;" || echo "Adatbázis már létezik"

echo "✅ Telepítés kész!"
echo ""
echo "Következő lépések:"
echo "1. Másold a projekt fájlokat a szerverre (pl. /var/www/websuli)"
echo "2. Hozd létre a .env fájlt a DATABASE_URL beállításával:"
echo "   DATABASE_URL=postgresql://websuli:$DB_PASSWORD@localhost:5432/websuli"
echo "3. Futtasd: npm install && npm run build"
echo "4. Indítsd el: pm2 start deploy/ecosystem.config.cjs"
echo "5. Konfiguráld az Nginx-et a deploy/nginx.conf.example alapján"
