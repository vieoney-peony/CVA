/**
 * Thư viện dự án chung — AI cho Giáo viên CVA
 * ============================================================
 * Cloudflare Worker + KV. Bốn route:
 *   GET  /list           → metadata mọi bài nộp, mới nhất lên đầu
 *   GET  /file?id=<id>   → mã nguồn HTML của một bài (dùng cho Xem trước)
 *   GET  /fetch?url=<u>  → tải hộ HTML của một trang đã xuất bản (vượt CORS)
 *   POST /submit         → nhận một bài nộp mới
 *
 * Hướng dẫn deploy: xem docs/DEPLOY-WORKER.md
 * Binding cần có: KV namespace tên SUBMISSIONS
 * Secret tùy chọn: SUBMIT_TOKEN (nếu đặt thì client phải gửi header x-cva-token)
 */

const MAX_HTML_MB = 10;                        // giữ khớp với MAX_UPLOAD_MB trong data.js
const MAX_HTML = MAX_HTML_MB * 1024 * 1024;    // trần cứng: 1 value KV tối đa 25MB
const MAX_TEXT = 200;              // họ tên / lớp / tổ / tên dự án
const MAX_REVIEW = 4000;           // nhận xét của AI
const LIST_LIMIT = 300;            // số bài trả về tối đa cho /list
const MAX_URL = 400;               // link trang đã xuất bản
const FETCH_TIMEOUT_MS = 15000;    // hạn giờ khi Worker tải hộ một trang
const MAX_REDIRECTS = 3;           // số chặng redirect tối đa khi tải hộ
// Giữ khớp với ALLOWED_PAGE_HOSTS trong data.js. Kiểm tra lại ở đây vì
// validate phía trình duyệt ai cũng bỏ qua được bằng một lệnh curl.
const ALLOWED_PAGE_HOSTS = ["github.io", "pages.dev", "netlify.app", "vercel.app", "ai.studio","run.app"];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type,x-cva-token",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS }
  });
}

/* Cắt và làm sạch một trường text ngắn. */
function clean(v, max = MAX_TEXT) {
  return String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Key của metadata dùng timestamp ĐẢO NGƯỢC.
 * KV list() trả key theo thứ tự tăng dần, nên đảo timestamp giúp
 * duyệt tuần tự là đã "mới nhất trước" — không phải đọc hết rồi sort.
 */
function metaKey(ts, id) {
  return `meta:${String(1e13 - ts).padStart(14, "0")}:${id}`;
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      // Phải có await: "return promise" trong try KHÔNG chui vào catch, nên lỗi
      // sẽ thoát ra ngoài Worker => Cloudflare trả trang 1101 text/plain KHÔNG
      // kèm header CORS => trình duyệt chỉ thấy "Failed to fetch", mất sạch
      // thông báo lỗi thật.
      if (path === "/list" && request.method === "GET") return await listSubmissions(env);
      if (path === "/file" && request.method === "GET") return await getFile(url, env);
      if (path === "/fetch" && request.method === "GET") return await fetchPage(url);
      if (path === "/submit" && request.method === "POST") return await submit(request, env);
      if (path === "/") return json({ ok: true, service: "cva-gallery" });
      return json({ error: "Không tìm thấy route này" }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  }
};

async function listSubmissions(env) {
  const listed = await env.SUBMISSIONS.list({ prefix: "meta:", limit: LIST_LIMIT });
  const items = await Promise.all(
    listed.keys.map(k => env.SUBMISSIONS.get(k.name, { type: "json" }))
  );
  // Đã newest-first nhờ key timestamp đảo ngược ở trên.
  return json(items.filter(Boolean));
}

async function getFile(url, env) {
  const id = clean(url.searchParams.get("id"), 80);
  if (!id) return json({ error: "Thiếu tham số id" }, 400);

  const html = await env.SUBMISSIONS.get(`file:${id}`, { type: "text" });
  if (html == null) return json({ error: "Không tìm thấy bài nộp" }, 404);

  return new Response(html, {
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS }
  });
}

/**
 * GET /fetch?url=<link> → tải hộ HTML của một trang đã xuất bản.
 *
 * Vì sao cần route này: `run.app` và `ai.studio` (app deploy từ Google AI
 * Studio) KHÔNG trả header `access-control-allow-origin`, nên trình duyệt
 * chặn không cho trang web đọc nội dung — nút "Nhờ AI nhận xét" mà chỉ có
 * link thì chịu. CORS là quy định của trình duyệt, `fetch` trong Worker
 * không bị ràng buộc, nên Worker tải hộ rồi trả về kèm header CORS.
 *
 * Route này biến Worker thành "người tải hộ" cho bất kỳ ai gọi tới, nên
 * phải khoá lại:
 *   - chỉ https và chỉ các miền trong ALLOWED_PAGE_HOSTS (dùng cleanPageUrl)
 *   - đi theo redirect THỦ CÔNG và kiểm tra lại từng chặng: một trang hợp lệ
 *     vẫn có thể 302 sang chỗ khác, đi theo mù thì allowlist thành vô nghĩa
 *   - chỉ nhận HTML/text, và cắt ở MAX_HTML
 *   - có hạn giờ, để một trang treo không giữ Worker chạy mãi
 */
async function fetchPage(url) {
  let target = cleanPageUrl(url.searchParams.get("url"));
  if (!target) return json({ error: "Thiếu tham số url" }, 400);

  const signal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  let res;

  for (let hop = 0; ; hop++) {
    res = await fetch(target, {
      redirect: "manual",
      signal,
      headers: { accept: "text/html,text/plain,*/*" }
    }).catch(err => {
      const m = String(err && err.message || err);
      throw new Error(/abort|timed? ?out/i.test(m) ? "Trang tải quá lâu, thử lại sau" : "Không tải được trang đó");
    });

    const loc = (res.status >= 300 && res.status < 400) ? res.headers.get("location") : null;
    if (!loc) break;
    if (hop >= MAX_REDIRECTS) throw new Error("Trang chuyển hướng quá nhiều lần");
    // Đích của redirect cũng phải nằm trong allowlist — nếu không, cleanPageUrl ném lỗi.
    target = cleanPageUrl(new URL(loc, target).href);
  }

  if (!res.ok) {
    throw new Error(`Trang trả HTTP ${res.status} — kiểm tra link đã ở chế độ công khai chưa`);
  }

  const type = (res.headers.get("content-type") || "").toLowerCase();
  if (!/text\/html|text\/plain|application\/xhtml/.test(type)) {
    throw new Error("Link này không trả về HTML (" + (type.split(";")[0].trim() || "không rõ loại") + ")");
  }
  if (Number(res.headers.get("content-length") || 0) > MAX_HTML) {
    throw new Error(`Trang nặng hơn ${MAX_HTML_MB}MB, không nhận xét được`);
  }

  // Cắt lần nữa: content-length có thể thiếu hoặc khai sai.
  const html = (await res.text()).slice(0, MAX_HTML);
  return new Response(html, {
    headers: { "content-type": "text/plain; charset=utf-8", ...CORS }
  });
}

/* Trả link đã chuẩn hoá, hoặc ném lỗi nếu link không hợp lệ. Rỗng là hợp lệ. */
function cleanPageUrl(v) {
  const raw = String(v == null ? "" : v).trim();
  if (!raw) return "";
  if (raw.length > MAX_URL) throw new Error("Link quá dài");

  let u;
  try { u = new URL(raw); } catch (e) { throw new Error("Link không đúng định dạng"); }
  if (u.protocol !== "https:") throw new Error("Link phải dùng https://");

  const host = u.hostname.toLowerCase();
  if (!ALLOWED_PAGE_HOSTS.some(d => host === d || host.endsWith("." + d))) {
    throw new Error("Chỉ nhận link từ: " + ALLOWED_PAGE_HOSTS.join(", "));
  }
  return u.href;
}

async function submit(request, env) {
  // Chỉ kiểm tra token khi secret SUBMIT_TOKEN đã được đặt.
  if (env.SUBMIT_TOKEN && request.headers.get("x-cva-token") !== env.SUBMIT_TOKEN) {
    return json({ error: "Sai mã nộp bài" }, 401);
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ error: "Body không phải JSON hợp lệ" }, 400);

  const teacherName = clean(body.teacherName);
  const className = clean(body.className);
  const projectName = clean(body.projectName);
  const html = String(body.html || "");

  let pageUrl;
  try { pageUrl = cleanPageUrl(body.pageUrl); }
  catch (e) { return json({ error: e.message }, 400); }

  if (!teacherName) return json({ error: "Thiếu họ tên giáo viên" }, 400);
  if (!projectName) return json({ error: "Thiếu tên dự án" }, 400);
  // Một bài nộp cần ÍT NHẤT một thứ xem được: file HTML hoặc link trang.
  if (!html && !pageUrl) return json({ error: "Cần file HTML hoặc link trang đã xuất bản" }, 400);
  if (html.length > MAX_HTML) return json({ error: `File vượt quá ${MAX_HTML_MB}MB` }, 413);

  const ts = Date.now();
  const id = `p_${ts}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    id, addedAt: ts,
    teacherName, className, projectName,
    to: clean(body.to),
    fileName: clean(body.fileName, 120) || (html ? "index.html" : ""),
    size: html.length,
    pageUrl,
    hasFile: Boolean(html),
    reviewText: clean(body.reviewText, MAX_REVIEW)
  };

  // Mã nguồn tách khỏi metadata để /list nhẹ, không kéo theo cả file.
  if (html) await env.SUBMISSIONS.put(`file:${id}`, html);
  await env.SUBMISSIONS.put(metaKey(ts, id), JSON.stringify(meta));

  return json(meta, 201);
}
