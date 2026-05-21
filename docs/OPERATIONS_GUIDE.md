# Synapse Collaboration - Hướng dẫn Sử dụng & Vận hành Hệ thống

Tài liệu này cung cấp hướng dẫn chi tiết dành cho **Người dùng cuối (User Guide)** để làm việc hiệu quả trên bảng Kanban và **Nhân viên vận hành (Operations Guide)** để quản lý, bảo trì và cấu hình hệ thống trơn tru.

---

## Part 1: Hướng dẫn Sử dụng dành cho Người dùng cuối (User Guide)

Giao diện Synapse được thiết kế tối giản, trực quan theo phong cách Glassmorphism hiện đại giúp bạn tối ưu hóa hiệu suất làm việc nhóm.

### 1. Quản lý Bảng Kanban & Công việc
Bảng công việc được chia làm 4 cột tiến độ chuẩn Agile: **Cần làm (Todo)**, **Đang làm (In Progress)**, **Đang review (Review)**, và **Hoàn thành (Done)**.
*   **Kéo thả thẻ việc**: Nhấp giữ và kéo bất kỳ thẻ công việc nào di chuyển giữa các cột để cập nhật trạng thái tiến độ tức thì.
*   **Chỉnh sửa nhanh tiêu đề**: Bạn có thể nhấp trực tiếp vào phần chữ tiêu đề trên thẻ công việc để sửa nội dung ngay tại chỗ, sau đó nhấp chuột ra ngoài để tự động lưu lại.
*   **Xóa nhanh công việc**: Rê chuột lên thẻ công việc, nút thùng rác màu đỏ sẽ xuất hiện ở góc trên bên phải, nhấp vào để xóa việc.

### 2. Tạo công việc siêu tốc bằng Trí Tuệ Nhân Tạo (AI Smart Input)
Hộp nhập liệu thông minh ở phía trên cho phép bạn tạo việc bằng cách gõ ngôn ngữ tự nhiên thông thường. Hệ thống sẽ tự động bóc tách các trường thông tin:

*   **Gán người thực hiện (`@username`)**: Gõ ký tự `@` kèm tên viết tắt không dấu (Ví dụ: `@lan`, `@huy`, `@binh`, `@loc`).
*   **Thiết lập độ ưu tiên (`#priority`)**: Gõ các hashtag ưu tiên sau:
    *   Mức cao: `#cao`, `#gap`, `#high`
    *   Mức vừa: `#vua`, `#trungbinh`, `#medium`
    *   Mức thấp: `#thap`, `#low`
*   **Tự đặt Thẻ nhãn (`#tag`)**: Bất kỳ hashtag nào khác không phải độ ưu tiên sẽ tự động biến thành thẻ tag của công việc (Ví dụ: `#landingpage`, `#database`).
*   **Đặt hạn chót thông minh (Semantic Date)**: Bạn có thể gõ trực tiếp thời gian vào câu:
    *   Dạng tương đối: `hôm nay`, `ngày mai`, `ngày kia`, `tuần sau`, `2 ngày nữa`, `3d`.
    *   Dạng thứ trong tuần: `thứ sáu`, `thứ hai`, `thứ sáu tuần sau`.
    *   Dạng ngày cụ thể: `22/05`, `30-06`.
*   **Menu phím tắt nhanh (`/`)**: Gõ ký tự `/` để hiển thị menu các câu lệnh gợi ý tạo việc siêu tốc, sử dụng nút mũi tên `Lên/Xuống` và `Enter` để chọn nhanh.

> **💡 Ví dụ gõ thử**:
> `Thiết kế lại giao diện trang chủ @lan #cao vào thứ sáu tuần sau #landingpage`
> *Hệ thống sẽ tạo việc: Tiêu đề "Thiết kế lại giao diện trang chủ", gán cho Lan, mức Khẩn cấp, hạn chót là thứ 6 tuần sau, gắn thẻ nhãn #landingpage.*

### 3. Bộ chỉnh sửa nhanh trên thẻ (Inline Editor)
Bạn không cần mở modal chi tiết vẫn có thể thay đổi nhanh các thuộc tính trực tiếp ngay trên thẻ công việc:
*   Nhấp vào **Badge Người thực hiện (Assignee)** để đổi nhân sự thực hiện nhanh qua popup.
*   Nhấp vào **Badge Độ ưu tiên** để thay đổi mức độ quan trọng.
*   Nhấp vào **Badge Hạn chót (Date)** để đổi nhanh ngày hẹn (Hôm nay, Ngày mai, Tuần sau hoặc chọn lịch cụ thể).

### 4. Hộp thoại chi tiết Công việc (Task Editor Modal)
Khi bạn **double-click (nhấp đúp)** vào một thẻ công việc hoặc nhấp vào biểu tượng chiếc bút chỉnh sửa, hộp thoại chi tiết sẽ hiện lên:
*   **Mô tả**: Viết nội dung ghi chú chi tiết cho công việc.
*   **Thẻ nhãn**: Thêm hoặc xóa bỏ các thẻ tag linh hoạt bằng khung nhập thẻ.
*   **Luồng bình luận (Comments)**: Nơi các thành viên trong đội ngũ viết thảo luận, báo cáo tiến độ và trao đổi công việc trong thời gian thực.

### 5. Quản lý Không gian hiển thị (Layout Customization)
Để tối ưu không gian làm việc trên các màn hình nhỏ, bạn có thể chủ động ẩn/hiện các khu vực:
*   **Thu nhỏ cột Kanban**: Nhấp vào nút mũi tên nhỏ cạnh tên mỗi cột để thu gọn cột đó thành một thanh dọc `60px` siêu gọn gàng.
*   **Thu nhỏ hộp AI Smart Input**: Nhấp vào nút chevron ở góc trên bên phải khung nhập liệu để ẩn bớt hướng dẫn và thu nhỏ chiều cao khung nhập.
*   **Ẩn/Hiện Sidebar bên phải**: Nhấp vào nút **Ẩn Sidebar / Hiện Sidebar** trên thanh header để đóng mở thanh thông tin thành viên và nhật ký hoạt động. Bảng Kanban sẽ tự động co giãn 100% cực kỳ mượt mà.
*   *Tất cả các tùy chọn ẩn hiện giao diện này đều được hệ thống tự động ghi nhớ, khi bạn F5 refresh trang web thì giao diện vẫn giữ nguyên trạng thái bạn đã thiết lập trước đó.*

---

## Part 2: Hướng dẫn Vận hành dành cho Nhân viên kỹ thuật / Admin (Operations Guide)

Phần này hướng dẫn các nhân viên vận hành hoặc quản trị viên quản lý mã nguồn, cấu hình môi trường và bảo trì dữ liệu cho hệ thống Synapse.

### 1. Quản lý Biến môi trường (Environment Variables)
*   Hệ thống cung cấp tệp cấu hình mẫu [.env_sample](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/.env_sample).
*   Các giá trị cấu hình chính thức được lưu trữ trong tệp [.env](file:///Users/vovinhloc/myworking/study/gemini/tasks_management_gemini/.env) (Tệp này được đưa vào danh sách `.gitignore` và không bao giờ được phép đẩy lên Git để bảo mật thông tin).
*   Khi bàn giao hoặc thiết lập trên máy chủ mới, hãy sao chép từ `.env_sample` thành `.env` và điền các giá trị thực tế của dự án.

### 2. Quản lý Trình giả lập Cộng tác thời gian thực (Simulation Engine)
Để phục vụ việc trình diễn thử nghiệm (Demo) hoặc chạy kiểm thử hành vi, hệ thống tích hợp sẵn một **Động cơ giả lập bot**.
*   **Cơ chế**: Cứ mỗi 18 giây, công cụ giả lập sẽ chọn ngẫu nhiên một bot thành viên (Lan, Huy, Bình, Lộc) chuyển sang trạng thái "đang gõ phím" trong 3 giây và thực hiện ngẫu nhiên một hành động (Tự tạo việc bằng NLP, chuyển trạng thái việc, hoặc phê duyệt hoàn thành việc) kèm ghi log hệ thống.
*   **Bật/Tắt trình giả lập**:
    *   Trên giao diện: Ở thanh Header có nút gạt **Mô phỏng cộng tác**. Nhấp để Bật hoặc Tắt nhanh trình giả lập.
    *   Trong mã nguồn: Trình giả lập được khởi tạo bằng `useEffect` thông qua biến state `isSimulating` trong `src/App.jsx`.
*   *Khuyến nghị vận hành*: Khi triển khai ứng dụng lên môi trường production chạy thực tế cho doanh nghiệp, hãy tắt mặc định biến `isSimulating` thành `false` trong `App.jsx` để tránh bot giả lập tự động tạo dữ liệu rác trên bảng công việc thực tế của người dùng.

### 3. Nhật ký Hoạt động hệ thống (Activity Logs)
Mọi thao tác của người dùng và bot giả lập đều được ghi lại trong khung "Nhật ký hoạt động" ở Sidebar bên phải.
*   **Giới hạn lưu trữ**: Nhật ký hoạt động chỉ lưu giữ tối đa **50 sự kiện gần nhất** để tránh tràn bộ nhớ trình duyệt, các sự kiện cũ hơn sẽ tự động bị loại bỏ khỏi mảng.
*   **Các loại sự kiện chính**:
    *   `create`: Tạo công việc mới (có màu tím).
    *   `move`: Chuyển trạng thái công việc giữa các cột (có màu xanh cyan).
    *   `assign`: Gán nhân sự thực hiện.
    *   `priority`: Thay đổi mức độ khẩn cấp (có màu đỏ).
    *   `system`: Đăng nhập vai trò hoặc làm mới dữ liệu.

### 4. Làm mới Dữ liệu (System Data Reset)
Nếu dữ liệu trên bảng Kanban bị quá tải hoặc cần khôi phục lại bảng mẫu ban đầu:
*   Nhấp vào nút **Reset** màu đỏ trên thanh Header.
*   **Cơ chế hoạt động**: Hệ thống sẽ xóa toàn bộ dữ liệu hiện tại trong `localStorage`, đưa danh sách công việc (`tasks`) và nhật ký hoạt động (`logs`) về trạng thái mặc định ban đầu (`INITIAL_TASKS` và `INITIAL_LOGS`), ghi nhận sự kiện làm mới hệ thống và tải lại bảng tức thì.

### 5. Bảo trì Bộ nhớ Trình duyệt (Browser LocalStorage Maintenance)
Ứng dụng hoạt động hoàn toàn ở Client-side và lưu trữ trạng thái trong trình duyệt của người dùng qua các Key sau:

| Key LocalStorage | Giá trị mặc định khi lỗi / trống | Cách dọn dẹp thủ công |
| :--- | :--- | :--- |
| `synapse_tasks` | Khởi tạo lại mảng `INITIAL_TASKS` | `localStorage.removeItem('synapse_tasks')` |
| `synapse_logs` | Khởi tạo lại mảng `INITIAL_LOGS` | `localStorage.removeItem('synapse_logs')` |
| `synapse_smart_input_collapsed` | `false` (Hiển thị đầy đủ) | `localStorage.removeItem('synapse_smart_input_collapsed')` |
| `synapse_sidebar_open` | `true` (Hiển thị sidebar) | `localStorage.removeItem('synapse_sidebar_open')` |
| `synapse_sidebar_collapsed` | `{ team: false, activity: false }` | `localStorage.removeItem('synapse_sidebar_collapsed')` |

*Khi nhân viên kỹ thuật cần hỗ trợ người dùng sửa lỗi hiển thị giao diện do xung đột cache trình duyệt, có thể hướng dẫn người dùng nhấn nút F12 $\rightarrow$ Application $\rightarrow$ Local Storage $\rightarrow$ Chọn địa chỉ web và nhấn nút Clear All để làm sạch bộ nhớ.*
