# AI cho Giáo viên — THPT Chuyên Chu Văn An

Cổng thông tin tự học giúp giáo viên dùng AI vào dạy học: hiểu AI → viết prompt →
tự tạo học liệu HTML tương tác → chia sẻ an toàn.

Trang tĩnh thuần, **không build, không cài gì**. Mở `index.html` là chạy
(hoặc `npx serve .` để `fetch` hoạt động đúng).

## Cấu trúc

| File | Vai trò |
| --- | --- |
| `index.html` | Khung trang, chia thành các `.page` chuyển bằng JS |
| `style.css` | Giao diện, sáng/tối, responsive |
| `data.js` | **Nội dung + cấu hình** — sửa ở đây, không đụng code |
| `app.js` | Logic: điều hướng, API key, nộp bài, thư viện |
| `cloudflare-worker.js` + `wrangler.toml` | Thư viện dự án chung (Worker + KV) |
| `docs/DEPLOY-WORKER.md` | Hướng dẫn dựng thư viện chung |
| `resources/` | PDF và bộ Skill cho giáo viên tải về |

## Ba tính năng cần biết

**API key** (bước 2) — lưu trong `localStorage` của máy giáo viên, gọi thẳng nhà
cung cấp, không qua máy chủ trung gian. Hỗ trợ Gemini / Claude / OpenAI.
Danh sách model trong `data.js` **chỉ là gợi ý và sẽ cũ đi**; nút **🔄 Tải danh
sách** hỏi thẳng nhà cung cấp xem key đang cầm dùng được model nào. Đổi model tự lưu.

**Nhận xét AI** (bước 3) — tải file `.html` lên *hoặc* dán link đã xuất bản. Chỉ
có link thì tự tải HTML từ link đó (GitHub Pages trả `access-control-allow-origin: *`;
miền không trả CORS như `run.app`, `ai.studio` thì nhờ Worker tải hộ qua `/fetch`).

- `MAX_UPLOAD_MB` (`data.js`) — giới hạn file, mặc định 10MB
- `REVIEW_CHAR_LIMIT` (`app.js`) — mã nguồn gửi cho AI, mặc định 60.000 ký tự
- `buildReviewPrompt()` (`app.js`) — nội dung prompt chấm bài

**Thư viện chung** — *không bắt buộc*. Chưa cấu hình thì bài nộp lưu bằng
IndexedDB trên máy từng người. Muốn dùng chung: xem [DEPLOY-WORKER.md](docs/DEPLOY-WORKER.md).
Link dán vào chỉ nhận `https://` + các miền trong `ALLOWED_PAGE_HOSTS` — khai báo
**hai nơi phải giống nhau** (`data.js` cho trình duyệt, `cloudflare-worker.js` cho
máy chủ, vì kiểm tra phía trình duyệt ai cũng vượt được bằng `curl`).

## Những chỗ dễ vấp

| Hiện tượng | Nguyên nhân |
| --- | --- |
| `Failed to fetch` khi tải thư viện | Worker ném lỗi → Cloudflare trả trang 1101 không kèm CORS. Xem `npx wrangler tail` |
| Nộp xong chưa thấy bài | KV `list()` trễ tới 60s (*eventually consistent*). `app.js` đã ghép tạm bài vừa nộp để che độ trễ |
| `404 — model ... no longer available` | Model trong `data.js` bị khai tử → bấm **🔄 Tải danh sách** |
| `Cannot bind parameter 'Headers'` | PowerShell: `curl` là alias `Invoke-WebRequest`. Dùng `curl.exe` |
| `Body không phải JSON hợp lệ` khi test | `Out-File -Encoding utf8` (PS 5.1) thêm BOM. Dùng `UTF8Encoding($false)` |

## Triển khai

Đẩy lên GitHub Pages là xong. Riêng `cloudflare-worker.js` chạy độc lập — sửa xong
phải `npx wrangler deploy` lại, đẩy lên GitHub **không** cập nhật Worker.

---

Sản phẩm tập huấn của tổ GenAI, THPT Chuyên Chu Văn An.
