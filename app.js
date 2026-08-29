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

/* ----------------------------------------------------------- journey / progress
   Nguồn sự thật duy nhất là cvaStepDone — người dùng tick từng BƯỚC.
   Trạng thái của cả CHẶNG được suy ra: xong khi mọi bước của chặng đã tick. */
const STEP_KEY = "cvaStepDone";
function getStepDone() {
  try { return JSON.parse(localStorage.getItem(STEP_KEY) || "{}"); } catch (e) { return {}; }
}
function setStepDone(pageId, val) {
  const d = getStepDone();
  if (val) d[pageId] = true; else delete d[pageId];
  localStorage.setItem(STEP_KEY, JSON.stringify(d));
  renderJourneyProgress();
  renderStepCircles();
}
function getJourneyDone() {
  const steps = getStepDone();
  const out = {};
  JOURNEY.forEach(j => {
    const pages = PAGES.filter(p => p.chang === j.id);
    out[j.id] = pages.length > 0 && pages.every(p => steps[p.id]);
  });
  return out;
}
function renderJourneyProgress() {
  const done = getJourneyDone();
  const n = JOURNEY.filter(j => done[j.id]).length;
  document.getElementById("journeyFill").style.width = (n / JOURNEY.length * 100) + "%";
  document.getElementById("journeyPct").textContent = `${n}/${JOURNEY.length} chặng`;
  document.querySelectorAll(".stepPill").forEach(p => p.classList.toggle("done", !!done[p.dataset.ch]));
  const steps = getStepDone();
  document.querySelectorAll(".stepDoneBox").forEach(cb => { cb.checked = !!steps[cb.dataset.step]; });
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
    <button type="button" data-goto-home data-scroll-to="demo">⚡ Demo &amp; Thư viện dự án</button>
    <div class="grpLabel">Lộ trình 4 chặng</div>
    ${JOURNEY.map(j => `<button type="button" data-ch="${j.id}">${j.icon} ${j.n}. ${j.label}</button>`).join("")}
    <div class="grpLabel">Khác</div>
    <button type="button" data-page="c4-s4">📥 Tài liệu tải về</button>
    <button type="button" data-page="c4-s5">❓ FAQ</button>
  `;

  // footer chép tay 4 chặng thì mỗi lần đổi JOURNEY lại lệch — render luôn cho chắc
  document.getElementById("footerJourney").innerHTML =
    JOURNEY.map(j => `• Chặng ${j.n}: ${escapeHtml(j.label)}`).join("<br>");
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

/* ô tick "đã hoàn thành bước này" ở cuối mỗi page của chặng */
function setupStepDoneBoxes() {
  document.querySelectorAll(".stepDoneBox").forEach(cb => {
    cb.addEventListener("change", () => setStepDone(cb.dataset.step, cb.checked));
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
  const changed = oldIndex !== newIndex;
  const animate = oldIndex !== -1 && changed;
  pageEls.forEach((el, i) => {
    const isMover = animate && (i === oldIndex || i === newIndex);
    const state = i === newIndex ? "pg-active" : (i < newIndex ? "pg-behind" : "pg-ahead");
    setPagePosition(el, state, !isMover);
  });
  currentIndex = newIndex;
  // Chỉ cuộn về đầu khi THỰC SỰ sang trang khác. Cập nhật thanh điều hướng
  // (nhãn, vòng tròn) không bao giờ được đụng tới vị trí cuộn của người dùng.
  if (changed && pageEls[newIndex]) pageEls[newIndex].scrollTop = 0;
  updateChromeForCurrentPage();
}

/* các bước của chặng đang xem, kèm chỉ số trong PAGES */
function stepsOfCurrentChang() {
  const cur = PAGES[currentIndex];
  if (!cur || !cur.chang) return [];
  return PAGES.map((p, i) => ({ p, i })).filter(x => x.p.chang === cur.chang);
}

function renderStepCircles() {
  const el = document.getElementById("stepCircles");
  if (!el) return;
  const steps = stepsOfCurrentChang();
  if (!steps.length) { el.innerHTML = ""; return; }
  const done = getStepDone();
  el.innerHTML = steps.map((x, n) => {
    const cls = [done[x.p.id] ? "done" : "", x.i === currentIndex ? "on" : ""].filter(Boolean).join(" ");
    return `<button type="button" class="stepCircle ${cls}" data-idx="${x.i}"
      aria-label="Bước ${n + 1}: ${escapeHtml(x.p.label)}"${x.i === currentIndex ? ' aria-current="step"' : ""}>
      <span class="stepNum">${n + 1}</span><span class="stepTip">${escapeHtml(x.p.label)}</span>
    </button>`;
  }).join("");
}

function updateChromeForCurrentPage() {
  const cur = PAGES[currentIndex];
  document.querySelectorAll(".stepPill").forEach(p => p.classList.toggle("active", !!cur.chang && p.dataset.ch === cur.chang));
  document.getElementById("subnav").classList.toggle("sn-hidden", !cur.chang);

  document.getElementById("navBack").disabled = currentIndex === 0;
  const isLast = currentIndex === PAGES.length - 1;
  document.getElementById("navNext").textContent = isLast ? "🏠 Về trang chủ" : "Tiếp theo →";

  renderStepCircles();

  // nhãn "Chặng n / 4 · Bước x/y" tính từ DOM, không chép tay trong HTML nữa
  const auto = pageEls[currentIndex] && pageEls[currentIndex].querySelector(".stageLabel[data-auto]");
  if (auto && cur.chang) {
    const jr = JOURNEY.find(j => j.id === cur.chang);
    const steps = stepsOfCurrentChang();
    const pos = steps.findIndex(x => x.i === currentIndex) + 1;
    auto.textContent = `${jr.icon} Chặng ${jr.n} / ${JOURNEY.length} · Bước ${pos}/${steps.length}`;
  }
}

function handleHashChange() {
  const id = location.hash.replace("#", "") || "home";
  const idx = pageIndexById(id);
  renderStage(idx === -1 ? 0 : idx);
}
function setHash(id) {
  // Hash đã đúng rồi thì không làm gì — gọi lại handleHashChange() ở đây
  // chính là nguyên nhân bấm lại pill của chặng đang xem bị nhảy về đầu trang.
  if (("#" + id) !== location.hash) location.hash = id;
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
  if (gh) {
    goToPage("home"); closeDrawer();
    // mục drawer "Demo & Thư viện" vừa về trang chủ vừa cuộn tới khối demo
    const target = gh.dataset.scrollTo;
    if (target) requestAnimationFrame(() => scrollToSection(target));
    return;
  }
  const dp = e.target.closest("[data-page]");
  if (dp) { goToPage(dp.dataset.page); closeDrawer(); closeSearch(); return; }
  const dch = e.target.closest(".drawerNav [data-ch]");
  if (dch) { goToChang(dch.dataset.ch); closeDrawer(); return; }
  const sc = e.target.closest("[data-scroll-to]");
  if (sc) { scrollToSection(sc.dataset.scrollTo); return; }
  const circle = e.target.closest(".stepCircle");
  if (circle) { navigateToIndex(+circle.dataset.idx); return; }
});

function scrollToSection(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

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

/* ============================================================
   DEMO — BƯỚC 1: HỒ SƠ GIÁO VIÊN
   Nhớ trong localStorage để lần sau khỏi nhập lại; bước 2 và 3
   khoá cho tới khi đủ họ tên + lớp + tổ.
   ============================================================ */
const TEACHER_KEY = "cvaTeacher";

function getTeacher() {
  try { return JSON.parse(localStorage.getItem(TEACHER_KEY) || "{}"); } catch (e) { return {}; }
}
function teacherIsComplete(t) {
  return !!(t && t.name && t.className && t.to);
}

function initTeacherForm() {
  const nameEl = document.getElementById("teacherName");
  const classEl = document.getElementById("teacherClass");
  const toEl = document.getElementById("teacherTo");

  classEl.innerHTML = `<option value="">— Chọn lớp —</option>` + CLASSES.map(k =>
    `<option disabled>── Khối ${k.khoi} ──</option>` +
    k.lop.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join("")
  ).join("");

  // 13 tổ chuyên môn dùng chung nguồn với trang "Góc bộ môn"
  toEl.innerHTML = `<option value="">— Chọn tổ —</option>` +
    Object.keys(subjectIdeas).map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");

  const saved = getTeacher();
  nameEl.value = saved.name || "";
  classEl.value = saved.className || "";
  toEl.value = saved.to || "";

  [nameEl, classEl, toEl].forEach(el => {
    el.addEventListener("input", saveTeacher);
    el.addEventListener("change", saveTeacher);
  });
  applyTeacherGate();
}

function saveTeacher() {
  const t = {
    name: document.getElementById("teacherName").value.trim(),
    className: document.getElementById("teacherClass").value,
    to: document.getElementById("teacherTo").value
  };
  localStorage.setItem(TEACHER_KEY, JSON.stringify(t));
  applyTeacherGate();
}

function applyTeacherGate() {
  const t = getTeacher();
  const ok = teacherIsComplete(t);
  ["stepKey", "stepUpload"].forEach(id => {
    document.getElementById(id).setAttribute("aria-disabled", ok ? "false" : "true");
  });
  const hint = document.getElementById("teacherHint");
  hint.className = ok ? "demoHint" : "demoHint warn";
  hint.textContent = ok
    ? `✅ Chào ${t.name} — tổ ${t.to}, lớp ${t.className}. Mời thầy/cô sang bước 2.`
    : "↑ Nhập đủ họ tên, lớp dạy và tổ chuyên môn để mở bước 2 và 3.";
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

/* Hàng nút provider chỉ dựng MỘT lần. Đổi provider sau đó chỉ đổi class +
   nội dung ô hint/model — không ghi đè innerHTML cả khối, vì làm vậy sẽ
   xoá trắng ô key đang gõ và làm trang giật về đầu. */
function renderProviderRow() {
  document.getElementById("providerRow").innerHTML = PROVIDERS.map(p =>
    `<button class="providerBtn" data-p="${p.id}">${escapeHtml(p.name)}</button>`).join("");
  applyProvider();
}
function applyProvider() {
  const p = PROVIDERS.find(x => x.id === currentProviderId);
  document.querySelectorAll("#providerRow .providerBtn").forEach(b =>
    b.classList.toggle("active", b.dataset.p === currentProviderId));
  document.getElementById("providerHint").innerHTML =
    `${escapeHtml(p.tagline)} · <a href="${escapeHtml(p.keyLink)}" target="_blank" rel="noopener">${escapeHtml(p.keyHint)} ↗</a>`;
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
/* chỉ đổi class + text của 2 phần tử có sẵn, chiều cao không đổi */
function setKeyStatus(state, msg) {
  const el = document.getElementById("keyStatus");
  el.querySelector(".dot").className = "dot " + (state === "ok" ? "ok" : state === "bad" ? "bad" : "");
  el.querySelector(".msg").textContent = msg || "Chưa kiểm tra";
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
  if (pb) { currentProviderId = pb.dataset.p; applyProvider(); return; }
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
/* Store "projects" (v2) dùng lược đồ mới — teacherName/projectName/html.
   Store "files" của bản cũ có lược đồ khác nên bỏ hẳn, không đọc tới. */
const DB_NAME = "cvaSubmissions", DB_STORE = "projects";
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "id" });
      if (db.objectStoreNames.contains("files")) db.deleteObjectStore("files");
    };
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
/* ---- lớp bọc lưu trữ: Worker nếu có cấu hình, không thì IndexedDB ---- */
function galleryIsShared() { return typeof WORKER_URL === "string" && WORKER_URL.length > 0; }

async function galleryList() {
  if (!galleryIsShared()) return dbAll();
  const res = await fetch(WORKER_URL + "/list");
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}
async function gallerySubmit(rec) {
  if (!galleryIsShared()) { await dbPut(rec); return rec; }
  const res = await fetch(WORKER_URL + "/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(rec)
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || "HTTP " + res.status);
  }
  return res.json();
}
async function galleryFetchFile(id) {
  if (!galleryIsShared()) {
    const rec = (await dbAll()).find(r => r.id === id);
    return rec ? rec.html : null;
  }
  const res = await fetch(WORKER_URL + "/file?id=" + encodeURIComponent(id));
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

/* ---- bước 3: chọn file, nhờ AI nhận xét, nộp vào thư viện ---- */
let pickedDoc = null;   // { name, size, html }
let pickedReview = "";

function setupDropZone() {
  const dz = document.getElementById("dropZone");
  const input = document.getElementById("fileInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
  input.addEventListener("change", () => { if (input.files[0]) handleFile(input.files[0]); input.value = ""; });
  ["dragenter", "dragover"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", e => { const f = e.dataTransfer.files[0]; if (f) handleFile(f); });

  document.getElementById("btnReview").addEventListener("click", runReview);
  document.getElementById("btnSubmit").addEventListener("click", submitToGallery);
  document.getElementById("btnRefreshGallery").addEventListener("click", () => renderGallery());
}

async function handleFile(file) {
  if (!/\.html?$/i.test(file.name)) { toast("Chỉ chấp nhận file .html/.htm"); return; }
  if (file.size > 2 * 1024 * 1024) { toast("File vượt quá 2MB"); return; }
  pickedDoc = { name: file.name, size: file.size, html: await file.text() };
  pickedReview = "";

  const info = document.getElementById("pickedFile");
  info.hidden = false;
  info.textContent = `📄 ${file.name} · ${formatBytes(file.size)}`;
  document.getElementById("demoActions").hidden = false;
  document.getElementById("demoReview").innerHTML = "";

  // gợi ý tên dự án từ tên file nếu giáo viên chưa đặt
  const nameEl = document.getElementById("projectName");
  if (!nameEl.value.trim()) nameEl.value = file.name.replace(/\.html?$/i, "").replace(/[-_]+/g, " ");
}

function currentReviewProvider() {
  const all = getSavedKeys();
  const withKey = PROVIDERS.find(p => all[p.id] && all[p.id].key);
  return withKey ? { provider: withKey, saved: all[withKey.id] } : null;
}

async function runReview() {
  if (!pickedDoc) { toast("Chọn file HTML trước đã"); return; }
  const ctx = currentReviewProvider();
  if (!ctx) { toast("Lưu API key ở bước 2 trước đã"); scrollToSection("demo"); return; }

  const area = document.getElementById("demoReview");
  area.innerHTML = `<div class="reviewBox"><span class="spinner"></span> Đang gửi cho AI, vui lòng chờ…</div>`;
  try {
    const text = await CALLERS["call" + capitalize(ctx.provider.id)](
      ctx.saved.key, ctx.saved.model, buildReviewPrompt(pickedDoc.html));
    pickedReview = text;
    area.innerHTML = renderReviewBox(text, Date.now());
  } catch (err) {
    area.innerHTML = `<div class="reviewBox">⚠️ Không gọi được AI (${escapeHtml(err.message)}). Kiểm tra lại key ở bước 2 và kết nối mạng rồi thử lại.</div>`;
  }
}

async function submitToGallery() {
  const t = getTeacher();
  if (!teacherIsComplete(t)) { toast("Điền thông tin ở bước 1 trước đã"); scrollToSection("demo"); return; }
  if (!pickedDoc) { toast("Chọn file HTML trước đã"); return; }
  const projectName = document.getElementById("projectName").value.trim();
  if (!projectName) { toast("Đặt tên cho dự án trước đã"); return; }

  const btn = document.getElementById("btnSubmit");
  btn.disabled = true;
  try {
    await gallerySubmit({
      id: "p_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      addedAt: Date.now(),
      teacherName: t.name, className: t.className, to: t.to,
      projectName, fileName: pickedDoc.name, size: pickedDoc.size,
      html: pickedDoc.html, reviewText: pickedReview
    });
    toast(galleryIsShared() ? "Đã nộp vào thư viện chung" : "Đã lưu trên máy này");
    await renderGallery();
    scrollToSection("gallery");
  } catch (err) {
    toast("Nộp không thành công: " + err.message);
  } finally {
    btn.disabled = false;
  }
}

function renderReviewBox(text, at) {
  return `<div class="reviewBox"><div class="reviewScore">🤖 Nhận xét của AI · ${fmtDate(at)}</div>${escapeHtml(text)}</div>`;
}

/* ---- thư viện dự án ---- */
let galleryCache = {};   // id -> bản ghi, để mở/đóng nhận xét không phải gọi lại mạng

async function renderGallery() {
  const el = document.getElementById("galleryList");
  const note = document.getElementById("galleryNote");
  note.textContent = galleryIsShared()
    ? "Bài nộp sau nằm trên đầu. Bấm để xem trước sản phẩm hoặc đọc nhận xét của AI."
    : "Chưa cấu hình thư viện chung — bài nộp chỉ lưu trên máy này (xem DEPLOY-WORKER.md).";

  el.innerHTML = `<div class="galleryEmpty"><span class="spinner"></span> Đang tải…</div>`;
  let list;
  try {
    list = await galleryList();
  } catch (err) {
    el.innerHTML = `<div class="galleryEmpty">⚠️ Không tải được thư viện (${escapeHtml(err.message)}).</div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="galleryEmpty">Chưa có dự án nào được nộp. Thầy/cô nộp bài đầu tiên nhé!</div>`;
    return;
  }
  el.innerHTML = list.map(r => `
    <div class="projCard" data-id="${escapeHtml(r.id)}">
      <div class="projWho">${escapeHtml(r.teacherName)} · ${escapeHtml(r.className || "—")}</div>
      <div class="projName">${escapeHtml(r.projectName)}</div>
      <div class="projTags">🏷️ Tổ ${escapeHtml(r.to || "—")} · ${fmtDate(r.addedAt)}</div>
      <div class="projActions">
        <button class="btn secondary btnSm" data-act="preview">👁️ Xem trước</button>
        <button class="btn primary btnSm" data-act="review" ${r.reviewText ? "" : "disabled"}
          title="${r.reviewText ? "Xem nhận xét của AI" : "Bài này chưa có nhận xét AI"}">🤖 Xem đánh giá AI</button>
      </div>
      <div class="reviewArea"></div>
    </div>`).join("");
  galleryCache = Object.fromEntries(list.map(r => [r.id, r]));
}

document.addEventListener("click", async (e) => {
  const card = e.target.closest(".projCard"); if (!card) return;
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  const id = card.dataset.id;

  if (act === "preview") {
    try {
      const html = await galleryFetchFile(id);
      if (html == null) { toast("Không tìm thấy file"); return; }
      // mở qua blob: — mã của người khác chạy ở origin cô lập, không chung với trang này
      const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { toast("Không mở được: " + err.message); }
    return;
  }
  if (act === "review") {
    const area = card.querySelector(".reviewArea");
    if (area.innerHTML) { area.innerHTML = ""; return; }   // bấm lần nữa để đóng
    const rec = galleryCache[id];
    area.innerHTML = renderReviewBox(rec.reviewText, rec.addedAt);
  }
});

function capitalize(s) {
  if (s === "openai") return "OpenAI";
  if (s === "anthropic") return "Anthropic";
  if (s === "gemini") return "Gemini";
  return s;
}

/* TODO (nhờ thầy/cô viết): hai mục 1) và 2) dưới đây quyết định AI sẽ soi vào
   đâu cho MỌI bài nộp — đó là chuyên môn sư phạm, không phải chuyện kỹ thuật.
   Cụ thể cần bổ sung:
     · Mục 1) NỘI DUNG — với học sinh chuyên, thế nào là "độ khó phù hợp"?
       Có tiêu chí riêng nào của tổ chuyên môn cần AI kiểm tra không?
     · Mục 2) TRÌNH BÀY — một học liệu HTML "trình bày tốt" trên lớp là như
       thế nào? (chiếu máy chiếu? học sinh tự mở trên điện thoại? in ra giấy?)
   Viết thẳng vào chuỗi bên dưới, càng cụ thể thì nhận xét càng dùng được. */
function buildReviewPrompt(html) {
  const clipped = html.length > 6000 ? html.slice(0, 6000) + "\n...(đã cắt bớt do quá dài)..." : html;
  return `Bạn là chuyên gia sư phạm kiêm frontend developer, đang nhận xét một sản phẩm HTML do giáo viên THPT tự tạo bằng AI để dùng trong dạy học.
Hãy góp ý ngắn gọn, cụ thể, theo đúng 4 mục sau bằng tiếng Việt:

1) NỘI DUNG: kiến thức có chính xác không? Mục tiêu học tập có rõ không? Độ khó có hợp đối tượng học sinh không? Đáp án có bị lộ trong mã nguồn không?
2) TRÌNH BÀY: bố cục có dễ theo dõi không? Cỡ chữ và độ tương phản có đọc được không? Có dùng được trên điện thoại không? Thông báo/hướng dẫn cho học sinh có dễ hiểu không?
3) CẢNH BÁO: có API key nào bị viết cứng trong mã không? Nếu có, nói ngay ở dòng đầu tiên.
4) NÊN SỬA: tối đa 3 việc cụ thể cần làm trước khi phát cho học sinh.

Giữ câu trả lời dưới 250 từ, không dùng markdown, viết như đang góp ý trực tiếp cho đồng nghiệp.

Mã nguồn HTML cần nhận xét:
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
    ["Demo · API key, nộp bài, AI nhận xét", "Cấu hình Gemini/Anthropic/OpenAI, tải file HTML lên, nhận góp ý", "home"],
    ["Thư viện dự án đã nộp", "Xem trước sản phẩm và đánh giá AI của đồng nghiệp", "home"],
    ["Chặng 1 · Hiểu AI", "AI nào hợp việc gì, Skill hay Project", "c1-s1"],
    ["Chặng 2 · Viết prompt", "Công thức 6 phần, ngân hàng 16 prompt", "c2-s1"],
    ["Chặng 3 · Tạo sản phẩm", "HTML tương tác, Skill, 8 tình huống, mẫu tham khảo", "c3-s1"],
    ["8 tình huống thật", "Từ học liệu sẵn có đến công cụ dùng được", "c3-s3"],
    ["Chặng 4 · Chia sẻ & an toàn", "API key, 5 nguyên tắc, GitHub Pages", "c4-s1"],
    ["Tài liệu tải về", "3 PDF tập huấn và bộ Skill thực hành", "c4-s4"],
    ["FAQ", "An toàn dữ liệu, tài khoản dùng chung, kiểm thử", "c4-s5"]
  ];
  const r = items.filter(x => !q || (x[0] + " " + x[1]).toLowerCase().includes(q));
  document.getElementById("searchResults").innerHTML = r.map(x =>
    `<div class="searchResult"><button type="button" class="linkLikeBtn" data-page="${x[2]}">${x[0]}</button><div>${x[1]}</div></div>`).join("") || "<p>Không tìm thấy. Thử từ khóa khác.</p>";
}

/* ---------------------------------------------------------- boot */
function boot() {
  // PAGES phải sẵn sàng trước: tiến độ theo chặng được suy ra từ danh sách bước,
  // mà danh sách bước lại đọc từ chính DOM các .page.
  initPages();

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

  initTeacherForm();
  renderProviderRow(); renderKeyList();
  setupDropZone();
  renderGallery();

  setupStepDoneBoxes();
  renderJourneyProgress();

  document.getElementById("navBack").addEventListener("click", goBack);
  document.getElementById("navNext").addEventListener("click", goNext);
  document.getElementById("brandBtn").addEventListener("click", () => goToPage("home"));
  setupSwipe();
  handleHashChange();
}
document.addEventListener("DOMContentLoaded", boot);
