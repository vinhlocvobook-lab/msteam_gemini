#!/usr/bin/env bash
# ==============================================================================
# Synapse Collaboration — Script Deploy Tự Động Từ Máy Local Lên Server
# ==============================================================================
# Hướng dẫn sử dụng:
#   1. Phân quyền thực thi: chmod +x scripts/deploy.sh
#   2. Chạy lệnh: ./scripts/deploy.sh
#   Hoặc tùy chỉnh server: SERVER_USER=root SERVER_HOST=vdt.net.vn ./scripts/deploy.sh
# ==============================================================================
set -e

# Các tham số cấu hình Server (có thể ghi đè bằng biến môi trường)
SERVER_USER="${SERVER_USER:-root}"
SERVER_HOST="${SERVER_HOST:-vdt.net.vn}"
SERVER_FRONTEND_PATH="${SERVER_FRONTEND_PATH:-/var/www/vdt_net_vn/mptech}"
SERVER_BACKEND_PATH="${SERVER_BACKEND_PATH:-/var/www/vdt_net_vn/backend}"
PM2_APP_NAME="${PM2_APP_NAME:-mptech-backend}"

# Đường dẫn thư mục gốc dự án
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "======================================================================"
echo "🚀 BẮT ĐẦU QUY TRÌNH DEPLOY TỰ ĐỘNG LÊN SERVER"
echo "======================================================================"
echo "📍 Server Target : ${SERVER_USER}@${SERVER_HOST}"
echo "📍 Frontend Path : ${SERVER_FRONTEND_PATH}"
echo "📍 Backend Path  : ${SERVER_BACKEND_PATH}"
echo "📍 PM2 App Name  : ${PM2_APP_NAME}"
echo "----------------------------------------------------------------------"

# 1. Build Frontend tại Local
echo ""
echo "📦 [1/4] Đang đóng gói Frontend (npm run build)..."
cd "${ROOT_DIR}/frontend"
npm run build
echo "✅ Build Frontend hoàn tất! Thư mục dist/ đã sẵn sàng."

# 2. Upload Frontend assets lên Server
echo ""
echo "📤 [2/4] Đang sync dữ liệu Frontend (dist/) lên Server..."
rsync -avz --delete "${ROOT_DIR}/frontend/dist/" "${SERVER_USER}@${SERVER_HOST}:${SERVER_FRONTEND_PATH}/"

# Đảm bảo file .htaccess tồn tại cho SPA Routing trên Apache
echo "⚙️ Đang đảm bảo cấu hình .htaccess cho Frontend..."
ssh "${SERVER_USER}@${SERVER_HOST}" "cat << 'EOF' > ${SERVER_FRONTEND_PATH}/.htaccess
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /mptech/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /mptech/index.html [L]
</IfModule>
EOF"
echo "✅ Triển khai Frontend hoàn tất!"

# 3. Upload Backend files lên Server
echo ""
echo "📤 [3/4] Đang sync mã nguồn Backend lên Server..."
rsync -avz \
  --exclude 'node_modules' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env.development' \
  --exclude 'test_*' \
  --exclude '.git' \
  "${ROOT_DIR}/backend/" "${SERVER_USER}@${SERVER_HOST}:${SERVER_BACKEND_PATH}/"

echo "✅ Sync Backend hoàn tất!"

# 4. Khởi chạy / Reload Backend trên Server qua SSH & PM2
echo ""
echo "🔄 [4/4] Đang cài đặt thư viện & khởi động lại dịch vụ Backend (PM2)..."
ssh "${SERVER_USER}@${SERVER_HOST}" "bash -s" << EOF
  set -e
  cd ${SERVER_BACKEND_PATH}
  
  # Cài đặt package sản xuất
  npm install --production --silent
  
  # Kiểm tra và khởi chạy/reload dịch vụ bằng PM2
  if pm2 list | grep -q "${PM2_APP_NAME}"; then
    echo "🔄 Đang reload tiến trình PM2 '${PM2_APP_NAME}'..."
    pm2 reload "${PM2_APP_NAME}" --update-env
  else
    echo "🚀 Đang khởi chạy tiến trình PM2 mới '${PM2_APP_NAME}'..."
    NODE_ENV=production pm2 start index.js --name "${PM2_APP_NAME}"
  fi
  
  pm2 save
EOF

echo ""
echo "======================================================================"
echo "🎉 TẤT CẢ CÁC BƯỚC DEPLOY ĐÃ HOÀN THÀNH THÀNH CÔNG!"
echo "======================================================================"
echo "🌐 URL Frontend : https://${SERVER_HOST}/mptech/"
echo "🌐 Health Check : https://${SERVER_HOST}/mptech_task_management/health"
echo "======================================================================"
