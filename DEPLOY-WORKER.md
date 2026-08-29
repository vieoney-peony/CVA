# Deploy thư viện dự án chung (Cloudflare Worker)

Trang web chạy được ngay cả khi **chưa** làm bước này — khi đó bài nộp chỉ lưu trên máy của từng người (IndexedDB). Làm theo hướng dẫn dưới đây để mọi giáo viên nhìn thấy chung một thư viện dự án.

Cần: một tài khoản Cloudflare (gói miễn phí là đủ) và Node.js trên máy.

## 1. Tạo KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create SUBMISSIONS
```

Lệnh cuối in ra một `id`. Chép lại.

## 2. Tạo `wrangler.toml`

Đặt cạnh `cloudflare-worker.js`:

```toml
name = "cva-gallery"
main = "cloudflare-worker.js"
compatibility_date = "2026-01-01"

[[kv_namespaces]]
binding = "SUBMISSIONS"
id = "DÁN_ID_Ở_BƯỚC_1_VÀO_ĐÂY"
```

## 3. Deploy

```bash
npx wrangler deploy
```

Kết thúc sẽ in ra URL dạng `https://cva-gallery.<tên-tài-khoản>.workers.dev`.

## 4. Nối vào trang web

Mở `data.js`, dán URL vừa nhận vào dòng đầu tiên (**không có dấu `/` ở cuối**):

```js
const WORKER_URL = "https://cva-gallery.ten-tai-khoan.workers.dev";
```

Commit và đẩy lên GitHub Pages là xong.

## 5. Kiểm tra

```bash
curl https://cva-gallery.ten-tai-khoan.workers.dev/list
# → []
```

Nộp thử một bài trên web rồi gọi lại lệnh trên, phải thấy đúng 1 bản ghi.

---

## Tùy chọn: đặt mã nộp bài

Endpoint `/submit` mặc định để mở. Nếu muốn hạn chế:

```bash
npx wrangler secret put SUBMIT_TOKEN
```

Sau đó Worker sẽ từ chối mọi request `/submit` không kèm header `x-cva-token` đúng giá trị. Khi đã đặt secret này, cần sửa `gallerySubmit()` trong `app.js` để gửi kèm header đó.

## Giới hạn & vận hành

| Mục | Giá trị |
|---|---|
| Kích thước file tối đa | 2MB |
| Số bài `/list` trả về | 300 mới nhất |
| Hạn mức KV gói miễn phí | 100.000 lượt đọc/ngày, 1.000 lượt ghi/ngày |

Xóa một bài: vào Cloudflare Dashboard → Workers & Pages → KV → namespace `SUBMISSIONS`, xóa cặp key `meta:...:<id>` và `file:<id>`.
