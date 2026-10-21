/* ============================================================
   E-Borrow — ตรรกะทั้งหมดของเว็บ (JavaScript ล้วน ไม่ใช้ library)

   แนวคิดใหญ่ 3 ข้อ อ่านก่อนแก้โค้ด:

   1) "ฐานข้อมูล" ของเวอร์ชันทดลองนี้คือ localStorage
      (พื้นที่เก็บข้อมูลเล็ก ๆ ในเบราว์เซอร์ของแต่ละเครื่อง)
      ข้อมูลจะอยู่ถาวรจนกว่าจะล้างเบราว์เซอร์ แต่ "ไม่แชร์ข้ามเครื่อง"
      → ตอนใช้งานจริงหลายเครื่อง ค่อยเปลี่ยนไปใช้ database จริง
        เช่น Supabase / Firebase โดยแก้แค่ฟังก์ชัน loadRecords/saveRecords

   2) รายการยืม 1 แถว = object 1 ตัว มี "status" 3 ขั้น:
        "borrowed"  = ยืมอยู่ (ยังไม่คืน)
        "returning" = ผู้ยืมกด "ส่งคืน" แล้ว รอเจ้าของกด "รับคืน"
        "returned"  = เจ้าของกด "รับคืน" แล้ว → จบรายการ
      (ตรงตามภาพร่าง: ต้องกดส่งคืน ก่อนจะรับคืนได้)

   3) แต่ละ "หน้า" คือ <section> ใน index.html
      ฟังก์ชัน goto("ชื่อหน้า") จะเปลี่ยน #hash แล้ว route() จะแสดงหน้านั้น
      (ใช้ hash เพื่อให้ปุ่ม Back ของมือถือ/เบราว์เซอร์พากลับหน้าก่อนหน้าได้จริง)

   การปรับ UX รอบนี้ (อิงพฤติกรรมผู้ใช้):
   - หน้า Home บอกงานที่ "ต้องทำตอนนี้" เป็นตัวเลข แตะแล้วไปจัดการได้ทันที
   - ฟอร์มยืมจำ ward ล่าสุด + เสนอของที่ยืมบ่อย + ปุ่ม +/− จำนวน (พิมพ์น้อยลง)
   - รายการค้างเป็นการ์ด + แถบความคืบหน้า + ปุ่มทำทั้งหมด + เลิกทำได้ (Undo)
   - ล็อกอินค้างไว้ในแท็บเดียวกัน (รีเฟรชแล้วไม่หลุด) และจำรหัสพนักงานล่าสุด
   ============================================================ */

/* ------------------------------------------------------------
   ส่วนที่ 1 : ข้อมูลตั้งต้น (แก้ตรงนี้ให้ตรงกับโรงพยาบาลจริง)
   ------------------------------------------------------------ */

// รายชื่อหน่วยงาน / ward ทั้งหมด — เพิ่มหรือแก้ชื่อได้เลย
const WARDS = ["สงฆ์ 1", "สงฆ์ 2", "ENT 1", "ENT 2", "โรคปอด"];

// บัญชีผู้ใช้ตัวอย่าง: รหัสพนักงาน (OT/N + เลข 7 หลัก) → ชื่อ + ward
// ระบบจริงควรดึงจากฐานข้อมูลบุคลากร แต่ตอนนี้จำลองไว้ก่อน
const USERS = {
  "OT1234567": { name: "คุณสมชาย ใจดี",   ward: "สงฆ์ 1" },
  "OT7654321": { name: "คุณสมหญิง รักงาน", ward: "สงฆ์ 2" },
  "N1111111":  { name: "พยาบาลวิภา",      ward: "ENT 1"  },
  "N2222222":  { name: "พยาบาลอรทัย",     ward: "โรคปอด" },
};
const PASSWORD = "1234"; // รหัสผ่านกลางสำหรับทดลอง (ระบบจริงต้องทำ auth จริงจัง)

// เหตุผลที่ใช้บ่อย (แสดงเป็นปุ่มให้แตะ แทนการพิมพ์)
const REASONS = ["ของหมด", "เคสด่วน", "สต๊อกไม่พอ", "เครื่องเสีย"];

// ยืมเกินกี่วันถึงขึ้นเตือนสีส้ม / แดง
const LATE_DAYS = 7;
const VERY_LATE_DAYS = 14;

/* ---------- ตัวช่วยเรื่องวันที่ ---------- */
// วันที่แบบ "2026-08-21" ตามเวลาเครื่อง (ไม่ใช้ toISOString เพราะเลื่อนเป็นเวลา UTC)
function localISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}
// ผ่านมากี่วันแล้วนับจากวันที่ iso
function daysSince(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const then = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - then) / 86400000);
}
function shortThaiDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
}

// ข้อมูลตัวอย่างตามภาพร่าง เพื่อให้เปิดมาแล้วเห็นรายการเลย (วันที่อิงจากวันนี้ จะได้เห็นตัวอย่างเตือนเกินกำหนด)
const SEED_RECORDS = [
  { id: 1, borrowerName: "คุณสมชาย ใจดี", borrowerWard: "สงฆ์ 1", fromWard: "ENT 1",
    item: "Mobile Ven", qty: 1, reason: "ของหมด", status: "borrowed", date: daysAgoISO(3) },
  { id: 2, borrowerName: "คุณสมชาย ใจดี", borrowerWard: "สงฆ์ 1", fromWard: "ENT 2",
    item: "NSS 100 mL", qty: 1, reason: "เคสด่วน", status: "borrowed", date: daysAgoISO(1) },
  { id: 3, borrowerName: "พยาบาลอรทัย", borrowerWard: "โรคปอด", fromWard: "สงฆ์ 1",
    item: "NSS 1000 mL", qty: 5, reason: "สต๊อกไม่พอ", status: "returning", date: daysAgoISO(6) },
  { id: 4, borrowerName: "พยาบาลอรทัย", borrowerWard: "โรคปอด", fromWard: "สงฆ์ 1",
    item: "NSS 100 mL", qty: 10, reason: "", status: "borrowed", date: daysAgoISO(9) },
  { id: 5, borrowerName: "คุณสมหญิง รักงาน", borrowerWard: "สงฆ์ 2", fromWard: "สงฆ์ 1",
    item: "High flow", qty: 1, reason: "เครื่องเสีย", status: "borrowed", date: daysAgoISO(16) },
];

/* ------------------------------------------------------------
   ส่วนที่ 2 : จัดการ "ฐานข้อมูล" (localStorage)
   ------------------------------------------------------------ */

const DB_KEY = "eborrow_records";        // ชื่อกล่องที่ใช้เก็บข้อมูลใน localStorage
const SESSION_KEY = "eborrow_session";   // จำว่าล็อกอินด้วยรหัสอะไร (เฉพาะแท็บนี้)
const LAST_USER_KEY = "eborrow_lastUser"; // จำรหัสพนักงานล่าสุดไว้กรอกให้
const LAST_FROM_KEY = "eborrow_lastFrom"; // จำ ward ที่ยืมล่าสุด

// อ่านรายการทั้งหมดออกมาเป็น array (ถ้ายังไม่เคยมี → ใส่ข้อมูลตัวอย่างให้)
function loadRecords() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) {
    saveRecords(SEED_RECORDS);
    return [...SEED_RECORDS];
  }
  return JSON.parse(raw); // แปลงข้อความ JSON กลับเป็น array ของ object
}

// เขียน array ทั้งก้อนกลับลง localStorage (ต้องแปลงเป็นข้อความก่อน)
function saveRecords(records) {
  localStorage.setItem(DB_KEY, JSON.stringify(records));
}

/* ------------------------------------------------------------
   ส่วนที่ 3 : สถานะของแอป + ตัวช่วยสั้น ๆ
   ------------------------------------------------------------ */

let currentUser = null;      // เก็บข้อมูลคนที่ล็อกอินอยู่ { id, name, ward }
let currentPage = "login";   // ชื่อหน้าที่เปิดอยู่
let pendingTabPref = null;   // แท็บที่ต้องการในหน้า "รายการค้าง" (null = ให้ระบบเลือกให้)
let dashFilter = "all";      // ตัวกรองสถานะในตาราง Dashboard

// ตัวย่อ: $("id") = หา element จาก id (สั้นกว่า document.getElementById)
const $ = (id) => document.getElementById(id);

// ป้องกันข้อความที่ผู้ใช้พิมพ์ (เช่นชื่อของ) ไปปนกับโค้ด HTML
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ไอคอน SVG จาก sprite ใน index.html
const icon = (name) => `<svg class="ic" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// ตัวอักษรย่อบนรูปโปรไฟล์ (ตัดคำนำหน้าชื่อออก)
function initialOf(name) {
  return (name || "?").replace(/^(คุณ|พยาบาล|นาย|นางสาว|นาง)/, "").trim().charAt(0) || "?";
}

// ป้ายสถานะ (HTML) สำหรับใช้ในรายการ
function statusBadge(status) {
  const map = {
    borrowed:  ["borrowed",  "ยืมอยู่"],
    returning: ["returning", "ส่งคืนแล้ว รอรับคืน"],
    returned:  ["returned",  "คืนเรียบร้อย"],
  };
  const [cls, text] = map[status];
  return `<span class="status ${cls}">${text}</span>`;
}

/* ---------- แจ้งเตือนชั่วคราว (Toast) พร้อมปุ่ม "เลิกทำ" ---------- */
let toastTimer = null;
function showToast(message, { label, onAction, duration = 6000 } = {}) {
  clearTimeout(toastTimer);
  $("toast-msg").textContent = message;
  const btn = $("toast-action");
  if (label && onAction) {
    btn.textContent = label;
    btn.classList.remove("hidden");
    btn.onclick = () => { hideToast(); onAction(); };
  } else {
    btn.classList.add("hidden");
    btn.onclick = null;
  }
  const t = $("toast");
  t.classList.remove("hidden");
  // เริ่มแอนิเมชันใหม่ทุกครั้ง
  t.style.animation = "none"; void t.offsetWidth; t.style.animation = "";
  toastTimer = setTimeout(hideToast, duration);
}
function hideToast() { $("toast").classList.add("hidden"); }

/* ------------------------------------------------------------
   ส่วนที่ 4 : การสลับหน้า (Routing ด้วย #hash)
   ------------------------------------------------------------ */

const APP_PAGES = ["menu", "borrow", "pending", "dashboard"];
const PAGE_TITLES = {
  login: "เข้าสู่ระบบ", menu: "หน้าหลัก", borrow: "ยืมของ",
  pending: "รายการค้าง", dashboard: "Dashboard",
};

// สั่งไปหน้าอื่น: goto("page-borrow") → เปลี่ยน #hash แล้ว route() ทำงานต่อ
function goto(pageId) {
  const name = pageId.replace(/^page-/, "");
  if (location.hash === "#" + name) route();
  else location.hash = name;
}

// อ่าน #hash แล้วตัดสินใจว่าจะแสดงหน้าไหน (ยังไม่ล็อกอิน → บังคับหน้า login)
function route() {
  const name = location.hash.slice(1);
  if (!currentUser) return showPage("login");
  showPage(APP_PAGES.includes(name) ? name : "menu");
}

function showPage(name) {
  currentPage = name;
  document.querySelectorAll(".page").forEach((p) => p.classList.add("hidden"));
  $("popup").classList.add("hidden");
  hideToast();

  const loggedIn = name !== "login";
  $("app").classList.toggle("hidden", !loggedIn);
  $("page-" + name).classList.remove("hidden");
  document.title = `${PAGE_TITLES[name]} | E-Borrow`;

  document.querySelectorAll(".nav-item").forEach((n) =>
    n.classList.toggle("active", n.dataset.goto === "page-" + name)
  );

  if (loggedIn) renderCurrent();
  else prepareLogin();
  window.scrollTo(0, 0);
}

// บางหน้าต้องเตรียมข้อมูลใหม่ทุกครั้งที่เปิด
function renderCurrent() {
  updateBadges();
  if (currentPage === "menu")      renderHome();
  if (currentPage === "borrow")    setupBorrowForm();
  if (currentPage === "pending")   renderPending();
  if (currentPage === "dashboard") renderDashboard();
}

// ทุกปุ่มที่มี data-goto="ชื่อหน้า" จะพาไปหน้านั้นอัตโนมัติ
// (ใส่ data-tab="mine|theirs" เพื่อเลือกแท็บในหน้ารายการค้าง)
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-goto]");
  if (!btn) return;
  pendingTabPref = btn.dataset.tab || null;
  goto(btn.dataset.goto);
});
window.addEventListener("hashchange", route);

// จำนวน "งานที่ต้องทำ" แสดงเป็นเลขแดงที่เมนู รายการค้าง
function todoCounts(records = loadRecords()) {
  const w = currentUser.ward;
  return {
    mineAll:    records.filter((r) => r.borrowerWard === w && r.status !== "returned"),
    theirsAll:  records.filter((r) => r.fromWard === w && r.status !== "returned"),
    needReturn: records.filter((r) => r.borrowerWard === w && r.status === "borrowed"),
    needReceive: records.filter((r) => r.fromWard === w && r.status === "returning"),
  };
}
function updateBadges() {
  if (!currentUser) return;
  const c = todoCounts();
  const total = c.needReturn.length + c.needReceive.length;
  document.querySelectorAll(".nav-badge").forEach((b) => {
    b.textContent = total > 9 ? "9+" : total;
    b.classList.toggle("hidden", total === 0);
  });
}

/* ------------------------------------------------------------
   ส่วนที่ 5 : ล็อกอิน / ออกจากระบบ
   ------------------------------------------------------------ */

function prepareLogin() {
  $("login-user").value = localStorage.getItem(LAST_USER_KEY) || "";
  $("login-pw").value = "";
  $("login-error").classList.add("hidden");
  checkIdFormat();
}

// แสดงเครื่องหมายถูกเมื่อรหัสพนักงานพิมพ์ครบถูกรูปแบบ (ให้ผู้ใช้รู้ตัวก่อนกดเข้าระบบ)
function checkIdFormat() {
  const ok = /^(OT|N)\d{7}$/.test($("login-user").value.trim().toUpperCase());
  $("login-user-ok").classList.toggle("hidden", !ok);
}
$("login-user").addEventListener("input", checkIdFormat);

// ปุ่มบัญชีทดลอง: แตะแล้วกรอกให้เลย
$("demo-accounts").innerHTML = Object.entries(USERS).map(([id, u]) => `
  <button type="button" class="demo-btn" data-demo="${id}">
    <strong>${esc(u.name)}</strong><small>${esc(u.ward)} · ${id}</small>
  </button>`).join("");
$("demo-accounts").addEventListener("click", (e) => {
  const b = e.target.closest("[data-demo]");
  if (!b) return;
  $("login-user").value = b.dataset.demo;
  $("login-pw").value = PASSWORD;
  checkIdFormat();
  $("btn-login").focus();
});

// ปุ่มดู/ซ่อนรหัสผ่าน
$("btn-toggle-pw").addEventListener("click", () => {
  const pw = $("login-pw");
  const show = pw.type === "password";
  pw.type = show ? "text" : "password";
  $("btn-toggle-pw").setAttribute("aria-label", show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน");
  $("btn-toggle-pw").innerHTML = icon(show ? "eye-off" : "eye");
});

function loginError(msg) {
  const err = $("login-error");
  err.textContent = msg;
  err.classList.remove("hidden", "shake");
  void err.offsetWidth; err.classList.add("shake");
}

$("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const user = $("login-user").value.trim().toUpperCase();
  const pw   = $("login-pw").value;

  // เช็ครูปแบบรหัส: ขึ้นต้น OT หรือ N ตามด้วยเลข 7 หลัก
  // (regex = "แม่แบบข้อความ" ใช้ตรวจว่าข้อความหน้าตาถูกต้องไหม)
  if (!/^(OT|N)\d{7}$/.test(user)) {
    loginError("รูปแบบรหัสไม่ถูกต้อง ต้องเป็น OT หรือ N ตามด้วยเลข 7 หลัก");
    $("login-user").focus();
    return;
  }
  if (!USERS[user] || pw !== PASSWORD) {
    loginError("ไม่พบผู้ใช้ หรือรหัสผ่านไม่ถูกต้อง (แตะบัญชีทดลองด้านล่างเพื่อกรอกให้ได้)");
    return;
  }
  startSession(user);
  goto("page-menu");
});

// เริ่มเซสชัน: จำผู้ใช้ + เติมชื่อ/ward ในทุกจุดที่แสดงผู้ใช้
function startSession(id) {
  currentUser = { id, ...USERS[id] };
  sessionStorage.setItem(SESSION_KEY, id);
  localStorage.setItem(LAST_USER_KEY, id);
  document.querySelectorAll(".js-user-name").forEach((el) => (el.textContent = currentUser.name));
  document.querySelectorAll(".js-user-ward").forEach((el) => (el.textContent = currentUser.ward));
  document.querySelectorAll(".js-avatar").forEach((el) => (el.textContent = initialOf(currentUser.name)));
}

document.querySelectorAll(".js-logout").forEach((btn) =>
  btn.addEventListener("click", () => {
    currentUser = null;
    sessionStorage.removeItem(SESSION_KEY);
    history.replaceState(null, "", location.pathname + location.search);
    route();
  })
);

/* ------------------------------------------------------------
   ส่วนที่ 6 : หน้า Home — "ตอนนี้ต้องทำอะไร"
   ------------------------------------------------------------ */

function renderHome() {
  // คำทักทายตามช่วงเวลา + วันที่แบบไทย
  const h = new Date().getHours();
  const greet = h < 12 ? "สวัสดีตอนเช้า" : h < 17 ? "สวัสดีตอนบ่าย" : "สวัสดีตอนเย็น";
  $("home-greeting").textContent = `${greet}, ${currentUser.name}`;
  $("home-date").textContent = new Date().toLocaleDateString("th-TH", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const records = loadRecords();
  const c = todoCounts(records);

  const setTile = (tileId, numId, subId, n, doneText, todoText) => {
    $(numId).textContent = n;
    $(tileId).classList.toggle("has-todo", n > 0);
    $(subId).textContent = n > 0 ? todoText : doneText;
  };
  setTile("tile-return", "todo-return-num", "todo-return-sub", c.needReturn.length,
          "ไม่มีของค้างคืน ✓", "ของที่ ward เรายืมมา — แตะเพื่อส่งคืน");
  setTile("tile-receive", "todo-receive-num", "todo-receive-sub", c.needReceive.length,
          "ไม่มีของรอรับคืน ✓", "ward อื่นนำมาคืนแล้ว — แตะเพื่อรับคืน");

  // ความเคลื่อนไหวล่าสุดที่เกี่ยวกับ ward เรา
  const w = currentUser.ward;
  const recent = records
    .filter((r) => r.borrowerWard === w || r.fromWard === w)
    .sort((a, b) => b.id - a.id)
    .slice(0, 4);

  $("home-recent").innerHTML = recent.length === 0
    ? `<div class="recent-empty">ยังไม่มีรายการยืม–คืนของ ward นี้</div>`
    : recent.map((r) => {
        const mine = r.borrowerWard === w;
        const sub = mine ? `เรายืมจาก ${esc(r.fromWard)}` : `${esc(r.borrowerWard)} ยืมไป`;
        return `
          <button class="recent-row" data-goto="page-pending" data-tab="${mine ? "mine" : "theirs"}">
            <span class="recent-ic">${icon(mine ? "arrow" : "box")}</span>
            <span class="recent-main">
              <strong>${esc(r.item)} × ${r.qty}</strong>
              <small>${sub} · ${shortThaiDate(r.date)}</small>
            </span>
            ${statusBadge(r.status)}
          </button>`;
      }).join("");
}

/* ------------------------------------------------------------
   ส่วนที่ 7 : หน้า "ยืมของ"
   ------------------------------------------------------------ */

// ชื่อของที่เคยมีในระบบ เรียงตามความถี่ (ของ ward ตัวเองมาก่อน) — ใช้ทำปุ่มลัด + คำแนะนำตอนพิมพ์
function knownItems() {
  const records = loadRecords();
  const score = {};
  records.forEach((r) => {
    const key = r.item.trim();
    score[key] = (score[key] || 0) + (r.borrowerWard === currentUser.ward ? 3 : 1);
  });
  return Object.entries(score).sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

// เตรียมฟอร์มทุกครั้งที่เปิดหน้า: เติมชื่อ/ward อัตโนมัติ + ล้างค่าเดิม
function setupBorrowForm() {
  $("borrow-name").textContent = currentUser.name; // Autofill ตามภาพร่าง
  $("borrow-ward").textContent = currentUser.ward;
  $("borrow-reason").value = "";
  ["err-from", "err-items"].forEach((id) => $(id).classList.add("hidden"));

  // ขั้น 1: เลือก "ยืมจาก" = ทุก ward ยกเว้น ward ตัวเอง (จำ ward ที่ใช้ล่าสุดไว้ให้)
  const options = WARDS.filter((w) => w !== currentUser.ward);
  const last = localStorage.getItem(LAST_FROM_KEY);
  const selected = options.includes(last) ? last : null;
  $("borrow-from").innerHTML = options.map((w) => `
    <button type="button" class="chip${w === selected ? " is-on" : ""}" role="radio"
            aria-checked="${w === selected}" data-from="${esc(w)}">${esc(w)}</button>`).join("");

  // ขั้น 2: ปุ่มลัดของที่ยืมบ่อย + คำแนะนำตอนพิมพ์
  const items = knownItems();
  $("item-list").innerHTML = items.map((n) => `<option value="${esc(n)}"></option>`).join("");
  $("item-suggest").innerHTML = items.slice(0, 6).map((n) =>
    `<button type="button" class="chip" data-suggest="${esc(n)}">${icon("plus")}${esc(n)}</button>`).join("");
  $("suggest-wrap").classList.toggle("hidden", items.length === 0);

  $("item-rows").innerHTML = "";
  addItemRow();

  // ขั้น 3: เหตุผลที่ใช้บ่อย
  $("reason-chips").innerHTML = REASONS.map((r) =>
    `<button type="button" class="chip" data-reason="${esc(r)}">${esc(r)}</button>`).join("");

  updateConfirmButton();
}

// เลือก ward ปลายทาง (ทำงานเหมือน radio)
$("borrow-from").addEventListener("click", (e) => {
  const b = e.target.closest("[data-from]");
  if (!b) return;
  $("borrow-from").querySelectorAll(".chip").forEach((c) => {
    const on = c === b;
    c.classList.toggle("is-on", on);
    c.setAttribute("aria-checked", on);
  });
  $("err-from").classList.add("hidden");
});

// เหตุผล: แตะปุ่ม → เติมในช่องข้อความ (แตะซ้ำ = ยกเลิก) และปุ่มจะเรืองตามข้อความที่พิมพ์
function syncReasonChips() {
  const v = $("borrow-reason").value.trim();
  $("reason-chips").querySelectorAll(".chip").forEach((c) =>
    c.classList.toggle("is-on", c.dataset.reason === v));
}
$("reason-chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-reason]");
  if (!b) return;
  $("borrow-reason").value = b.classList.contains("is-on") ? "" : b.dataset.reason;
  syncReasonChips();
});
$("borrow-reason").addEventListener("input", syncReasonChips);

// เพิ่มแถว "ของที่ยืม + จำนวน" 1 แถว
function addItemRow(name = "", qty = 1) {
  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <input type="text" class="item-name" list="item-list" placeholder="ชื่อของ เช่น NSS 100 mL"
           autocomplete="off" aria-label="ชื่อของที่ยืม" value="${esc(name)}" />
    <div class="stepper" role="group" aria-label="จำนวน">
      <button type="button" class="step-dec" aria-label="ลดจำนวน">${icon("minus")}</button>
      <input type="number" class="item-qty" min="1" inputmode="numeric" value="${qty}" aria-label="จำนวน" />
      <button type="button" class="step-inc" aria-label="เพิ่มจำนวน">${icon("plus")}</button>
    </div>
    <button type="button" class="remove" aria-label="ลบรายการนี้">${icon("x")}<span>ลบ</span></button>
  `;
  $("item-rows").appendChild(row);
  return row;
}

// จัดการปุ่มทั้งหมดในรายการของ (event delegation = ผูกครั้งเดียวที่กล่องแม่)
$("item-rows").addEventListener("click", (e) => {
  const row = e.target.closest(".item-row");
  if (!row) return;
  const qty = row.querySelector(".item-qty");
  if (e.target.closest(".step-inc")) qty.value = (Number(qty.value) || 0) + 1;
  if (e.target.closest(".step-dec")) qty.value = Math.max(1, (Number(qty.value) || 1) - 1);
  if (e.target.closest(".remove")) {
    // ต้องเหลืออย่างน้อย 1 แถวเสมอ (ถ้าเหลือแถวเดียว ให้ล้างค่าแทน)
    if ($("item-rows").children.length > 1) row.remove();
    else { row.querySelector(".item-name").value = ""; qty.value = 1; }
  }
  updateConfirmButton();
});
$("item-rows").addEventListener("input", () => {
  $("err-items").classList.add("hidden");
  updateConfirmButton();
});

// เพิ่มรายการใหม่แล้วเลื่อนโฟกัสไปที่ช่องชื่อของแถวนั้น
$("btn-add-item").addEventListener("click", () => {
  const row = addItemRow();
  row.querySelector(".item-name").focus();
  updateConfirmButton();
});

// แตะปุ่มลัดของที่ยืมบ่อย: ถ้ามีในรายการแล้ว +1 / ถ้ามีแถวว่างเติมให้ / ไม่งั้นเพิ่มแถวใหม่
$("item-suggest").addEventListener("click", (e) => {
  const b = e.target.closest("[data-suggest]");
  if (!b) return;
  const name = b.dataset.suggest;
  const rows = [...document.querySelectorAll(".item-row")];
  const same = rows.find((r) => r.querySelector(".item-name").value.trim().toLowerCase() === name.toLowerCase());
  if (same) {
    const q = same.querySelector(".item-qty");
    q.value = (Number(q.value) || 0) + 1;
  } else {
    const empty = rows.find((r) => r.querySelector(".item-name").value.trim() === "");
    if (empty) empty.querySelector(".item-name").value = name;
    else addItemRow(name);
  }
  $("err-items").classList.add("hidden");
  updateConfirmButton();
});

// รวบรวมของทุกแถว เอาเฉพาะแถวที่พิมพ์ชื่อของแล้ว
function collectItems() {
  return [...document.querySelectorAll(".item-row")]
    .map((row) => ({
      name: row.querySelector(".item-name").value.trim(),
      qty:  Math.max(1, Math.floor(Number(row.querySelector(".item-qty").value)) || 1),
    }))
    .filter((it) => it.name !== "");
}

// ปุ่มยืนยันบอกจำนวนรายการให้เห็นก่อนกด
function updateConfirmButton() {
  const n = collectItems().length;
  $("btn-borrow-confirm").textContent = n > 0 ? `ยืนยันการยืม (${n} รายการ)` : "ยืนยันการยืม";
}

function fieldError(id, msg, focusEl) {
  const el = $(id);
  el.textContent = msg;
  el.classList.remove("hidden", "shake");
  void el.offsetWidth; el.classList.add("shake");
  if (focusEl) focusEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

// กด "ยืนยัน" → ตรวจข้อมูล → บันทึกทุกแถวลงฐานข้อมูล → เปิด popup
$("borrow-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const chip = $("borrow-from").querySelector(".chip.is-on");
  const fromWard = chip ? chip.dataset.from : "";
  const reason = $("borrow-reason").value.trim();
  const items = collectItems();

  // ตรวจทีละข้อ แจ้งเตือนตรงจุดที่ผิด (ไม่ใช้ alert ที่บังหน้าจอ)
  if (!fromWard) return fieldError("err-from", "กรุณาเลือกหน่วยงานที่ต้องการยืมจาก", $("borrow-from"));
  if (items.length === 0) {
    fieldError("err-items", "กรุณาใส่ชื่อของที่ต้องการยืมอย่างน้อย 1 รายการ", $("item-rows"));
    document.querySelector(".item-name")?.focus({ preventScroll: true });
    return;
  }

  const records = loadRecords();
  // id ใหม่ = id ที่มากที่สุด + 1 (วิธีง่าย ๆ สำหรับเวอร์ชันทดลอง)
  let nextId = records.reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const today = localISO(); // รูปแบบ "2026-08-21"

  items.forEach((it) => {
    records.push({
      id: nextId++,
      borrowerName: currentUser.name,
      borrowerWard: currentUser.ward,
      fromWard,
      item: it.name,
      qty: it.qty,
      reason,
      status: "borrowed",
      date: today,
    });
  });
  saveRecords(records);
  localStorage.setItem(LAST_FROM_KEY, fromWard);
  updateBadges();

  // popup ตามภาพร่าง: "ส่งรายการที่ต้องการยืมให้ ... เรียบร้อย" + สรุปรายการ
  $("popup-text").textContent = `ส่งรายการที่ต้องการยืมให้ ${fromWard} เรียบร้อย`;
  $("popup-items").innerHTML = items.map((it) =>
    `<li><span>${esc(it.name)}</span><b>× ${it.qty}</b></li>`).join("");
  $("popup").classList.remove("hidden");
  $("btn-popup-pending").focus();
});

/* ------------------------------------------------------------
   ส่วนที่ 8 : หน้า "รายการค้าง" (แท็บ 2 ฝั่ง แสดงเป็นการ์ด)
   ------------------------------------------------------------ */

// ข้อความอายุรายการ + สี (เกินกำหนดจะเตือน)
function ageInfo(r) {
  const n = daysSince(r.date);
  const text = n <= 0 ? "ยืมวันนี้" : n === 1 ? "ยืมเมื่อวาน" : `ยืมมา ${n} วัน`;
  let cls = "";
  if (r.status === "borrowed") cls = n >= VERY_LATE_DAYS ? "very-late" : n >= LATE_DAYS ? "late" : "";
  return { text, cls };
}

// แถบความคืบหน้า 3 ขั้น: ยืม → ส่งคืน → รับคืน
function trackHTML(status) {
  const idx = { borrowed: 0, returning: 1, returned: 2 }[status];
  return `<ol class="track" aria-label="ความคืบหน้า">` + ["ยืม", "ส่งคืน", "รับคืน"].map((label, i) => {
    const cls = i <= idx ? "done" : i === idx + 1 ? "now" : "";
    return `<li class="${cls}">${label}</li>`;
  }).join("") + `</ol>`;
}

function loanCard(r, tab) {
  const age = ageInfo(r);
  let meta, action;

  if (tab === "mine") {
    // ฝั่งเรายืมมา: กด "ส่งคืน" ได้เฉพาะที่ยังไม่ส่ง
    meta = `ยืมจาก <b>${esc(r.fromWard)}</b>`;
    action = r.status === "borrowed"
      ? `<button class="btn btn-primary" data-act="send" data-id="${r.id}">${icon("arrow")}ส่งคืน</button>`
      : `<div class="wait-note">${icon("clock")}รอ ${esc(r.fromWard)} กดรับคืน</div>`;
  } else {
    // ฝั่งเป็นเจ้าของ: กฎสำคัญตามภาพร่าง — รับคืนได้เมื่อผู้ยืมกด "ส่งคืน" แล้วเท่านั้น
    meta = `ผู้ยืม <b>${esc(r.borrowerWard)}</b> · ${esc(r.borrowerName)}`;
    action = r.status === "returning"
      ? `<button class="btn btn-confirm" data-act="receive" data-id="${r.id}">${icon("check")}รับคืน</button>`
      : `<div class="wait-note">${icon("clock")}รอ ${esc(r.borrowerWard)} กดส่งคืนก่อน</div>`;
  }

  return `
    <article class="loan s-${r.status}">
      <div class="loan-top">
        <div class="loan-title">
          <strong>${esc(r.item)}</strong>
          <div class="loan-meta">${meta}</div>
          <div class="loan-meta loan-age"><span class="age ${age.cls}">${icon("clock")}${age.text}</span><span>· ${shortThaiDate(r.date)}</span></div>
        </div>
        <span class="qty" aria-label="จำนวน">× ${r.qty}</span>
      </div>
      ${r.reason ? `<p class="loan-reason">เหตุผล: ${esc(r.reason)}</p>` : ""}
      ${trackHTML(r.status)}
      <div class="loan-action">${action}</div>
    </article>`;
}

// ระบบเลือกแท็บให้: ฝั่งไหนมีงานรอทำก็เปิดฝั่งนั้นก่อน
function pickTab(c) {
  if (c.needReturn.length > 0) return "mine";
  if (c.needReceive.length > 0) return "theirs";
  return c.mineAll.length >= c.theirsAll.length ? "mine" : "theirs";
}

function renderPending() {
  const c = todoCounts();
  const tab = pendingTabPref || pickTab(c);
  pendingTabPref = tab;

  // หัวแท็บ + ตัวเลข (เลขสีเด่น = มีงานต้องทำ)
  const setTab = (id, cntId, selected, all, actionable) => {
    $(id).setAttribute("aria-selected", selected);
    const cnt = $(cntId);
    cnt.textContent = all.length;
    cnt.classList.toggle("attn", actionable > 0);
  };
  setTab("tab-mine",   "cnt-mine",   tab === "mine",   c.mineAll,   c.needReturn.length);
  setTab("tab-theirs", "cnt-theirs", tab === "theirs", c.theirsAll, c.needReceive.length);

  const list = tab === "mine" ? c.mineAll : c.theirsAll;
  const actionableStatus = tab === "mine" ? "borrowed" : "returning";
  const actionable = list.filter((r) => r.status === actionableStatus);

  $("pending-hint").textContent = tab === "mine"
    ? "ของที่ ward เรายืมมา — กด \"ส่งคืน\" เมื่อนำของไปคืนแล้ว"
    : "ของเราที่ถูกยืมไป — \"รับคืน\" จะกดได้เมื่อผู้ยืมกด \"ส่งคืน\" แล้วเท่านั้น";

  // ปุ่มทำทั้งหมด (ปรากฏเมื่อมีตั้งแต่ 2 รายการขึ้นไป — ประหยัดการกดซ้ำ ๆ)
  $("pending-bulk").innerHTML = actionable.length >= 2
    ? (tab === "mine"
        ? `<button class="btn btn-primary btn-small" data-bulk="send">${icon("arrow")}ส่งคืนทั้งหมด (${actionable.length})</button>`
        : `<button class="btn btn-confirm btn-small" data-bulk="receive">${icon("check")}รับคืนทั้งหมด (${actionable.length})</button>`)
    : "";

  // เรียง: รายการที่ต้องทำมาก่อน แล้วเก่าสุดขึ้นก่อน (ค้างนานสุดเห็นก่อน)
  const sorted = [...list].sort((a, b) =>
    (Number(b.status === actionableStatus) - Number(a.status === actionableStatus)) ||
    a.date.localeCompare(b.date) || a.id - b.id);

  $("pending-list").innerHTML = sorted.length === 0
    ? `<div class="empty">${icon(tab === "mine" ? "check" : "inbox")}
         <strong>${tab === "mine" ? "ไม่มีรายการค้างคืน 🎉" : "ไม่มีของค้างรับคืน"}</strong>
         ${tab === "mine" ? "ward ของคุณคืนของครบทุกชิ้นแล้ว" : "ยังไม่มี ward อื่นยืมของเราไป"}
       </div>`
    : sorted.map((r) => loanCard(r, tab)).join("");
}

// สลับแท็บ
document.querySelectorAll("[data-tab-switch]").forEach((b) =>
  b.addEventListener("click", () => { pendingTabPref = b.dataset.tabSwitch; renderPending(); })
);

// ปุ่ม ส่งคืน / รับคืน ในการ์ด (event delegation)
$("pending-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const id = Number(b.dataset.id);
  changeStatus([id], b.dataset.act === "send" ? "returning" : "returned");
});

// ปุ่มทำทั้งหมด
$("pending-bulk").addEventListener("click", (e) => {
  const b = e.target.closest("[data-bulk]");
  if (!b) return;
  const c = todoCounts();
  const isSend = b.dataset.bulk === "send";
  const ids = (isSend ? c.needReturn : c.needReceive).map((r) => r.id);
  changeStatus(ids, isSend ? "returning" : "returned");
});

// เปลี่ยนสถานะรายการ แล้ววาดใหม่ + แจ้งเตือนพร้อมปุ่ม "เลิกทำ" (กดผิดแก้ได้ ไม่ต้องถามยืนยันให้เสียเวลา)
function changeStatus(ids, newStatus) {
  const records = loadRecords();
  const prev = {};
  records.forEach((r) => {
    if (ids.includes(r.id)) { prev[r.id] = r.status; r.status = newStatus; }
  });
  saveRecords(records);
  renderCurrent();

  const n = ids.length;
  const msg = newStatus === "returning"
    ? `ส่งคืนแล้ว ${n} รายการ — รอปลายทางกดรับคืน`
    : `รับคืนแล้ว ${n} รายการ เรียบร้อย`;
  showToast(msg, {
    label: "เลิกทำ",
    onAction: () => {
      const rs = loadRecords();
      rs.forEach((r) => { if (prev[r.id]) r.status = prev[r.id]; });
      saveRecords(rs);
      renderCurrent();
      showToast("เลิกทำแล้ว");
    },
  });
}

/* ------------------------------------------------------------
   ส่วนที่ 9 : DASHBOARD
   ------------------------------------------------------------ */

// ตัวช่วย: นับความถี่ของค่าใน array → [[ค่า, จำนวน], ...] เรียงมากไปน้อย
function frequency(list) {
  const count = {};
  list.forEach((x) => (count[x] = (count[x] || 0) + 1));
  return Object.entries(count).sort((a, b) => b[1] - a[1]);
}

const THAI_MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
                     "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

function setStat(id, list) {
  const top = frequency(list)[0];
  $(id).textContent = top ? top[0] : "—";
  $(id + "-n").textContent = top ? `${top[1]} ครั้ง` : "";
}

function renderDashboard() {
  const records = loadRecords();

  // สถิติ 3 ช่องบน
  setStat("stat-top-item",     records.map((r) => r.item));
  setStat("stat-top-giver",    records.map((r) => r.fromWard));
  setStat("stat-top-borrower", records.map((r) => r.borrowerWard));

  // เติมตัวเลือกเดือน (ครั้งแรกครั้งเดียว)
  const mSel = $("dash-month"), ySel = $("dash-year");
  if (mSel.options.length === 0) {
    THAI_MONTHS.forEach((m, i) => {
      // value เก็บเลขเดือนแบบ "01"–"12" ให้ตรงกับรูปแบบวันที่ในฐานข้อมูล
      mSel.insertAdjacentHTML("beforeend",
        `<option value="${String(i + 1).padStart(2, "0")}">${m}</option>`);
    });
    const thisYear = new Date().getFullYear();
    for (let y = thisYear - 2; y <= thisYear; y++) {
      // แสดงเป็น พ.ศ. (ค.ศ. + 543) แต่ value เก็บ ค.ศ. ไว้ใช้คำนวณ
      ySel.insertAdjacentHTML("beforeend", `<option value="${y}">${y + 543}</option>`);
    }
    // ตั้งค่าเริ่มต้น = เดือน/ปีปัจจุบัน
    mSel.value = String(new Date().getMonth() + 1).padStart(2, "0");
    ySel.value = String(thisYear);
    mSel.addEventListener("change", renderDashboard);
    ySel.addEventListener("change", renderDashboard);
  }

  // นับจำนวนการยืมในเดือนที่เลือก → คำนวณกระดาษ A4 ที่ประหยัดได้
  const prefix = `${ySel.value}-${mSel.value}`; // เช่น "2026-08"
  const monthCount = records.filter((r) => r.date.startsWith(prefix)).length;
  const paper = monthCount / 2; // ½ แผ่นต่อครั้ง ตามภาพร่าง
  $("dash-count").textContent  = monthCount;
  $("dash-count2").textContent = monthCount;
  $("dash-paper").textContent  = paper;
  $("dash-paper2").textContent = paper;

  // กราฟแท่ง: ของที่ถูกยืมบ่อย 5 อันดับ
  const top = frequency(records.map((r) => r.item)).slice(0, 5);
  const max = top.length ? top[0][1] : 1;
  $("dash-bars").innerHTML = top.length === 0
    ? `<p class="hint">ยังไม่มีข้อมูล</p>`
    : top.map(([name, n]) => `
        <div class="bar-row">
          <div class="bar-label"><span>${esc(name)}</span><span>${n} ครั้ง</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${Math.round((n / max) * 100)}%"></div></div>
        </div>`).join("");

  renderRecordTable(records);
}

// ตารางรายการทั้งหมดใน database (ใหม่สุดอยู่บน) + ค้นหา + กรองสถานะ
function renderRecordTable(records = loadRecords()) {
  const q = $("rec-search").value.trim().toLowerCase();
  const rows = [...records]
    .filter((r) => dashFilter === "all" || r.status === dashFilter)
    .filter((r) => !q || [r.item, r.borrowerName, r.borrowerWard, r.fromWard, r.reason]
      .join(" ").toLowerCase().includes(q))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  $("table-all").innerHTML = rows.length === 0
    ? `<tr class="empty-row"><td colspan="6">ไม่พบรายการที่ตรงกับเงื่อนไข</td></tr>`
    : rows.map((r) => `
        <tr>
          <td data-label="วันที่">${shortThaiDate(r.date)}</td>
          <td data-label="ผู้ยืม">${esc(r.borrowerName)} (${esc(r.borrowerWard)})</td>
          <td data-label="ยืมจาก">${esc(r.fromWard)}</td>
          <td data-label="รายการ">${esc(r.item)}</td>
          <td data-label="จำนวน">${r.qty}</td>
          <td data-label="สถานะ">${statusBadge(r.status)}</td>
        </tr>`).join("");
}

$("rec-search").addEventListener("input", () => renderRecordTable());
$("rec-filter").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (!b) return;
  dashFilter = b.dataset.filter;
  $("rec-filter").querySelectorAll(".chip").forEach((c) => c.classList.toggle("is-on", c === b));
  renderRecordTable();
});

/* ------------------------------------------------------------
   เริ่มต้น: ถ้าเคยล็อกอินไว้ในแท็บนี้ให้เข้าต่อเลย ไม่งั้นเปิดหน้า login
   ------------------------------------------------------------ */
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !$("popup").classList.contains("hidden")) goto("page-menu");
});

const savedId = sessionStorage.getItem(SESSION_KEY);
if (savedId && USERS[savedId]) startSession(savedId);
route();
