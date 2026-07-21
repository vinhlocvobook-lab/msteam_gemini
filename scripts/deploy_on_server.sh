#!/usr/bin/env bash
# ==============================================================================
# Synapse Collaboration — Script Deploy Tự Động Trực Tiếp Trên Server
# ==============================================================================
# Hướng dẫn sử dụng:
#   Dùng khi bạn muốn Git Pull và Build trực tiếp ngay trên Server Linux.
#   1. Phân quyền: chmod +x scripts/deploy_on_server.sh
#   2. Chạy lệnh: ./scripts/deploy_on_server.sh
# ==============================================================================
set -e

SERVER_FRONTEND_PATH="${SERVER_FRONTEND_PATH:-/var/www/vdt_net_vn/mptech}"
SERVER_BACKEND_PATH="${SERVER_BACKEND_PATH:-/var/www/vdt_net_vn/backend}"
PM2_APP_NAME="${PM2_APP_NAME:-mptech-backend}"

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "======================================================================"
echo "🚀 BẮT ĐẦU DEPLOY TRỰC TIẾP TRÊN SERVER"
echo "======================================================================"

# 1. Build Frontend
echo ""
echo "📦 [1/3] Build Frontend tại Server..."
cd "${ROOT_DIR}/frontend"
npm install --silent
npm run build

echo "📤 Đang copy file dist sang ${SERVER_FRONTEND_PATH}..."
mkdir -p "${SERVER_FRONTEND_PATH}"
cp -r dist/* "${SERVER_FRONTEND_PATH}/"

# Đảm bảo .htaccess cho SPA Routing
cat << 'EOF' > "${SERVER_FRONTEND_PATH}/.htaccess"
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /mptech/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /mptech/index.html [L]
</IfModule>
EOF

# 2. Sync Backend
echo ""
echo "📦 [2/3] Cập nhật Backend tại ${SERVER_BACKEND_PATH}..."
mkdir -p "${SERVER_BACKEND_PATH}"
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude 'test_*' \
  --exclude '.git' \
  "${ROOT_DIR}/backend/" "${SERVER_BACKEND_PATH}/"

# 3. Restart PM2
echo ""
echo "🔄 [3/3] Cài đặt dependencies & Restart PM2 service..."
cd "${SERVER_BACKEND_PATH}"
npm install --production --silent

if pm2 list | grep -q "${PM2_APP_NAME}"; then
  pm2 reload "${PM2_APP_NAME}" --update-env
else
  NODE_ENV=production pm2 start index.js --name "${PM2_APP_NAME}"
fi
pm2 save

echo ""
echo "🎉 DEPLOY TRÊN SERVER THÀNH CÔNG!"
