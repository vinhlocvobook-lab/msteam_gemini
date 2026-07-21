# Hướng Dẫn Quản Lý Biến Môi Trường & Chuyển Đổi Dev / Production

Tài liệu này hướng dẫn cách cấu hình và quản lý biến môi trường (Environment Variables) cho ứng dụng **Synapse Collaboration** (Backend Node.js/Express + Frontend React/Vite) khi chuyển từ môi trường **Development (Dev)** sang **Production (Sản xuất)** mà **không thay đổi Source Code**.

---

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

1. **Một Bộ Source Code Cho Mọi Môi Trường (Single Codebase)**:
   - Không hardcode các thông số cố định như `http://localhost:5000`, mật khẩu Database, secret key trong code.
   - Mọi giá trị thay đổi theo môi trường đều phải nạp qua biến môi trường (`process.env` cho Node.js hoặc `import.meta.env` cho Vite).

2. **Bảo Mật Tuyệt Đối (Security First)**:
   - Các file `.env`, `.env.development`, `.env.production`, `.env.local` chứa thông tin nhạy cảm thật **TUYỆT ĐỐI KHÔNG COMMIT LÊN GIT**.
   - Chỉ commit các file mẫu chứa tên biến và placeholder như `.env_sample` (hoặc `.env.example`).
   - Đảm bảo các đường dẫn `.env` đã được liệt kê trong `.gitignore`.

3. **Tách Biệt Môi Trường (Environment Isolation)**:
   - Môi trường Dev phục vụ việc lập trình, debug, chạy trên `localhost`.
   - Môi trường Production tối ưu hiệu năng, bảo mật cao, chạy với tên miền thật (HTTPS) và Database sản xuất.

---

## 2. Quản Lý Môi Trường Trên Frontend (Vite + React)

Vite cung cấp sẵn cơ chế tự động nạp file cấu hình môi trường dựa theo lệnh thực thi.

### 2.1 Cấu trúc file cấu hình Frontend

Tạo các file sau trong thư mục `frontend/`:

* **`frontend/.env.development`** (Dùng khi chạy `npm run dev`):
  ```env
  VITE_BACKEND_BASE_URL=http://localhost:5000
  ```

* **`frontend/.env.production`** (Dùng khi chạy `npm run build`):
  ```env
  VITE_BACKEND_BASE_URL=https://api.yourdomain.com
  ```

### 2.2 Quy tắc biến môi trường Vite
- Mọi biến môi trường dùng ở Client Frontend **phải bắt đầu bằng tiền tố `VITE_`** (Ví dụ: `VITE_BACKEND_BASE_URL`). Các biến không có tiền tố này sẽ bị Vite bỏ qua để đảm bảo an toàn.

### 2.3 Cách truy cập trong Code Frontend
Trong code React (ví dụ: `frontend/src/utils/api.js` hoặc socket connection):

```javascript
// Vite tự động nạp đúng giá trị tùy theo môi trường dev hay build
const API_BASE_URL = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:5000';
```

### 2.4 Lệnh thực thi Frontend
- **Khi Dev**:
  ```bash
  cd frontend
  npm run dev
  # Vite sẽ đọc frontend/.env.development
  ```
- **Khi Build cho Production**:
  ```bash
  cd frontend
  npm run build
  # Vite sẽ đọc frontend/.env.production và đóng gói tĩnh vào thư mục dist/
  ```

---

## 3. Quản Lý Môi Trường Trên Backend (Node.js + Express)

Đối với Backend Node.js, bạn có 2 phương pháp quản lý file môi trường:

### Phương Pháp 1: Mỗi Server Giữ 1 File `.env` Duy Nhất (Khuyên Dùng)

Do Backend trên máy lập trình và trên Server Production chạy ở 2 môi trường vật lý độc lập (hoặc 2 container Docker riêng biệt):

- **Trên máy Local (Dev)**: Tạo file `backend/.env` với thông số Local (Ví dụ: DB `localhost`, PORT `5000`, `NODE_ENV=development`).
- **Trên Server Production**: Tạo file `backend/.env` trên server đó với thông số thật (Ví dụ: DB production, `NODE_ENV=production`, HTTPS domain).

Code Backend giữ nguyên khởi tạo `dotenv`:
```javascript
import dotenv from 'dotenv';
dotenv.config(); // Tự động đọc file .env ở thư mục hiện tại
```

---

### Phương Pháp 2: Nạp File Tự Động Theo `NODE_ENV`

Nếu bạn muốn duy trì cả 2 file `backend/.env.development` và `backend/.env.production` ở thư mục backend:

#### 1. Cập nhật `backend/package.json`:
```json
{
  "scripts": {
    "dev": "NODE_ENV=development nodemon index.js",
    "start": "NODE_ENV=production node index.js"
  }
}
```

#### 2. Cập nhật `backend/index.js`:
```javascript
import dotenv from 'dotenv';
import path from 'path';

// Xác định file env cần nạp
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
dotenv.config({ path: path.resolve(process.cwd(), envFile) });
```

---

## 4. Xử Lý CORS & Security Theo Môi Trường

Trong `backend/index.js`, danh sách các nguồn được phép truy cập (CORS Allowed Origins) cần tự động thay đổi theo cấu hình môi trường:

```javascript
// Lấy danh sách origins từ biến môi trường WEB_ORIGINS (phân cách bằng dấu phẩy)
const allowedOrigins = process.env.WEB_ORIGINS
  ? process.env.WEB_ORIGINS.split(',').map(item => item.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Cho phép các truy cập không có origin (như curl, mobile apps)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('Cross-Origin Request Blocked by CORS Policy'));
  },
  credentials: true
}));
```

### Cấu hình `WEB_ORIGINS` tương ứng:
- **Dev (`.env.development`)**:
  ```env
  WEB_ORIGINS=http://localhost:5173,http://localhost:3000
  ```
- **Production (`.env.production`)**:
  ```env
  WEB_ORIGINS=https://app.yourdomain.com,https://dashboard.yourdomain.com
  ```

---

## 5. Bảng Danh Sách Các Biến Môi Trường Quan Trọng

### Backend (`backend/.env_sample`)

| Tên Biến | Giá Trị Mẫu Dev | Ý Nghĩa / Mục Đích |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` / `production` | Chế độ chạy ứng dụng |
| `PORT` | `5000` | Port backend lắng nghe |
| `WEB_ORIGINS` | `http://localhost:5173` | Danh sách URL Frontend được phép gọi API (CORS) |
| `DB_HOST` | `localhost` / `127.0.0.1` | Địa chỉ Server Database MySQL |
| `DB_PORT` | `3306` | Port Database MySQL |
| `DB_USER` | `root` | Username kết nối DB |
| `DB_PASSWORD` | `your_password` | Mật khẩu kết nối DB |
| `DB_NAME` | `synapse_db` | Tên Database |
| `MICROSOFT_CLIENT_ID` | `xxx-xxx-xxx` | Client ID ứng dụng Azure AD |
| `MICROSOFT_CLIENT_SECRET` | `secret_value` | Client Secret Azure AD |
| `MICROSOFT_REDIRECT_URI` | `http://localhost:5173/microsoft-callback.html` | URL Callback OAuth2 (Prod cần HTTPS) |
| `APP_JWT_SECRET` | Key chuỗi ngẫu nhiên dài | Secret ký Access Token JWT |
| `APP_JWT_REFRESH_SECRET` | Key chuỗi ngẫu nhiên dài | Secret ký Refresh Token JWT |
| `ENCRYPTION_KEY` | Key 32-byte | Khóa mã hóa AES-256 dữ liệu nhạy cảm |
| `AI_PROVIDER` | `gemini` / `openai` / `ollama` | Provider AI sử dụng |
| `AI_API_KEY` | API Key của AI Provider | Key kết nối dịch vụ AI |

### Frontend (`frontend/.env_sample`)

| Tên Biến | Giá Trị Mẫu Dev | Ý Nghĩa / Mục Đích |
| :--- | :--- | :--- |
| `VITE_BACKEND_BASE_URL` | `http://localhost:5000` | URL Backend API mà Frontend gửi request tới |

---

## 6. Checklist Quy Trình Deploy Lên Production

- [ ] **Bước 1**: Đảm bảo `.gitignore` đã chặn tất cả các file `.env` (`.env`, `.env.local`, `.env.production`, `.env.development`).
- [ ] **Bước 2**: Đảm bảo file `.env_sample` trên Git luôn được cập nhật đủ tên biến mới (chỉ để placeholder, không để secret thật).
- [ ] **Bước 3**: Trên Server Production:
  - Tạo file `backend/.env` với các tham số DB thật, secret key thật, `NODE_ENV=production`.
  - Tạo file `frontend/.env.production` trỏ `VITE_BACKEND_BASE_URL` về domain thật backend.
- [ ] **Bước 4**: Đóng gói Frontend bằng `npm run build` và deploy thư mục `dist/` lên Web Server (Nginx, Caddy, Vercel, Netlify...).
- [ ] **Bước 5**: Chạy Backend Production bằng `npm start` hoặc quản lý qua Process Manager (PM2 / Docker / Systemd).

---

## 7. Quản Lý Tính Năng Giao Diện Theo Môi Trường (UI Feature Flags)

Ứng dụng Synapse sử dụng flag môi trường chuẩn của Vite `import.meta.env.DEV` để tự động kiểm soát hiển thị các tính năng dành riêng cho môi trường phát triển (Development):

### Các tính năng ẩn trên Production (chỉ hiển thị ở Dev):
1. **Nút "Đồng bộ Teams" ([App.jsx:L4743](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/frontend/src/App.jsx#L4743))**:
   - Được bao bọc bởi `{import.meta.env.DEV && (...)}`.
   - Giúp tránh việc người dùng bấm nhầm gửi polling request ngắt quãng hoặc spam API Teams trên Production.
2. **Khu vực Tài khoản thử nghiệm (Mock Accounts Login) ([App.jsx:L4392](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/frontend/src/App.jsx#L4392))**:
   - Được bao bọc bởi `{import.meta.env.DEV && (...)}`.
   - Cho phép các Lập trình viên chọn nhanh 4 tài khoản thử nghiệm khi chạy `npm run dev`, tự động ẩn hoàn toàn trên trang Login Production khi chạy `npm run build`.
