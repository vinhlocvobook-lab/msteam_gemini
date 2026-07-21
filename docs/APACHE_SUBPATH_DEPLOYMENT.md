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
