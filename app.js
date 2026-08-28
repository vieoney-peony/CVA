// ============================================================
// AI cho Giáo viên CVA — logic giao diện & tính năng
// ============================================================
"use strict";

/* ---------------------------------------------------------- helpers */
function toast(msg = "Đã sao chép!") {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._tm);
  toast._tm = setTimeout(() => t.classList.remove('show'), 1800);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
}
function copyText(id) {
  const el = document.getElementById(id);
  navigator.clipboard.writeText(el.innerText).then(() => toast()).catch(() => toast("Không sao chép được — hãy chọn và copy thủ công"));
}
function copyRaw(txt) {
  navigator.clipboard.writeText(txt).then(() => toast()).catch(() => toast("Không sao chép được — hãy chọn và copy thủ công"));
}
function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0, n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(1)) + ' ' + units[i];
}
function fmtDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}

/* ---------------------------------------------------------- theme */
function toggleTheme() {
  const root = document.documentElement;
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  localStorage.setItem("cvaTheme", next);
}
(function () { const t = localStorage.getItem("cvaTheme"); if (t) document.documentElement.dataset.theme = t; })();

/* ---------------------------------------------------------- journey / progress */
const JOURNEY_KEY = "cvaJourneyDone";
function getJourneyDone() {
  try { return JSON.parse(localStorage.getItem(JOURNEY_KEY) || "{}"); } catch (e) { return {}; }
}
function setJourneyDone(id, val) {
  const d = getJourneyDone(); d[id] = val;
  localStorage.setItem(JOURNEY_KEY, JSON.stringify(d));
  renderJourneyProgress();
}
function renderJourneyProgress() {
  const done = getJourneyDone();
  const n = JOURNEY.filter(j => done[j.id]).length;
  document.getElementById("journeyFill").style.width = (n / JOURNEY.length * 100) + "%";
  document.getElementById("journeyPct").textContent = `${n}/${JOURNEY.length} chặng`;
  document.querySelectorAll(".stepPill").forEach(p => p.classList.toggle("done", !!done[p.dataset.ch]));
  document.querySelectorAll(".chDoneBox").forEach(cb => { cb.checked = !!done[cb.dataset.ch]; });
}

/* ---------------------------------------------------------- nav: step pills + drawer */
function renderNav() {
  const pillsEl = document.getElementById("stepPills");
  pillsEl.innerHTML = JOURNEY.map(j =>
    `<button type="button" class="stepPill" data-ch="${j.id}"><b>${j.n}</b>${j.label}</button>`
  ).join("");

  const drawerEl = document.getElementById("drawerNav");
  drawerEl.innerHTML = `
    <button type="button" data-goto-home>🏠 Trang chủ</button>
    <div class="grpLabel">Lộ trình 4 chặng</div>
    ${JOURNEY.map(j => `<button type="button" data-ch="${j.id}">${j.icon} ${j.n}. ${j.label}</button>`).join("")}
    <div class="grpLabel">Khác</div>
    <button type="button" data-page="c4-s4">📥 Tài liệu tải về</button>
    <button type="button" data-page="c4-s5">❓ FAQ</button>
  `;
}

function openDrawer() {
  document.getElementById("drawer").dataset.open = "true";
  document.getElementById("hamBtn").setAttribute("aria-expanded", "true");
  const closeBtn = document.querySelector(".drawerTop .iconbtn");
  if (closeBtn) closeBtn.focus();
}
function closeDrawer() {
  document.getElementById("drawer").dataset.open = "false";
  document.getElementById("hamBtn").setAttribute("aria-expanded", "false");
}
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeDrawer(); closeSearch(); }
});

/* chặng "đã hoàn thành" checkboxes (inserted into DOM via data attr already in HTML) */
function setupChDoneBoxes() {
  document.querySelectorAll(".chDoneBox").forEach(cb => {
    cb.addEventListener("change", () => setJourneyDone(cb.dataset.ch, cb.checked));
  });
}

/* ============================================================
   ROUTER — trang xếp chồng (stack pages)
   Mỗi .page là một màn hình riêng; chuyển trang bằng cách đổi
   location.hash, nên nút Back/Forward của trình duyệt cũng hoạt
   động đúng như một ngăn xếp điều hướng thật.
   ============================================================ */
let pageEls = [], PAGES = [], currentIndex = -1;

function initPages() {
  pageEls = [...document.querySelectorAll(".page")];
  PAGES = pageEls.map(el => {
    const h2 = el.querySelector("h2");
    return {
      id: el.dataset.page,
      chang: el.dataset.chang || null,
      label: h2 ? h2.textContent.trim() : (el.dataset.page === "home" ? "Trang chủ" : el.dataset.page)
    };
  });
}
function pageIndexById(id) { return PAGES.findIndex(p => p.id === id); }

function setPagePosition(el, state, instant) {
  if (instant) el.classList.add("pg-noanim");
  el.classList.remove("pg-active", "pg-ahead", "pg-behind");
  el.classList.add(state);
  if (instant) {
    void el.offsetHeight;
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("pg-noanim")));
  }
}

function renderStage(newIndex) {
  const oldIndex = currentIndex;
  const animate = oldIndex !== -1 && oldIndex !== newIndex;
  pageEls.forEach((el, i) => {
    const isMover = animate && (i === oldIndex || i === newIndex);
    const state = i === newIndex ? "pg-active" : (i < newIndex ? "pg-behind" : "pg-ahead");
    setPagePosition(el, state, !isMover);
  });
  currentIndex = newIndex;
  updateChromeForCurrentPage();
}

/* center short pages (few cards, little text) vertically inside the viewport
   instead of leaving a big empty gap under them; long pages keep top-align + scroll */
function centerShortPage(el) {
  if (!el || !el.dataset.chang) { return; }
  const inner = el.querySelector(":scope > .container");
  if (!inner) return;
  inner.style.paddingTop = "";
  const extra = el.clientHeight - inner.scrollHeight;
  inner.style.paddingTop = extra > 60 ? Math.round(extra / 2) + "px" : "";
}
window.addEventListener("resize", () => centerShortPage(pageEls[currentIndex]));
document.addEventListener("click", () => setTimeout(() => centerShortPage(pageEls[currentIndex]), 0));
document.addEventListener("change", () => setTimeout(() => centerShortPage(pageEls[currentIndex]), 0));

function updateChromeForCurrentPage() {
  const cur = PAGES[currentIndex];
  document.querySelectorAll(".stepPill").forEach(p => p.classList.toggle("active", !!cur.chang && p.dataset.ch === cur.chang));
  document.querySelector(".bottomNav").classList.toggle("bn-hidden", !cur.chang);

  const backBtn = document.getElementById("navBack");
  const nextBtn = document.getElementById("navNext");
  backBtn.disabled = currentIndex === 0;
  const isLast = currentIndex === PAGES.length - 1;
  nextBtn.textContent = isLast ? "🏠 Về trang chủ" : "Tiếp theo →";

  const label = document.getElementById("navCenterLabel");
  const dotsEl = document.getElementById("pageDots");
  if (!cur.chang) {
    label.textContent = "Trang chủ — chọn một chặng để bắt đầu";
    dotsEl.innerHTML = "";
  } else {
    const jr = JOURNEY.find(j => j.id === cur.chang);
    const stepsOfChang = PAGES.map((p, i) => ({ p, i })).filter(x => x.p.chang === cur.chang);
    const posInChang = stepsOfChang.findIndex(x => x.i === currentIndex) + 1;
    label.textContent = `${jr.icon} Chặng ${jr.n} · Bước ${posInChang}/${stepsOfChang.length} · ${cur.label}`;
    dotsEl.innerHTML = stepsOfChang.map(x => {
      const cls = x.i === currentIndex ? "on" : (x.i < currentIndex ? "past" : "");
      return `<button type="button" class="dotBtn ${cls}" data-idx="${x.i}" aria-label="${escapeHtml(PAGES[x.i].label)}"></button>`;
    }).join("");
  }
  const el = pageEls[currentIndex];
  if (el) { el.scrollTop = 0; centerShortPage(el); }
}

function handleHashChange() {
  const id = location.hash.replace("#", "") || "home";
  const idx = pageIndexById(id);
  renderStage(idx === -1 ? 0 : idx);
}
function setHash(id) {
  if (("#" + id) !== location.hash) location.hash = id;
  else handleHashChange();
}
function navigateToIndex(idx) {
  if (idx < 0 || idx >= PAGES.length) return;
  setHash(PAGES[idx].id);
}
function goToPage(id) { const idx = pageIndexById(id); if (idx !== -1) navigateToIndex(idx); }
function goToChang(changId) { const idx = PAGES.findIndex(p => p.chang === changId); if (idx !== -1) navigateToIndex(idx); }
function goNext() {
  if (currentIndex === PAGES.length - 1) { goToPage("home"); return; }
  navigateToIndex(currentIndex + 1);
}
function goBack() { navigateToIndex(currentIndex - 1); }

window.addEventListener("hashchange", handleHashChange);

/* clicks that drive navigation, handled once via delegation */
document.addEventListener("click", (e) => {
  const pill = e.target.closest(".stepPill");
  if (pill) { goToChang(pill.dataset.ch); return; }
  const gc = e.target.closest("[data-goto-chang]");
  if (gc) { goToChang(gc.dataset.gotoChang); return; }
  const gh = e.target.closest("[data-goto-home]");
  if (gh) { goToPage("home"); closeDrawer(); return; }
  const dp = e.target.closest("[data-page]");
  if (dp) { goToPage(dp.dataset.page); closeDrawer(); closeSearch(); return; }
  const dch = e.target.closest(".drawerNav [data-ch]");
  if (dch) { goToChang(dch.dataset.ch); closeDrawer(); return; }
  const sc = e.target.closest("[data-scroll-to]");
  if (sc) { document.getElementById(sc.dataset.scrollTo)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const dot = e.target.closest(".pageDots .dotBtn");
  if (dot) { navigateToIndex(+dot.dataset.idx); return; }
});

/* keyboard: ← → to move between pages (ignored while typing in a field) */
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
  if (e.key === "ArrowRight") goNext();
  else if (e.key === "ArrowLeft") goBack();
});

/* swipe left/right on touch devices */
function setupSwipe() {
  const stageEl = document.getElementById("main");
  let sx = 0, sy = 0, active = false;
  stageEl.addEventListener("touchstart", (e) => {
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; active = true;
  }, { passive: true });
  stageEl.addEventListener("touchend", (e) => {
    if (!active) return; active = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) goNext(); else goBack();
    }
  }, { passive: true });
}

/* ---------------------------------------------------------- AI Compass */
function runCompass() {
  const goal = document.getElementById("goal").value;
  const level = document.getElementById("level").value;
  const time = document.getElementById("time").value;
  const map = {
    c1: ["Bắt đầu ở Chặng 1 · Hiểu AI", "Xem AI nào hợp việc gì và khi nào nên dùng Skill, trước khi bắt tay vào làm.", "c1-s1"],
    c2: ["Bắt đầu ở Chặng 2 · Viết prompt", "Dùng công thức 6 phần rồi thử ngay một prompt trong ngân hàng 16 prompt.", "c2-s1"],
    c3: ["Bắt đầu ở Chặng 3 · Tạo sản phẩm", "Chọn một học liệu nhỏ đã có sẵn, dùng prompt khung 'một file HTML', rồi kiểm thử trước khi thêm AI.", "c3-s1"],
    c4: ["Bắt đầu ở Chặng 4 · Chia sẻ & an toàn", "Nắm 5 nguyên tắc an toàn, tự thêm API key của bạn rồi thử GitHub Pages.", "c4-s1"]
  };
  const m = map[goal];
  document.getElementById("compassResult").innerHTML =
    `<h3>${m[0]}</h3><p>${m[1]}</p><p style="font-size:12.5px"><b>Mức hiện tại:</b> ${escapeHtml(level)} · <b>Quỹ thời gian:</b> ${escapeHtml(time)}</p>
     <button class="btn secondary" data-page="${m[2]}" type="button">Đi tới nội dung →</button>`;
}

/* ---------------------------------------------------------- journey cards (hero grid) */
function renderJourneyCards() {
  document.getElementById("journeyCards").innerHTML = JOURNEY.map(j => `
    <button type="button" class="feature" style="text-align:left;display:block;width:100%" data-goto-chang="${j.id}">
      <div class="ico">${j.icon}</div>
      <h3>Chặng ${j.n} · ${j.label}</h3>
      <p>${j.desc}</p>
      <span class="miniLink">Đi tới chặng ${j.n} →</span>
    </button>`).join("");
}

/* ---------------------------------------------------------- Claude 5 phút mini cards */
const CLAUDE_5MIN = [
  { ico: "📁", t: "Projects", d: "Không gian làm việc gắn với bộ tài liệu ổn định theo chủ đề." },
  { ico: "🧩", t: "Skills", d: "Đóng gói hướng dẫn, tài nguyên và quy trình để kết quả nhất quán." },
  { ico: "🎛️", t: "Styles & Preferences", d: "Đặt văn phong, độ dài và quy ước trình bày mặc định." },
];
function renderClaudeCards() {
  document.getElementById("claudeCards").innerHTML = CLAUDE_5MIN.map(c =>
    `<div class="feature"><div class="ico">${c.ico}</div><h3>${c.t}</h3><p>${c.d}</p></div>`).join("");
}

/* ---------------------------------------------------------- AI comparison flip cards */
function renderAI() {
  const icons = ["🌀", "🟠", "✦", "▦"];
  document.getElementById("aiGrid").innerHTML = aiCards.map((x, i) => `
    <div class="flip" data-i="${i}" tabindex="0" role="button" aria-label="Xem chi tiết ${escapeHtml(x.name)}">
      <div class="flipin">
        <div class="face front">
          <div class="aiLogo">${icons[i] || "🤖"}</div>
          <h3>${escapeHtml(x.name)}</h3>
          <p>${escapeHtml(x.tag)}</p>
          <small>Bấm để xem điểm mạnh/yếu →</small>
        </div>
        <div class="face back">
          <p><b>Mạnh:</b> ${escapeHtml(x.best)}</p>
          <p><b>Lưu ý:</b> ${escapeHtml(x.weak)}</p>
          <p><b>Chi phí:</b> ${escapeHtml(x.cost)}</p>
        </div>
      </div>
    </div>`).join("");
  document.querySelectorAll(".flip").forEach(el => {
    el.addEventListener("click", () => el.classList.toggle("flipped"));
    el.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.classList.toggle("flipped"); } });
  });
}

/* ---------------------------------------------------------- Skill starter prompt */
function copySkillStarter() {
  copyRaw(`Tôi muốn xây một AI Skill cho công việc giáo viên sau: [MÔ TẢ CÔNG VIỆC].
Hãy giúp tôi theo quy trình:
1) xác định đây có thực sự phù hợp để làm Skill không;
2) hỏi tôi về đầu vào, quy ước riêng, đầu ra chuẩn và các trường hợp ngoại lệ;
3) đề xuất cấu trúc Skill tối thiểu;
4) viết trường mô tả gồm chức năng + đầu ra + điều kiện kích hoạt bằng ngôn ngữ giáo viên thường dùng;
5) đề xuất bộ test gồm ca bình thường, dữ liệu thiếu và ca biên.
Không thêm quy tắc mà tôi chưa cung cấp; chỗ nào thiếu hãy hỏi.`);
}

/* ---------------------------------------------------------- Prompt bank (tabs + grid) — event-delegated, no inline onclick */
let promptCategory = "Tất cả";
function renderPromptTabs() {
  const cats = ["Tất cả", ...new Set(prompts.map(x => x[0]))];
  document.getElementById("promptTabs").innerHTML = cats.map(c =>
    `<button class="tab ${c === promptCategory ? "active" : ""}" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join("");
}
function renderPrompts() {
  const data = prompts.filter((x, i) => (promptCategory === "Tất cả" || x[0] === promptCategory) ? true : false)
    .map((x) => ({ ...x, _i: prompts.indexOf(x) }));
  document.getElementById("promptGrid").innerHTML = prompts
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => promptCategory === "Tất cả" || x[0] === promptCategory)
    .map(({ x, i }) => `
      <article class="promptCard">
        <div class="promptTop">
          <div><span class="badge">${escapeHtml(x[0])}</span><h4>${x[1]} ${escapeHtml(x[2])}</h4></div>
          <button class="copyBtn" data-idx="${i}" aria-label="Sao chép prompt">📋</button>
        </div>
        <div class="promptBody">${escapeHtml(x[3])}</div>
      </article>`).join("");
}
document.addEventListener("click", (e) => {
  const tab = e.target.closest("#promptTabs .tab");
  if (tab) { promptCategory = tab.dataset.cat; renderPromptTabs(); renderPrompts(); return; }
  const cb = e.target.closest("#promptGrid .copyBtn");
  if (cb) { copyRaw(prompts[+cb.dataset.idx][3]); return; }
});

/* ---------------------------------------------------------- 8 tình huống */
let currentSituation = 0, currentSituationTab = "overview";
function renderSituationNav() {
  const nav = document.getElementById("situationNav"); if (!nav) return;
  nav.innerHTML = workSituations.map((s, i) =>
    `<button class="sitBtn ${i === currentSituation ? "active" : ""}" data-i="${i}"><span class="sitNum">${s.n}</span><span>${s.icon} ${escapeHtml(s.title)}</span></button>`).join("");
}
function selectSituation(i) { currentSituation = i; currentSituationTab = "overview"; renderSituationNav(); renderSituationDetail(); }
function setSituationTab(tab) { currentSituationTab = tab; renderSituationDetail(); }
function renderSituationDetail() {
  const el = document.getElementById("situationDetail"); if (!el) return;
  const s = workSituations[currentSituation];
  const tabs = [["overview", "Tổng quan"], ["split", "Máy vs AI"], ["steps", "Làm từng bước"], ["prompt", "Prompt mẫu"], ["check", "Checklist"]];
  let body = "";
  if (currentSituationTab === "overview") {
    body = `<div class="compareCard"><h4>📦 Thầy/cô cần chuẩn bị</h4><div class="tickList">${s.input.map(x => `<div class="tickItem">• <span>${escapeHtml(x)}</span></div>`).join("")}</div></div>
          <div class="callout" style="margin-top:12px"><b>Vì sao nên làm?</b> ${escapeHtml(s.why)}</div>
          <div class="callout" style="margin-top:10px"><b>Lưu ý sư phạm/kĩ thuật:</b> ${escapeHtml(s.note)}</div>`;
  } else if (currentSituationTab === "split") {
    body = `<div class="compareCols">
      <div class="compareCard machine"><h4>⚙️ Máy tự làm — không cần key</h4><div class="tickList">${s.machine.map(x => `<div class="tickItem">✓ <span>${escapeHtml(x)}</span></div>`).join("")}</div></div>
      <div class="compareCard ai"><h4>✨ AI làm thêm — cần key</h4><div class="tickList">${s.ai.map(x => `<div class="tickItem">✦ <span>${escapeHtml(x)}</span></div>`).join("")}</div></div>
    </div>`;
  } else if (currentSituationTab === "steps") {
    body = `<div class="tickList">${s.steps.map((x, i) => `<div class="tickItem"><b>${i + 1}</b><span>${escapeHtml(x)}</span></div>`).join("")}</div>`;
  } else if (currentSituationTab === "prompt") {
    body = `<div class="promptBig">${escapeHtml(s.prompt)}</div><button class="btn primary sitCopyPrompt" style="margin-top:12px">📋 Sao chép prompt này</button>`;
  } else {
    const checks = ["Đầu vào đã sạch và đủ", "Đáp án/rubric đã được giáo viên xác nhận", "Phần offline chạy đúng trước khi thêm AI",
      "Không viết cứng API key", "Đã test trường hợp đúng hết/sai/bỏ trống", "Đã thử trên thiết bị thật", "Đã kiểm tra dữ liệu học sinh không bị lộ"];
    body = `<div class="tickList">${checks.map((x) => `<label class="tickItem"><input type="checkbox"> <span>${escapeHtml(x)}</span></label>`).join("")}</div>`;
  }
  el.innerHTML = `<div class="situationHero"><div>QUY TRÌNH ${s.n}/8</div><h3>${s.icon} ${escapeHtml(s.title)}</h3><p>${escapeHtml(s.transform)}</p></div>
    <div class="sitTabs">${tabs.map(t => `<button class="sitTab ${currentSituationTab === t[0] ? "active" : ""}" data-tab="${t[0]}">${t[1]}</button>`).join("")}</div>
    <div class="sitPane active">${body}</div>`;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("#situationNav .sitBtn");
  if (b) { selectSituation(+b.dataset.i); return; }
  const t = e.target.closest("#situationDetail .sitTab");
  if (t) { setSituationTab(t.dataset.tab); return; }
  const cp = e.target.closest("#situationDetail .sitCopyPrompt");
  if (cp) { copyRaw(workSituations[currentSituation].prompt); return; }
});

/* ---------------------------------------------------------- samples library */
function renderSampleFilter() {
  const subs = ["Tất cả", ...new Set(samples.map(s => s.subject))];
  document.getElementById("sampleFilter").innerHTML = subs.map(s => `<option>${escapeHtml(s)}</option>`).join("");
}
function renderSamples() {
  const f = document.getElementById("sampleFilter").value;
  const q = document.getElementById("sampleSearch").value.toLowerCase().trim();
  const data = samples.filter(x => (f === "Tất cả" || x.subject === f) && (!q || (x.title + " " + x.desc + " " + x.subject).toLowerCase().includes(q)));
  document.getElementById("sampleGrid").innerHTML = data.map(x => `
    <article class="sampleCard">
      <div class="bigicon">${x.icon}</div><div><span class="badge">${escapeHtml(x.subject)}</span></div>
      <h4>${escapeHtml(x.title)}</h4><p>${escapeHtml(x.desc)}</p>
      <a class="btn secondary btnSm" target="_blank" rel="noopener" href="${x.url}">Mở mẫu ↗</a>
    </article>`).join("") || `<p style="color:var(--muted)">Không tìm thấy mẫu phù hợp.</p>`;
}

/* ---------------------------------------------------------- subject picker */
function initSubjects() {
  const sel = document.getElementById("subjectSelect");
  sel.innerHTML = Object.keys(subjectIdeas).map(x => `<option>${escapeHtml(x)}</option>`).join("");
  showSubjectIdeas();
}
function showSubjectIdeas() {
  const s = document.getElementById("subjectSelect").value;
  const ideas = subjectIdeas[s] || [];
  document.getElementById("subjectIdeas").innerHTML =
    `<div class="subjectIdeasBox">
      <div class="ideaCount">🏆 ${ideas.length} ý tưởng cho ${escapeHtml(s)} · THPT chuyên/HSG</div>
      <h3>${escapeHtml(s)} + AI</h3>
      <div class="tickList">${ideas.map((x, i) => `<div class="tickItem"><b>${i + 1}.</b><span>${escapeHtml(x)}</span></div>`).join("")}</div>
      <button class="btn secondary" style="margin-top:14px" id="subjCopyBtn">📋 Sao chép prompt cho môn này</button>
     </div>`;
}
document.addEventListener("click", (e) => {
  if (e.target.closest("#subjCopyBtn")) {
    const s = document.getElementById("subjectSelect").value;
    const ideas = subjectIdeas[s] || [];
    copyRaw(`Tôi dạy môn ${s} tại trường THPT chuyên. Hãy giúp tôi chọn 1 trong các hướng sau để phát triển thành công cụ HTML/AI phù hợp học sinh giỏi: ${ideas.join(' | ')}. Hãy ưu tiên giá trị sư phạm, tính đúng đắn, kiểm thử và khả năng dùng lại.`);
  }
});

/* ---------------------------------------------------------- resources (real files now, no base64) */
function renderResources() {
  const el = document.getElementById('resourcesGrid'); if (!el) return;
  el.innerHTML = resources.map(r => `
    <article class="resourceCard">
      <div class="resourceIcon">${r.icon}</div>
      <div class="resourceBody">
        <h4>${escapeHtml(r.title)}</h4>
        <p>${escapeHtml(r.desc)}</p>
        <div class="resourceMeta">${escapeHtml(r.name)} · ${formatBytes(r.size)}</div>
        <a class="btn primary btnSm" href="${r.path}" download="${r.name}">⬇️ Tải về</a>
      </div>
    </article>`).join('');
}

/* ---------------------------------------------------------- FAQ */
function renderFaq() {
  document.getElementById("faqList").innerHTML = faqData.map((f, i) => `
    <div class="faqItem">
      <button class="faqQ"><span class="faqNo">${String(i + 1).padStart(2, "0")}</span>${f.q}<span aria-hidden="true">＋</span></button>
      <div class="faqA">${f.a}</div>
    </div>`).join("");
  document.querySelectorAll(".faqQ").forEach(btn => {
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", () => {
      const item = btn.parentElement;
      const open = item.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  });
}

/* ============================================================
   API KEY MANAGER
   Key lưu trong localStorage của trình duyệt người dùng — không
   gửi qua máy chủ nào của trang này. Gọi thẳng tới nhà cung cấp.
   ============================================================ */
const KEYS_STORAGE = "cvaApiKeys";
let currentProviderId = PROVIDERS[0].id;

function getSavedKeys() {
  try { return JSON.parse(localStorage.getItem(KEYS_STORAGE) || "{}"); } catch (e) { return {}; }
}
function setSavedKeys(obj) { localStorage.setItem(KEYS_STORAGE, JSON.stringify(obj)); }

function renderProviderRow() {
  document.getElementById("providerRow").innerHTML = PROVIDERS.map(p =>
    `<button class="providerBtn ${p.id === currentProviderId ? "active" : ""}" data-p="${p.id}">${p.name}</button>`).join("");
  const p = PROVIDERS.find(x => x.id === currentProviderId);
  document.getElementById("providerHint").innerHTML =
    `${escapeHtml(p.tagline)} · <a href="${p.keyLink}" target="_blank" rel="noopener">${escapeHtml(p.keyHint)} ↗</a>`;
  renderModelSelect();
  const saved = getSavedKeys()[currentProviderId];
  document.getElementById("keyInput").value = saved ? saved.key : "";
  if (saved && saved.model) document.getElementById("modelSelect").value = saved.model;
  setKeyStatus(null);
}
function renderModelSelect() {
  const p = PROVIDERS.find(x => x.id === currentProviderId);
  document.getElementById("modelSelect").innerHTML = p.models.map(m => `<option value="${m.id}">${escapeHtml(m.label)}</option>`).join("");
}
function setKeyStatus(state, msg) {
  const el = document.getElementById("keyStatus");
  const dot = state === "ok" ? "ok" : state === "bad" ? "bad" : "";
  el.innerHTML = `<span class="dot ${dot}"></span><span>${msg || "Chưa kiểm tra"}</span>`;
}
function toggleKeyVisibility() {
  const inp = document.getElementById("keyInput");
  inp.type = inp.type === "password" ? "text" : "password";
}
function maskKey(k) {
  if (k.length <= 8) return "•".repeat(k.length);
  return k.slice(0, 4) + "…" + k.slice(-3);
}
function saveKey() {
  const key = document.getElementById("keyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  if (!key) { toast("Nhập API key trước đã"); return; }
  const all = getSavedKeys();
  all[currentProviderId] = { key, model, savedAt: Date.now() };
  setSavedKeys(all);
  renderKeyList();
  toast("Đã lưu key trên trình duyệt này");
}
function deleteKey(providerId) {
  const all = getSavedKeys();
  delete all[providerId];
  setSavedKeys(all);
  renderKeyList();
  if (providerId === currentProviderId) { document.getElementById("keyInput").value = ""; setKeyStatus(null); }
  toast("Đã xoá key");
}
function renderKeyList() {
  const all = getSavedKeys();
  const rows = PROVIDERS.filter(p => all[p.id]).map(p => {
    const s = all[p.id];
    const modelLabel = (p.models.find(m => m.id === s.model) || {}).label || s.model;
    return `<div class="keyEntry"><b>${p.name}<br><span style="font-weight:400;color:var(--muted);font-size:11.5px">${maskKey(s.key)} · ${escapeHtml(modelLabel)}</span></b>
      <button class="btn ghost btnSm" data-del="${p.id}">🗑️ Xoá</button></div>`;
  }).join("");
  document.getElementById("keyList").innerHTML = rows || `<p style="color:var(--muted);font-size:13px">Chưa có key nào được lưu.</p>`;
}
document.addEventListener("click", (e) => {
  const pb = e.target.closest("#providerRow .providerBtn");
  if (pb) { currentProviderId = pb.dataset.p; renderProviderRow(); return; }
  const del = e.target.closest("[data-del]");
  if (del) { deleteKey(del.dataset.del); return; }
});

/* ---- provider API calls (direct browser → provider, no middle server) ---- */
async function testGemini(key, model) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) throw new Error("HTTP " + res.status);
  return true;
}
async function testAnthropic(key, model) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model: model, max_tokens: 1, messages: [{ role: "user", content: "hi" }] })
  });
  if (!res.ok && res.status !== 400) throw new Error("HTTP " + res.status);
  if (res.status === 401) throw new Error("HTTP 401");
  return true;
}
async function testOpenAI(key, model) {
  const res = await fetch("https://api.openai.com/v1/models", { headers: { "Authorization": "Bearer " + key } });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return true;
}
async function callGemini(key, model, prompt) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  return j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "(không có phản hồi)";
}
async function callAnthropic(key, model, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({ model: model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  return j.content?.map(c => c.text).join("") || "(không có phản hồi)";
}
async function callOpenAI(key, model, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json", "Authorization": "Bearer " + key },
    body: JSON.stringify({ model: model, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const j = await res.json();
  return j.choices?.[0]?.message?.content || "(không có phản hồi)";
}
const CALLERS = { testGemini, testAnthropic, testOpenAI, callGemini, callAnthropic, callOpenAI };

async function testKey() {
  const key = document.getElementById("keyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  if (!key) { toast("Nhập API key trước đã"); return; }
  const p = PROVIDERS.find(x => x.id === currentProviderId);
  setKeyStatus(null, "Đang kiểm tra…");
  try {
    await CALLERS[p.testFn](key, model);
    setKeyStatus("ok", "Kết nối thành công");
  } catch (err) {
    setKeyStatus("bad", "Không kết nối được (" + err.message + ") — kiểm tra lại key, kết nối mạng, hoặc thử lại sau vài giây");
  }
}

/* ============================================================
   NỘP SẢN PHẨM HTML + AI CHẤM GÓP Ý
   Lưu bằng IndexedDB trên trình duyệt của người dùng.
   ============================================================ */
const DB_NAME = "cvaSubmissions", DB_STORE = "files";
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(DB_STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function dbAll() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.addedAt - a.addedAt));
    req.onerror = () => reject(req.error);
  });
}
async function dbPut(rec) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function dbDelete(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function setupDropZone() {
  const dz = document.getElementById("dropZone");
  const input = document.getElementById("fileInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });
}
async function handleFile(file) {
  if (!/\.(html?|HTML?)$/.test(file.name)) { toast("Chỉ chấp nhận file .html/.htm"); return; }
  if (file.size > 5 * 1024 * 1024) { toast("File vượt quá 5MB"); return; }
  const text = await file.text();
  const rec = { id: "sub_" + Date.now() + "_" + Math.random().toString(36).slice(2, 7), name: file.name, size: file.size, addedAt: Date.now(), content: text, reviewText: "", reviewAt: 0 };
  await dbPut(rec);
  toast("Đã lưu \"" + file.name + "\" trên trình duyệt này");
  renderSubmissions();
}
function currentReviewProvider() {
  const all = getSavedKeys();
  const withKey = PROVIDERS.find(p => all[p.id] && all[p.id].key);
  return withKey ? { provider: withKey, saved: all[withKey.id] } : null;
}
async function renderSubmissions() {
  const list = await dbAll();
  const el = document.getElementById("submissionList");
  if (!list.length) { el.innerHTML = `<p style="color:var(--muted);font-size:13px;margin-top:14px">Chưa có sản phẩm nào được nộp.</p>`; return; }
  el.innerHTML = list.map(r => `
    <div class="subCard" data-id="${r.id}">
      <div class="subCardTop">
        <div><b>${escapeHtml(r.name)}</b><div class="subMeta">${formatBytes(r.size)} · nộp lúc ${fmtDate(r.addedAt)}</div></div>
        <div class="subActions">
          <button class="btn secondary btnSm" data-act="preview">👁️ Xem trước</button>
          <button class="btn secondary btnSm" data-act="download">⬇️ Tải về</button>
          <button class="btn primary btnSm" data-act="review">🤖 AI chấm góp ý</button>
          <button class="btn ghost btnSm" data-act="delete">🗑️ Xoá</button>
        </div>
      </div>
      <div class="reviewArea">${r.reviewText ? renderReviewBox(r.reviewText, r.reviewAt) : ""}</div>
    </div>`).join("");
}
function renderReviewBox(text, at) {
  return `<div class="reviewBox"><div class="reviewScore">🤖 Nhận xét của AI · ${fmtDate(at)}</div>${escapeHtml(text)}</div>`;
}
document.addEventListener("click", async (e) => {
  const card = e.target.closest(".subCard"); if (!card) return;
  const id = card.dataset.id;
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  const list = await dbAll();
  const rec = list.find(r => r.id === id);
  if (act === "delete") { await dbDelete(id); toast("Đã xoá"); renderSubmissions(); return; }
  if (act === "download") {
    const blob = new Blob([rec.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = rec.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return;
  }
  if (act === "preview") {
    const blob = new Blob([rec.content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  if (act === "review") {
    const ctx = currentReviewProvider();
    if (!ctx) { toast("Hãy thêm API key ở Chặng 4 trước"); goToPage("c4-s2"); return; }
    const area = card.querySelector(".reviewArea");
    area.innerHTML = `<div class="reviewBox"><span class="spinner"></span> Đang gửi cho AI, vui lòng chờ…</div>`;
    const prompt = buildReviewPrompt(rec.content);
    try {
      const text = await CALLERS["call" + capitalize(ctx.provider.id)](ctx.saved.key, ctx.saved.model, prompt);
      rec.reviewText = text; rec.reviewAt = Date.now();
      await dbPut(rec);
      area.innerHTML = renderReviewBox(text, rec.reviewAt);
    } catch (err) {
      area.innerHTML = `<div class="reviewBox">⚠️ Không gọi được AI (${escapeHtml(err.message)}). Kiểm tra lại key ở Chặng 4 và kết nối mạng rồi thử lại.</div>`;
    }
  }
});
function capitalize(s) {
  if (s === "openai") return "OpenAI";
  if (s === "anthropic") return "Anthropic";
  if (s === "gemini") return "Gemini";
  return s;
}
function buildReviewPrompt(html) {
  const clipped = html.length > 6000 ? html.slice(0, 6000) + "\n...(đã cắt bớt do quá dài)..." : html;
  return `Bạn là chuyên gia sư phạm kiêm frontend developer, đang chấm một sản phẩm HTML do giáo viên THPT tự tạo bằng AI để dùng trong dạy học.
Hãy góp ý ngắn gọn, cụ thể, theo đúng cấu trúc sau bằng tiếng Việt:
1) SƯ PHẠM: nội dung có đúng, có rõ mục tiêu học tập, có phù hợp đối tượng học sinh không?
2) KỸ THUẬT: có lỗi rõ ràng nào khi đọc mã nguồn không (đáp án lộ, không responsive, thiếu kiểm tra input)?
3) AN TOÀN: có API key nào bị viết cứng trong mã không? Nếu có, cảnh báo ngay ở đầu.
4) ĐỀ XUẤT: tối đa 3 việc nên sửa trước khi phát cho học sinh.
Giữ câu trả lời dưới 200 từ, không dùng markdown, viết như đang góp ý trực tiếp cho đồng nghiệp.

Mã nguồn HTML cần chấm:
---
${clipped}
---`;
}

/* ---------------------------------------------------------- search overlay */
function openSearch() { document.getElementById("searchOverlay").classList.add("open"); setTimeout(() => document.getElementById("globalSearch").focus(), 50); }
function closeSearch() { document.getElementById("searchOverlay").classList.remove("open"); }
function globalFind() {
  const q = document.getElementById("globalSearch").value.toLowerCase().trim();
  const items = [
    ["Chặng 1 · Hiểu AI", "AI nào hợp việc gì, Skill hay Project", "c1-s1"],
    ["Chặng 2 · Viết prompt", "Công thức 6 phần, ngân hàng 16 prompt", "c2-s1"],
    ["Chặng 3 · Tạo sản phẩm", "HTML tương tác, Skill, 8 tình huống, mẫu tham khảo", "c3-s1"],
    ["8 tình huống thật", "Từ học liệu sẵn có đến công cụ dùng được", "c3-s3"],
    ["Nộp sản phẩm & AI chấm", "Tải lên file HTML, nhận góp ý từ AI", "c3-s6"],
    ["Chặng 4 · Chia sẻ & an toàn", "API key, 5 nguyên tắc, GitHub Pages", "c4-s1"],
    ["Thêm API key của bạn", "Gemini, Anthropic, OpenAI — chọn model", "c4-s2"],
    ["Tài liệu tải về", "3 PDF tập huấn và bộ Skill thực hành", "c4-s4"],
    ["FAQ", "An toàn dữ liệu, tài khoản dùng chung, kiểm thử", "c4-s5"]
  ];
  const r = items.filter(x => !q || (x[0] + " " + x[1]).toLowerCase().includes(q));
  document.getElementById("searchResults").innerHTML = r.map(x =>
    `<div class="searchResult"><button type="button" class="linkLikeBtn" data-page="${x[2]}">${x[0]}</button><div>${x[1]}</div></div>`).join("") || "<p>Không tìm thấy. Thử từ khóa khác.</p>";
}

/* ---------------------------------------------------------- boot */
function boot() {
  renderNav();
  renderJourneyCards();
  renderClaudeCards();
  renderAI();
  renderPromptTabs(); renderPrompts();
  renderSituationNav(); renderSituationDetail();
  renderSampleFilter(); renderSamples();
  initSubjects();
  renderResources();
  renderFaq();
  renderProviderRow(); renderKeyList();
  setupDropZone(); renderSubmissions();
  setupChDoneBoxes();
  renderJourneyProgress();

  initPages();
  document.getElementById("navBack").addEventListener("click", goBack);
  document.getElementById("navNext").addEventListener("click", goNext);
  document.getElementById("brandBtn").addEventListener("click", () => goToPage("home"));
  setupSwipe();
  handleHashChange();
}
document.addEventListener("DOMContentLoaded", boot);
