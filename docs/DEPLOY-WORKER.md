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

> **KV list() chậm tới 60 giây.** Bài vừa ghi có thể chưa hiện ngay trong `/list` —
> đó là đặc tính *eventual consistency* của Cloudflare KV, không phải lỗi. Gọi lại sau
> vài giây là thấy. Trên web thì `app.js` đã tự ghép bài vừa nộp vào danh sách
> nên thầy/cô không thấy độ trễ này.

### Nếu dùng PowerShell trên Windows

Trong PowerShell, `curl` là **alias của `Invoke-WebRequest`**, không hiểu `-H`/`-d`
(báo lỗi *"Cannot bind parameter 'Headers'"*). Phải gọi `curl.exe` có đuôi `.exe`,
và đưa JSON qua file thay vì gõ thẳng — PowerShell nuốt mất dấu ngoặc kép:

```powershell
$f = "$env:TEMP\cva-test.json"
$json = '{"teacherName":"T","projectName":"T","pageUrl":"https://evil.example.com/x"}'
# PHẢI ghi không BOM: Out-File -Encoding utf8 của PowerShell 5.1 thêm 3 byte BOM
# vào đầu file, làm request.json() của Worker báo "Body không phải JSON hợp lệ".
[System.IO.File]::WriteAllText($f, $json, (New-Object System.Text.UTF8Encoding($false)))
curl.exe -s -X POST https://cva-gallery.ten-tai-khoan.workers.dev/submit `
  -H "content-type: application/json" -d "@$f"
# → {"error":"Chỉ nhận link từ: github.io, pages.dev, netlify.app, vercel.app"}
```

Ra đúng câu trên nghĩa là Worker bản mới đã lên: vừa nhận `pageUrl`, vừa chặn miền lạ.

---

## Tùy chọn: đặt mã nộp bài

Endpoint `/submit` mặc định để mở. Nếu muốn hạn chế:

```bash
npx wrangler secret put SUBMIT_TOKEN
```

Sau đó Worker sẽ từ chối mọi request `/submit` không kèm header `x-cva-token` đúng giá trị. Khi đã đặt secret này, cần sửa `gallerySubmit()` trong `app.js` để gửi kèm header đó.

## Giới hạn & vận hành

| Mục | Giá trị |
| --- | --- |
| Kích thước file tối đa | 10MB (`MAX_UPLOAD_MB` trong `data.js` + `MAX_HTML_MB` trong `cloudflare-worker.js`) |
| Số bài `/list` trả về | 300 mới nhất |
| Hạn mức KV gói miễn phí | 100.000 lượt đọc/ngày, 1.000 lượt ghi/ngày |
| Miền được dán link | `github.io`, `pages.dev`, `netlify.app`, `vercel.app`, `ai.studio`, `run.app` (`ALLOWED_PAGE_HOSTS`, khai báo ở **cả hai** `data.js` và `cloudflare-worker.js`) |
| Mã nguồn gửi cho AI nhận xét | 60.000 ký tự đầu (`REVIEW_CHAR_LIMIT` trong `app.js`) |
| Worker tải hộ qua `/fetch` | tối đa 10MB, 3 chặng redirect, hạn giờ 15 giây |

Xóa một bài: vào Cloudflare Dashboard → Workers & Pages → KV → namespace `SUBMISSIONS`, xóa cặp key `meta:...:<id>` và `file:<id>`.

---

## Nộp bằng link thay vì file

Một bài nộp hợp lệ khi có **ít nhất một** trong hai thứ:

- file `.html` tải lên, hoặc
- link trang đã xuất bản (GitHub Pages…) dán vào ô bên dưới ô tải file.

Có cả hai cũng được: thẻ trong thư viện sẽ hiện cả nút **Mở trang ↗** lẫn **Xem trước**.

Chỉ nhận `https://` và các miền trong `ALLOWED_PAGE_HOSTS`. Danh sách này khai báo **hai nơi** và phải giống nhau — `data.js` cho trình duyệt, `cloudflare-worker.js` cho phía máy chủ (vì kiểm tra phía trình duyệt thì ai cũng bỏ qua được bằng một lệnh `curl`).

Khi chỉ có link, nút “Nhờ AI nhận xét” sẽ tự tải HTML từ chính link đó — GitHub Pages / Netlify / Vercel / Cloudflare Pages trả header `access-control-allow-origin: *` nên không cần proxy. Trang phải ở chế độ công khai.

### Vì sao có route `/fetch`

`run.app` và `ai.studio` (app deploy từ Google AI Studio) **không** trả header CORS, nên trình duyệt chặn không cho trang web đọc nội dung của chúng. `getHtmlForReview()` trong `app.js` vì thế làm hai bước:

1. thử tải thẳng từ trình duyệt — GitHub Pages / Netlify / Vercel / Cloudflare Pages đi đường này;
2. thất bại thì gọi `GET /fetch?url=<link>`, Worker tải hộ rồi trả về kèm CORS. CORS là quy định của **trình duyệt**, `fetch` chạy trong Worker không bị ràng buộc.

Không có danh sách "miền nào cần proxy" — cứ thử rồi mới đi đường vòng, đỡ phải đồng bộ thêm một danh sách nữa.

Route `/fetch` biến Worker thành người tải hộ, nên nó chặn sẵn: chỉ `https` và chỉ các miền trong `ALLOWED_PAGE_HOSTS` (dùng lại `cleanPageUrl`), đi theo redirect thủ công và **kiểm tra lại allowlist ở từng chặng** (tối đa `MAX_REDIRECTS`), chỉ nhận `text/html` hoặc `text/plain`, cắt ở `MAX_HTML`, và có hạn giờ `FETCH_TIMEOUT_MS`.

> ⚠️ `run.app` là miền dùng chung của Google Cloud Run, nên allowlist ở đây cho phép **mọi** service Cloud Run, không riêng của trường. Nếu sau này thấy quota Worker bị dùng bừa, hãy bắt `/fetch` phải kèm `x-cva-token` giống `/submit`.
