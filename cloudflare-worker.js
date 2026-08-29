/**
 * Thư viện dự án chung — AI cho Giáo viên CVA
 * ============================================================
 * Cloudflare Worker + KV. Ba route:
 *   GET  /list           → metadata mọi bài nộp, mới nhất lên đầu
 *   GET  /file?id=<id>   → mã nguồn HTML của một bài (dùng cho Xem trước)
 *   POST /submit         → nhận một bài nộp mới
 *
 * Hướng dẫn deploy: xem DEPLOY-WORKER.md
 * Binding cần có: KV namespace tên SUBMISSIONS
 * Secret tùy chọn: SUBMIT_TOKEN (nếu đặt thì client phải gửi header x-cva-token)
 */

const MAX_HTML = 2 * 1024 * 1024;  // 2MB mã nguồn
const MAX_TEXT = 200;              // họ tên / lớp / tổ / tên dự án
const MAX_REVIEW = 4000;           // nhận xét của AI
const LIST_LIMIT = 300;            // số bài trả về tối đa cho /list

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
      if (path === "/list" && request.method === "GET") return listSubmissions(env);
      if (path === "/file" && request.method === "GET") return getFile(url, env);
      if (path === "/submit" && request.method === "POST") return submit(request, env);
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

  if (!teacherName) return json({ error: "Thiếu họ tên giáo viên" }, 400);
  if (!projectName) return json({ error: "Thiếu tên dự án" }, 400);
  if (!html) return json({ error: "Thiếu nội dung file HTML" }, 400);
  if (html.length > MAX_HTML) return json({ error: "File vượt quá 2MB" }, 413);

  const ts = Date.now();
  const id = `p_${ts}_${Math.random().toString(36).slice(2, 8)}`;
  const meta = {
    id, addedAt: ts,
    teacherName, className, projectName,
    to: clean(body.to),
    fileName: clean(body.fileName, 120) || "index.html",
    size: html.length,
    reviewText: clean(body.reviewText, MAX_REVIEW)
  };

  // Mã nguồn tách khỏi metadata để /list nhẹ, không kéo theo cả file.
  await env.SUBMISSIONS.put(`file:${id}`, html);
  await env.SUBMISSIONS.put(metaKey(ts, id), JSON.stringify(meta));

  return json(meta, 201);
}
