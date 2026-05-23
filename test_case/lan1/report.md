# Báo cáo kết quả kiểm thử hệ thống - Lần 1
**Thời gian thực hiện**: 15:50:39 23/5/2026

**Môi trường**: Phát triển (Local Development)

**Địa chỉ Backend**: http://localhost:5001

## 📊 Kết quả kiểm thử các trường hợp (Test Cases Summary)

| ID | Tên Kịch Bản Kiểm Thử | Trạng Thái | Chi Tiết |
| :--- | :--- | :--- | :--- |
| TC-01 | Kiểm tra trạng thái máy chủ (/health) | ✅ PASS | Máy chủ hoạt động ổn định. Trạng thái: healthy, Timestamp: 2026-05-23T08:50:39.791Z |
| TC-02 | Đăng nhập thử nghiệm (/api/auth/mock-login) | ✅ PASS | Đăng nhập thành công với tài khoản: Võ Vĩnh Lộc (Product Owner) |
| TC-03 | Tải danh sách công việc (/api/tasks) | ✅ PASS | Lấy dữ liệu thành công. Tìm thấy 10 công việc trên bảng. |
| TC-04 | Tải nhật ký hoạt động (/api/tasks/logs) | ✅ PASS | Lấy nhật ký thành công. Đọc được 25 hoạt động gần nhất. |
| TC-05 | Tính toán Thống kê Hiệu suất (/api/tasks/analytics) | ✅ PASS | Thành công. Lấy đầy đủ dữ liệu KPI. Tổng số việc: 10, Tỷ lệ hoàn thành đúng hạn: 100%, Thời gian hoàn thành trung bình: 13.8 giờ. |
| TC-06 | Kích hoạt Bản tin sáng AI (/api/sync/trigger-daily-digest) | ✅ PASS | Tạo bản tin sáng AI thành công. Phân phối hoàn tất. Thông điệp dài: 1134 ký tự. |

## 📈 Chi tiết cấu trúc dữ liệu Thống kê hiệu suất (Analytics JSON Response)

```json
{
  "totalTasks": 10,
  "statusCounts": {
    "todo": 6,
    "in_progress": 1,
    "review": 1,
    "done": 2
  },
  "prioCounts": {
    "high": 2,
    "medium": 7,
    "low": 1
  },
  "onTimeRate": 100,
  "avgLeadTimeHrs": 13.8,
  "teamAnalytics": [
    {
      "userId": "binh",
      "name": "Phạm Thanh Bình",
      "avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80",
      "role": "Backend Dev",
      "color": "#f59e0b",
      "stats": {
        "todo": 1,
        "in_progress": 1,
        "review": 0,
        "done": 0,
        "total": 2
      }
    },
    {
      "userId": "huy",
      "name": "Trần Thế Huy",
      "avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80",
      "role": "Frontend Dev",
      "color": "#3b82f6",
      "stats": {
        "todo": 1,
        "in_progress": 0,
        "review": 0,
        "done": 0,
        "total": 1
      }
    },
    {
      "userId": "lan",
      "name": "Nguyễn Mai Lan",
      "avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80",
      "role": "UI/UX Designer",
      "color": "#10b981",
      "stats": {
        "todo": 2,
        "in_progress": 0,
        "review": 1,
        "done": 0,
        "total": 3
      }
    },
    {
      "userId": "loc",
      "name": "Võ Vĩnh Lộc",
      "avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80",
      "role": "Product Owner",
      "color": "#ec4899",
      "stats": {
        "todo": 1,
        "in_progress": 0,
        "review": 0,
        "done": 0,
        "total": 1
      }
    },
    {
      "userId": "usr-1779416334917-d3161da6",
      "name": "Võ Vĩnh Lộc",
      "avatar": "https://ui-avatars.com/api/?name=V%C3%B5%20V%C4%A9nh%20L%E1%BB%99c&background=f59e0b&color=fff&size=150",
      "role": "Collaborator",
      "color": "#f59e0b",
      "stats": {
        "todo": 4,
        "in_progress": 0,
        "review": 1,
        "done": 0,
        "total": 5
      }
    }
  ],
  "tagsAnalytics": [
    {
      "tag": "khancap",
      "count": 1
    }
  ],
  "recentOverdueLogs": [
    {
      "id": "overdue-1779509723396-b67c3e5a",
      "task_id": "t2",
      "task_title": "Tối ưu hóa API Core và kết nối database",
      "assignees": "Võ Vĩnh Lộc",
      "due_date": "2026-05-23T04:15:00.000Z",
      "status_at_log": "todo",
      "resolution_date": null,
      "completed_by_user_id": null,
      "logged_at": "2026-05-23T04:15:23.000Z",
      "assignee_avatar": "https://ui-avatars.com/api/?name=V%C3%B5%20V%C4%A9nh%20L%E1%BB%99c&background=f59e0b&color=fff&size=150"
    },
    {
      "id": "overdue-1779505959147-7b70c372",
      "task_id": "task-1779418928136-197c40b3",
      "task_title": "xin báo giá máy server HP cho anh Huân",
      "assignees": "Phạm Thanh Bình, Trần Thế Huy, Nguyễn Mai Lan, Võ Vĩnh Lộc",
      "due_date": "2026-05-22T12:00:00.000Z",
      "status_at_log": "todo",
      "resolution_date": null,
      "completed_by_user_id": null,
      "logged_at": "2026-05-23T03:12:39.000Z",
      "assignee_avatar": "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80"
    },
    {
      "id": "overdue-1779505959147-7b70c372",
      "task_id": "task-1779418928136-197c40b3",
      "task_title": "xin báo giá máy server HP cho anh Huân",
      "assignees": "Phạm Thanh Bình, Trần Thế Huy, Nguyễn Mai Lan, Võ Vĩnh Lộc",
      "due_date": "2026-05-22T12:00:00.000Z",
      "status_at_log": "todo",
      "resolution_date": null,
      "completed_by_user_id": null,
      "logged_at": "2026-05-23T03:12:39.000Z",
      "assignee_avatar": "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80"
    },
    {
      "id": "overdue-1779505959147-7b70c372",
      "task_id": "task-1779418928136-197c40b3",
      "task_title": "xin báo giá máy server HP cho anh Huân",
      "assignees": "Phạm Thanh Bình, Trần Thế Huy, Nguyễn Mai Lan, Võ Vĩnh Lộc",
      "due_date": "2026-05-22T12:00:00.000Z",
      "status_at_log": "todo",
      "resolution_date": null,
      "completed_by_user_id": null,
      "logged_at": "2026-05-23T03:12:39.000Z",
      "assignee_avatar": "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80"
    },
    {
      "id": "overdue-1779505959147-7b70c372",
      "task_id": "task-1779418928136-197c40b3",
      "task_title": "xin báo giá máy server HP cho anh Huân",
      "assignees": "Phạm Thanh Bình, Trần Thế Huy, Nguyễn Mai Lan, Võ Vĩnh Lộc",
      "due_date": "2026-05-22T12:00:00.000Z",
      "status_at_log": "todo",
      "resolution_date": null,
      "completed_by_user_id": null,
      "logged_at": "2026-05-23T03:12:39.000Z",
      "assignee_avatar": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80"
    }
  ]
}\n```\n\n\n## ☀️ Nội dung Bản tin chào buổi sáng AI (HTML Generated Content)\n\n> [!NOTE]\n> Dưới đây là nội dung chi tiết bản tin sáng được AI tổng hợp tự động dựa trên các công việc trễ hạn và khẩn cấp của Võ Vĩnh Lộc:\n\n```html\n<p>☀️ <strong>Chào Võ Vĩnh Lộc! Chúc bạn một ngày mới đầy năng lượng và làm việc hiệu quả.</strong></p><p>Dưới đây là tóm tắt tiến độ công việc dành cho bạn:</p><p>🚨 <strong>Công việc ĐÃ QUÁ HẠN:</strong></p><ul><li><strong>Tối ưu hóa API Core và kết nối database</strong> (Hạn chót: <span style="color: #ef4444;">23/5/2026 11:15</span>)</li><li><strong>xin báo giá máy server HP cho anh Huân</strong> (Hạn chót: <span style="color: #ef4444;">22/5/2026 19:00</span>)</li></ul><p><em>👉 Hãy ưu tiên xử lý các công việc quá hạn này ngay lập tức để không ảnh hưởng đến tiến độ chung của nhóm.</em></p><p>📅 <strong>Công việc SẮP ĐẾN HẠN &amp; ĐANG THEO DÕI:</strong></p><ul><li><strong>Thiết kế giao diện Landing Page (Mobile & Desktop)</strong> (Hạn: 24/5/2026 02:31 | Ưu tiên: Khẩn cấp)</li></ul><hr style="border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 12px 0;" /><p>💡 <strong>Lời khuyên từ Trợ lý Synapse AI:</strong></p><p>Hôm nay bạn nên dành buổi sáng để tập trung dứt điểm việc <strong>"Tối ưu hóa API Core và kết nối database"</strong>. Sau đó mới xử lý các việc tiếp theo để giảm tải áp lực deadline.</p>\n```\n\n\n---\n*Báo cáo được tạo tự động bởi Antigravity AI Coding Assistant - Đội ngũ Google DeepMind.*\n