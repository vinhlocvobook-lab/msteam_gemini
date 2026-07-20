# Synapse Collaboration — Quy tắc cho AI LLM

Áp dụng cho mọi AI assistant (Claude, Cursor, Copilot, Gemini...) khi làm việc trong project này.

## 🔒 An toàn thông tin — Biến môi trường (.env)

- **Tuyệt đối KHÔNG** đọc, mở, in ra, log lại, hay đưa nội dung của `backend/.env` và `frontend/.env` vào output, commit, hay bất kỳ đoạn hội thoại nào. Các file này chứa secrets thật: DB password, JWT secret, encryption key, Microsoft Client Secret, AI API key...
- Khi cần biết tên/cấu trúc biến môi trường, **chỉ tham khảo** `backend/.env_sample` và `frontend/.env_sample` — các file này chỉ chứa tên biến và placeholder, không chứa giá trị thật.
- Khi cần thêm biến môi trường mới, chỉ thêm placeholder vào file `.env_sample` tương ứng. Không tự ý ghi hoặc sửa giá trị thật trong `.env`.
- Nếu người dùng yêu cầu debug liên quan đến `.env`, hãy hỏi người dùng cung cấp giá trị cần thiết trực tiếp thay vì tự đọc file.
