# Tài Liệu Hệ Thống Thông Báo (Notification Flow)

Tài liệu này mô tả chi tiết cơ chế hoạt động, kiến trúc dữ liệu và các luồng tích hợp của hệ thống thông báo (Notifications) trong ứng dụng Synapse Collaboration.

---

## 1. Tổng Quan Kiến Trúc (Architecture Overview)

Hệ thống thông báo của Synapse Collaboration hoạt động trên hai kênh chính song song:

1. **Thông báo trong ứng dụng (In-App System Notifications)**
   - Lưu trữ trong cơ sở dữ liệu MySQL (`notifications`).
   - Phía Frontend thực hiện **polling** (thăm dò) định kỳ mỗi 30 giây để cập nhật và hiển thị trên giao diện Bell (chuông thông báo).
   - Được tạo tự động bởi tiến trình quét nền (Background Daemon Scheduler) khi có sự kiện quá hạn hoặc sắp đến hạn.
2. **Tích hợp Microsoft Teams (MS Teams Notification Integration)**
   - Gửi trực tiếp tin nhắn định dạng HTML sinh động tới Kênh (Channel) / Nhóm Chat Teams hoặc chat riêng tư 1:1 (Direct Message - DM).
   - Sử dụng Microsoft Graph API thông qua Access Token của người dùng (có cơ chế tự động refresh token).
   - Được kích hoạt theo thời gian thực (Real-time) từ các hành động của người dùng (tạo việc, phân vai, đổi trạng thái, bình luận, v.v.) hoặc Bản tin chào buổi sáng AI hàng ngày.

---

## 2. Kiến Trúc Dữ Liệu (Database Schema)

Bảng thông báo được định nghĩa trong [db.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/db.js) như sau:

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  task_id VARCHAR(255),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_read TINYINT(1) DEFAULT 0,
  type VARCHAR(50) DEFAULT 'reminder', -- 'reminder' (nhắc nhở), 'overdue' (quá hạn)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read),
  INDEX idx_notif_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. Luồng Xử Lý Phía Backend (Backend Flows)

Phía Backend có hai luồng chính sinh ra thông báo: **Scheduler Daemon (Quét nền tự động)** và **Real-time Event Dispatcher (Kích hoạt trực tiếp)**.

```mermaid
graph TD
    %% Scheduler Luồng
    subgraph Daemon Scheduler (Chạy mỗi 60s)
        S1[checkUpcomingDeadlines] -->|Tạo thông báo trong DB| DB[(Database MySQL)]
        S1 -->|Gửi HTML card| TeamsChannel[Kênh/Chat Teams]
        S2[checkOverdueTasks] -->|Gửi Activity Log| LogDB[(Logs Table)]
        S2 -->|Tạo thông báo trong DB| DB
        S2 -->|Gửi Cảnh báo khẩn cấp| TeamsChannel
        S3[Bản tin sáng AI lúc 8:00 AM] -->|Gửi Direct Message| TeamsDM[Teams 1:1 Chat DM]
        S3 -->|Thất bại / Fallback| DB
    end

    %% Event Dispatcher Luồng
    subgraph Event Dispatcher (Hành động người dùng)
        E1[Tạo việc/Phân người] -->|triggerTeamsNotifications| TeamsDM
        E2[Thay đổi trạng thái/Độ ưu tiên] -->|triggerTeamsNotifications| TeamsChannel
        E3[Thêm bình luận mới] -->|triggerTeamsNotifications| TeamsDM & TeamsChannel
    end
```

### 3.1. Tiến Trình Quét Nền - [scheduler.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/services/scheduler.js)

Khi server khởi chạy trong [index.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/index.js), phương thức `startScheduler()` khởi tạo một vòng lặp chạy mỗi **60 giây**:

#### A. Quét công việc sắp đến hạn (`checkUpcomingDeadlines`)
- **Điều kiện quét**: Công việc chưa hoàn thành (`status != 'done'`), chưa bị xóa, hạn chót lớn hơn hiện tại, chưa gửi nhắc nhở (`reminder_sent = 0`) và thời gian còn lại đến hạn chót $\le$ `reminder_before_minutes` (mặc định 30 phút).
- **Hành động**:
  1. Ghi nhận bản ghi thông báo mới vào bảng `notifications` cho người tạo (creator) và toàn bộ người được giao (assignees) công việc.
  2. Cập nhật cờ dữ liệu `reminder_sent = 1` trên task để tránh gửi lặp lại.
  3. Nếu task có liên kết kênh Teams (`task_teams_links`), tiến trình sẽ gửi tin nhắn nhắc nhở đẹp mắt dạng HTML qua Teams API (có cơ chế giãn cách 500ms để tránh rate-limit).

#### B. Quét công việc quá hạn (`checkOverdueTasks`)
- **Điều kiện quét**: Công việc chưa hoàn thành, hạn chót nhỏ hơn hiện tại, và chưa ghi nhận quá hạn (`overdue_logged = 0`).
- **Hành động**:
  1. Ghi nhận nhật ký vào bảng `overdue_logs`.
  2. Ghi một log hoạt động tổng quan hệ thống vào bảng `logs` với tên tác giả `"Hệ Thống"` và loại `"overdue"`.
  3. Thêm bản ghi thông báo loại `"overdue"` vào bảng `notifications` cho người tạo và tất cả assignees.
  4. Cập nhật cờ `overdue_logged = 1` trên task.
  5. Phát cảnh báo khẩn cấp (🚨 Cảnh báo trễ hạn) tới tất cả các Kênh/Chat Teams liên kết.

#### C. Bản tin chào buổi sáng AI (`sendDailyMorningDigestForUser`)
- **Kích hoạt**: Tự động vào **8:00 AM** hàng ngày hoặc gọi thủ công qua API `/api/sync/trigger-daily-digest`.
- **Luồng hoạt động**:
  1. Lấy toàn bộ công việc chưa hoàn thành liên quan tới User (do họ tạo hoặc được giao).
  2. Gửi danh sách qua [aiService.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/services/aiService.js) để LLM (Gemini/OpenAI/Claude) biên soạn một bản tin chào buổi sáng thân thiện, phân tích công việc quá hạn (🚨), sắp đến hạn (📅) và đưa ra lời khuyên sắp xếp thứ tự ưu tiên bằng định dạng HTML.
  3. Tìm một tài khoản gửi (sender) có Token Microsoft hợp lệ để tạo/gửi Direct Message (DM) 1:1 qua Teams tới tài khoản Microsoft của User nhận.
  4. **Fallback**: Nếu gửi qua Teams DM thất bại (thiếu Microsoft ID hoặc lỗi token), hệ thống sẽ tự động lưu bản tin này thành một thông báo in-app (loại `reminder`) vào database MySQL để user đọc khi vào web.

---

### 3.2. Bộ Điều Phối Thông Báo Thời Gian Thực - [tasks.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/routes/tasks.js)

Hàm `triggerTeamsNotifications(taskId, activeUser, actionType, payload)` điều phối gửi các thông báo tức thời dựa trên hành động của người dùng trên web:

- **Sự kiện cá nhân/Quyền lực cao (Gửi trực tiếp 1:1 Teams DM)**:
  - `add_assignee`: Gửi tin nhắn riêng báo cho người được phân vai mới.
  - `permission`: Báo cho thành viên khi quyền chỉnh sửa công việc của họ thay đổi (Edit/Read-only).
- **Bình luận mới (`add_comment`)**:
  - Gửi **Teams DM** riêng tới toàn bộ assignees khác và creator.
  - Đồng thời gửi tin nhắn dạng quote nội dung bình luận vào **tất cả Kênh/Chat nhóm** được liên kết để đội ngũ nắm bắt.
- **Sự kiện cộng tác/Cập nhật tiến độ (Gửi tin nhắn vào Kênh/Chat nhóm liên kết)**:
  - Gặp ở các hành động cập nhật: Trạng thái (`status`), Độ ưu tiên (`priority`), Hạn chót (`due_date`), Thêm liên kết Teams mới (`add_link`).

---

### 3.3. Nhận Đồng Bộ Tin Nhắn Từ Teams - [sync.js](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/backend/routes/sync.js)

Cung cấp cơ chế nhận webhook từ MS Graph (`/api/webhooks/teams`) hoặc Polling thủ công (`/api/sync/poll-teams`):
- Khi có tin nhắn thảo luận mới trên Kênh/Chat Teams liên kết, AI sẽ phân tích nội dung.
- Nếu tin nhắn yêu cầu cập nhật trạng thái/độ ưu tiên, hệ thống sẽ thực thi thay đổi trong database, đồng thời ghi nhận bình luận tự động của AI (`🤖 [Đồng bộ Teams]...`), từ đó cập nhật bảng logs hoạt động chung.

---

## 4. Luồng Xử Lý Phía Frontend (Frontend Flows)

### 4.1. Khởi Tạo & Kết Nối Socket.io - [App.jsx](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/frontend/src/App.jsx)
- Khi user đăng nhập thành công (`isLoggedIn === true`), một React `useEffect` sẽ kích hoạt:
  1. Sử dụng `AbortController` để tải danh sách thông báo ban đầu qua REST API nhằm đồng bộ các thông báo khi offline.
  2. Khởi tạo kết nối Socket.io client, truyền Access Token JWT của người dùng qua cấu hình `auth: { token }` để xác thực.
  3. Lắng nghe sự kiện `notification` thời gian thực từ socket. Khi nhận được thông báo mới, hệ thống tự động đẩy thêm vào đầu danh sách state `notifications` và kích hoạt Premium Toast Alert trên màn hình.
  4. Khi component unmount hoặc user đăng xuất, thực hiện đóng kết nối socket để giải phóng tài nguyên.

### 4.2. Quản Lý Trạng Thái UI
- Danh sách thông báo được lưu tại state `notifications`.
- Bộ lọc unread lấy số lượng thông báo chưa đọc để hiển thị số (badge) màu đỏ nổi bật trên nút Bell.
- Khi người dùng tương tác:
  - **Click vào item thông báo (`handleNotificationClick`)**: Đánh dấu đã đọc qua API `/api/notifications/read/:id`, cập nhật state local, và nếu thông báo có liên kết `task_id`, web sẽ tự động mở Modal biên tập công việc chi tiết (`setSelectedTask`).
  - **Đọc tất cả (`handleMarkAllNotificationsAsRead`)**: Gọi API `/api/notifications/read-all` và chuyển toàn bộ `is_read = 1` ở giao diện.
  - **Xóa thông báo (`handleDeleteNotification`)**: Gọi API xóa `/api/notifications/:id` và loại bỏ khỏi giao diện.

### 4.3. Thông Báo Hệ Thống Trình Duyệt (Web Notification API)
- Cung cấp cấu hình bật/tắt (Toggle) và lưu lựa chọn vào `localStorage`.
- Khi nhận thông báo thời gian thực qua socket, nếu người dùng đang ở tab khác hoặc ứng dụng khác (`document.hidden || !document.hasFocus()`), hệ thống sẽ phát một Native OS-level Desktop Notification.
- Khi người dùng nhấp vào thông báo đẩy, trình duyệt sẽ tự động kích hoạt tập trung (`window.focus()`) và mở chi tiết công việc.
- Cung cấp nút kiểm thử **🚀 Gửi Test (3s)** để mô phỏng và kiểm tra nhanh hành vi thông báo đẩy của hệ điều hành.

---

> - **Khắc phục**: Đã thay thế `{notif.message}` thành `{notif.content}` tại [App.jsx](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/frontend/src/App.jsx). Hiện tại, nội dung của các thông báo nhắc nhở và quá hạn đã hiển thị đầy đủ và chính xác trên giao diện người dùng.

---

## 5. Tài Khoản Gửi Tin Nhắn Trên Microsoft Teams (Microsoft Teams Sender Accounts)

Hệ thống sử dụng các tài khoản Microsoft để gửi thông báo trên Teams tùy theo từng trường hợp cụ thể:
1. **Hành động thời gian thực của người dùng (Thêm bình luận, đổi trạng thái, gán người...)**:
   - Sử dụng tài khoản Microsoft của **chính người dùng đang thao tác** (`activeUser`).
   - Cụ thể: Khi gửi tin nhắn Teams hay Direct Message (DM), hệ thống dùng ID của người thao tác để lấy Access Token của họ thông qua hàm `getValidMicrosoftToken(userId)`.
2. **Tiến trình quét nền tự động nhắc nhở (Scheduler - Sắp đến hạn / Quá hạn)**:
   - Sử dụng tài khoản Microsoft của **người tạo công việc** (`task.creator_id`).
   - Cụ thể: Khi Scheduler quét và phát thông báo nhắc nhở đến các kênh (channel) hoặc chat Teams liên kết với công việc, hệ thống sử dụng Access Token của người tạo công việc này.
3. **Bản tin chào buổi sáng AI hàng ngày (Daily Morning Digest)**:
   - Bản tin này được gửi dưới dạng tin nhắn riêng tư (DM) 1:1 cho từng người nhận. Do Microsoft Graph API không hỗ trợ tự gửi tin nhắn DM cho chính mình, hệ thống sẽ thực hiện truy vấn cơ sở dữ liệu để tìm **một tài khoản người dùng khác** có Microsoft Token đang hoạt động:
     - Hệ thống ưu tiên chọn tài khoản có vai trò là **Admin**.
     - Nếu không tìm thấy Admin nào có token khả dụng, hệ thống sẽ lấy tài khoản của **bất kỳ người dùng nào khác** có Microsoft Token đang hoạt động.
     - Sau khi tìm được, hệ thống sẽ mượn Access Token của tài khoản này để gửi tin nhắn DM đến tài khoản của người nhận.

---

## 6. Đề Xuất Cải Tiến & Tối Ưu Hóa (Proposed Enhancements)

Dưới đây là các phân tích và đề xuất cải tiến hệ thống thông báo nhằm nâng cao hiệu năng, độ tin cậy và trải nghiệm người dùng (UX):

### 6.1. Hạn Chế Đã Khắc Phục (Implemented Features)
1. **Thông báo In-App cho các hành động thời gian thực**: Đã tích hợp lưu database cho tất cả các sự kiện thay đổi công việc thực tế, đảm bảo người dùng không bỏ lỡ thông báo dù có dùng Teams hay không.
2. **Chuyển từ Polling sang WebSockets**: Đã thay thế cơ chế gọi API 30s một lần bằng Socket.io thời gian thực, giảm thiểu truy vấn rác lên MySQL và tăng tốc độ cập nhật.
3. **Thông báo đẩy ngoài ứng dụng**: Đã hỗ trợ HTML5 Web Notification để đẩy thông báo lên mức hệ điều hành khi người dùng đang ở tab/ứng dụng khác.

### 6.2. Hạn Chế Hiện Tại & Hướng Phát Triển Tiếp Theo
1. **Thiếu cơ chế hàng đợi (Queue) khi gửi thông báo Teams**:
   - Các hành động gửi tin nhắn Teams hiện đang chạy đồng bộ/bất đồng bộ trực tiếp (qua `axios.post` với Graph API) kèm theo `delay(500)` thủ công. Nếu Microsoft Graph API gặp sự cố tạm thời, phản hồi chậm, hoặc quá hạn định mức (Rate Limit 429 quá lâu), hệ thống có thể bị nghẽn luồng xử lý hoặc mất tin nhắn mà không có cơ chế lưu vết để gửi lại.
2. **Không có Cấu hình/Bộ lọc Thông báo (Notification Preferences)**:
   - Người dùng chưa có quyền lựa chọn bật/tắt riêng từng loại thông báo chi tiết trên Web (Ví dụ: Không muốn nhận Bản tin sáng AI, chỉ muốn nhận thông báo quá hạn, v.v.).
3. **Cơ chế lập lịch Daily Digest bằng `setInterval`**:
   - Hàm kiểm tra 8:00 AM được đặt trong vòng lặp 60 giây. Nếu server bị khởi động lại hoặc tạm ngưng đúng vào khung giờ 8:01 AM, bản tin chào buổi sáng AI của ngày đó có thể bị bỏ lỡ. Có thể cải tiến bằng thư viện `node-cron` hoặc `agenda`.
