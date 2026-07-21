# Hướng Dẫn Cấu Hình & Xử Lý Lỗi CORS trong Môi Trường Production

Tài liệu này giải thích chi tiết nguyên lý hoạt động của CORS (Cross-Origin Resource Sharing), lý do các lỗi CORS thường gặp khi triển khai ứng dụng dưới **Subpath / Domain thật** (`https://vdt.net.vn/mptech`), và giải pháp cấu hình chuẩn đã được áp dụng vào mã nguồn.

---

## 1. Nguyên Lý Hoạt Động của Header `Origin` trong CORS

Theo chuẩn **W3C/Fetch Specification**:

1. Trình duyệt **CHỈ GỬI PROTOCOL + DOMAIN (+ PORT nếu có)** trong HTTP Header `Origin`.
   - **Đúng**: `Origin: https://vdt.net.vn`
   - **Sai/Không bao giờ có**: `Origin: https://vdt.net.vn/mptech/` hay `Origin: https://vdt.net.vn/index.html`

2. Khi người dùng truy cập bất kỳ trang con nào trên ứng dụng Frontend (Ví dụ: `https://vdt.net.vn/mptech/tasks`), mọi AJAX/Fetch request gửi tới Backend sẽ luôn mang header `Origin: https://vdt.net.vn`.

### ⚠️ Sai Lầm Thường Gặp
Thêm đường dẫn con (subpath) vào danh sách cho phép (Ví dụ: `'https://vdt.net.vn/mptech/'`):
- Trình duyệt gửi: `https://vdt.net.vn`
- Backend kiểm tra so sánh chuỗi: `'https://vdt.net.vn'` !== `'https://vdt.net.vn/mptech/'` ➔ **Thất bại**.
- Kết quả: Server trả về lỗi `CORS Policy block. Origin not allowed.` (HTTP 500/403).

---

## 2. Kiến Trúc Xử Lý CORS Thông Minh (`backend/index.js`)

Mã nguồn trong [`backend/index.js`](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/index.js) được thiết kế linh hoạt với các lớp bảo vệ:

```javascript
// 1. Khai báo danh sách Domain mặc định (Local + Production)
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'https://vdt.net.vn',
  'https://www.vdt.net.vn'
];

// 2. Nạp thêm danh sách Domain từ biến môi trường WEB_ORIGINS (nếu có)
const envOrigins = process.env.WEB_ORIGINS
  ? process.env.WEB_ORIGINS.split(',').map(o => o.trim().replace(/\/+$/, ''))
  : [];

// 3. Gộp và loại bỏ các trùng lặp
const allowedOrigins = Array.from(new Set([...defaultOrigins, ...envOrigins]));

// 4. Middleware kiểm tra CORS
app.use(cors({
  origin: function (origin, callback) {
    // Cho phép các truy cập không có Origin (như Server-to-server, cURL, Mobile Apps)
    if (!origin) return callback(null, true);
    
    // Chuẩn hóa loại bỏ dấu / ở cuối nếu người dùng ghi dư trong .env
    const normalizedOrigin = origin.replace(/\/+$/, '');

    if (allowedOrigins.includes(normalizedOrigin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    console.warn(`[CORS REJECTED] Origin: "${origin}" không nằm trong danh sách được phép:`, allowedOrigins);
    return callback(new Error('CORS Policy block. Origin not allowed.'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));
```

---

## 3. Cấu Hình Trên Server Production (`backend/.env`)

Để bổ sung thêm các Domain hoặc Subdomain khác mà không cần sửa code:

Tạo hoặc chỉnh sửa file `backend/.env` trên server:
```env
WEB_ORIGINS=https://vdt.net.vn,https://www.vdt.net.vn,https://subdomain.vdt.net.vn
```

> **Lưu ý**: Các domain trong `WEB_ORIGINS` phân cách bằng dấu phẩy, **không để đường dẫn con (subpath)** và **không có dấu `/` ở cuối**.

---

## 4. Tích Hợp Đồng Bộ Với Socket.io Real-time

Socket.io server ([`backend/socket.js`](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/socket.js)) cũng sử dụng chung mảng `allowedOrigins` này khi khởi tạo:

```javascript
initSocket(server, allowedOrigins);
```

Giúp đồng bộ việc kiểm tra CORS cho cả HTTP REST API và WebSocket Connection.

---

## 5. Quy Trình Kiểm Tra & Sửa Lỗi Tốc Hành (Troubleshooting Steps)

Nếu gặp lại lỗi CORS trên bất kỳ môi trường mới nào:

1. **Mở F12 Trình Duyệt** ➔ Chuyển sang tab **Network** ➔ Bấm vào request bị lỗi (màu đỏ).
2. **Kiểm tra Header `Origin`** ở phần *Request Headers*:
   - Ví dụ thấy: `Origin: https://my-new-domain.com`
3. **Thêm domain đó vào `backend/.env`**:
   ```env
   WEB_ORIGINS=https://vdt.net.vn,https://my-new-domain.com
   ```
4. **Khởi động lại Backend**:
   ```bash
   pm2 restart mptech-backend
   ```
