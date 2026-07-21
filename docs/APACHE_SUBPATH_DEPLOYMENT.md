# Hướng Dẫn Triển Khai Apache Subpath Deployment

Tài liệu này hướng dẫn chi tiết cách triển khai ứng dụng **Synapse Collaboration** (Frontend React/Vite + Backend Node.js/Express) trên Web Server Apache chạy dưới cấu hình **Subpath (Thư mục con)** trên cùng tên miền chính mà không ảnh hưởng tới trang web hiện tại.

---

## 1. Môi Trường Triển Khai (Deployment Architecture)

| Thành phần | Thông số Production | Thông số Local Dev |
| :--- | :--- | :--- |
| **Domain chính** | `https://vdt.net.vn` | `http://localhost:5173` |
| **DocumentRoot** | `/var/www/vdt_net_vn` | - |
| **Frontend Subpath** | `/var/www/vdt_net_vn/mptech` (`https://vdt.net.vn/mptech`) | `http://localhost:5173/` |
| **Backend API Subpath** | `https://vdt.net.vn/mptech_task_management/` | `http://localhost:5001/` |
| **Backend Node.js Port** | `127.0.0.1:5001` (qua Apache ProxyPass) | `http://localhost:5001` |

---

## 2. Cấu Hình Frontend (React + Vite)

### 2.1 Cấu hình Base Path trong `frontend/vite.config.js`
Đảm bảo file `frontend/vite.config.js` tự động nhận diện base path khi build production:

```javascript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    // Khi chạy dev local: base = '/'
    // Khi build production: base = '/mptech/'
    base: env.VITE_BASE_PATH || (mode === 'production' ? '/mptech/' : '/'),
  };
})
```

### 2.2 File môi trường Frontend trên Server (`frontend/.env.production`)
Tạo file `frontend/.env.production` trước khi build:

```env
VITE_BACKEND_BASE_URL=https://vdt.net.vn/mptech_task_management
VITE_BASE_PATH=/mptech/
```

### 2.3 Lệnh Build & Upload Frontend
```bash
# 1. Đi tới thư mục frontend
cd frontend

# 2. Đóng gói ứng dụng cho Production
npm run build

# 3. Copy toàn bộ file trong frontend/dist/* vào server
# Upload nội dung thư mục frontend/dist/ vào /var/www/vdt_net_vn/mptech/
```

---

## 3. Cấu Hình Apache VirtualHost & Reverse Proxy

Trong file cấu hình Apache VirtualHost (`/etc/apache2/sites-available/vdt.net.vn.conf`):

```apache
<VirtualHost *:443>
    ServerName vdt.net.vn
    ServerAlias www.vdt.net.vn
    DocumentRoot /var/www/vdt_net_vn

    # ... Các cấu hình SSL & Directory hiện có ...

    # ============================================================
    # MPTECH TASK MANAGEMENT BACKEND PROXY & WEBSOCKETS
    # ============================================================

    # 1. Hỗ trợ WebSocket Proxy cho Socket.io (Thông báo Real-time)
    RewriteEngine On
    RewriteCond %{HTTP:Upgrade} =websocket [NC]
    RewriteRule ^/mptech_task_management/(.*) ws://127.0.0.1:5001/$1 [P,L]

    # 2. Reverse Proxy cho REST API Backend
    ProxyPass /mptech_task_management/ http://127.0.0.1:5001/
    ProxyPassReverse /mptech_task_management/ http://127.0.0.1:5001/
</VirtualHost>
```

> **Lưu ý quan trọng**: Phải bật các Apache modules cần thiết:
> ```bash
> sudo a2enmod proxy proxy_http proxy_wstunnel rewrite
> sudo systemctl restart apache2
> ```

---

## 4. Cấu Hình SPA Rewrite Cho Frontend (Tránh Lỗi 404 khi F5)

Tạo file `/var/www/vdt_net_vn/mptech/.htaccess` trên server:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /mptech/
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /mptech/index.html [L]
</IfModule>
```

---

## 5. Cấu Hình Backend (Node.js)

### 5.1 File môi trường Backend trên Server (`backend/.env`)
Tạo file `backend/.env` tại thư mục backend trên server:

```env
NODE_ENV=production
PORT=5001
WEB_ORIGINS=https://vdt.net.vn

# Microsoft OAuth Callback URL
MICROSOFT_REDIRECT_URI=https://vdt.net.vn/mptech/microsoft-callback.html

# Database & Credentials thật...
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=synapse_user
DB_PASSWORD=your_secure_db_password
DB_NAME=synapse_db
```

### 5.2 Quản Lý Tiến Trình Backend Bằng PM2
```bash
cd /var/www/vdt_net_vn/backend # Hoặc thư mục chứa backend trên server

# Cài đặt dependencies
npm install --production

# Chạy backend với PM2
pm2 start index.js --name "mptech-backend"
pm2 save
```

---

## 6. Quy Trình Kiểm Thử & Xác Nhận (Verification Checklist)

1. **Kiểm tra Backend Health API**:
   - Truy cập: `https://vdt.net.vn/mptech_task_management/health`
   - Kết quả kỳ vọng: `{"status":"healthy","timestamp":"..."}`

2. **Kiểm tra Frontend Interface**:
   - Truy cập: `https://vdt.net.vn/mptech/`
   - Đảm bảo giao diện tải đầy đủ CSS/JS, không bị lỗi 404 assets.

3. **Kiểm tra Real-time WebSocket**:
   - Mở Console F12 trình duyệt tại `https://vdt.net.vn/mptech/`.
   - Xác nhận có log: `[SOCKET] Connected to real-time notification server`.

---

## 7. Script Deploy Tự Động (Automated Deployment Script)

Dự án cung cấp 2 script deploy tự động tại thư mục `scripts/`:

### 7.1 Deploy từ máy Local lên Server (`scripts/deploy.sh`)
Script tự động đóng gói Frontend (`npm run build`), rsync giao diện và mã nguồn Backend lên Server, tự động cập nhật `.htaccess` và reload tiến trình PM2 thông qua SSH:

```bash
# Chạy trực tiếp từ máy local
./scripts/deploy.sh

# Hoặc tùy chỉnh IP/User Server:
SERVER_USER=root SERVER_HOST=vdt.net.vn ./scripts/deploy.sh
```

### 7.2 Deploy trực tiếp trên Server (`scripts/deploy_on_server.sh`)
Dùng khi bạn mở terminal trên Server (hoặc sau khi `git pull` trên Server):

```bash
./scripts/deploy_on_server.sh
```

........
Mình đã tạo 2 file script hỗ trợ deploy tự động nằm trong thư mục 

scripts/
:

1. Script Deploy từ máy Local lên Server (scripts/deploy.sh)
File: 

scripts/deploy.sh

Các bước script sẽ tự động làm:

Đóng gói Frontend bằng npm run build ở local.
Dùng rsync đẩy thư mục dist/ lên /var/www/vdt_net_vn/mptech/.
Tự động sinh/cập nhật file .htaccess cho SPA Routing.
rsync mã nguồn backend/ lên /var/www/vdt_net_vn/backend/ (bỏ qua node_modules và .env).
Chạy lệnh trên Server qua SSH để: npm install --production và reload tiến trình PM2 (mptech-backend).
cách chạy từ máy local của bạn:
bash
# Chạy trực tiếp với cấu hình mặc định (root@vdt.net.vn)
./scripts/deploy.sh
# Hoặc nếu bạn muốn tùy chỉnh user/domain/thư mục:
SERVER_USER=root SERVER_HOST=vdt.net.vn ./scripts/deploy.sh
2. Script Deploy trực tiếp trên Server (scripts/deploy_on_server.sh)
File: 

scripts/deploy_on_server.sh

Dành cho trường hợp bạn đã SSH vào Server (hoặc sau khi gõ git pull trên Server):

bash
# Phân quyền & chạy trực tiếp trên Server Linux
chmod +x scripts/deploy_on_server.sh
./scripts/deploy_on_server.sh
🚀 Đồng bộ lên GitHub
Cả 2 file script deploy đã được cấp quyền thực thi (chmod +x), commit và push lên branch v1.0 trên GitHub repo (origin/v1.0).

14:01
delete luôn các user test luôn giúp mình
14:46
Đã cập nhật cấu hình xóa các tài khoản thử nghiệm và giữ lại tài khoản locvv@minhphu.onmicrosoft.com thành công!

📋 Chi Tiết Thay Đổi:
Xóa User Thử Nghiệm (backend/reset_db_tasks.js):

Cập nhật logic xóa sạch các user mẫu (loc, lan, huy, binh / đuôi @synapse.com).
Giữ lại hoàn toàn tài khoản thật locvv@minhphu.onmicrosoft.com.
Khóa Tự Sinh User Thử Nghiệm Trên Production (backend/db.js):

Khi khởi chạy backend ở chế độ NODE_ENV=production, hệ thống sẽ bỏ qua việc tự sinh 4 user mẫu, đảm bảo database sản xuất không bị nhiễm tài khoản giả lập.
🚀 Đồng bộ lên GitHub
Thay đổi đã được commit và push lên branch v1.0 trên GitHub repo (origin/v1.0).

Khi chạy lệnh deploy trên server (./scripts/deploy.sh hoặc ./scripts/deploy_on_server.sh), hệ thống sẽ tự động cập nhật mã nguồn mới này!