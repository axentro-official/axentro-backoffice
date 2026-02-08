/* Axentro Backoffice - Shared App Logic (Auth + Helpers)
   هدف الملف: منطق مشترك لكل الصفحات بدون تغيير الهوية البصرية.
   ملاحظة مهمة: حماية الواجهة (Front-end) تمنع الدخول "العادي" فقط، لكنها ليست حماية سيرفر 100%.
   عندما نربط Google Apps Script لاحقاً، سنجعل كل عمليات القراءة/الكتابة لا تعمل إلا بتوكين صحيح.
*/
(function(){
  "use strict";

  const STORAGE_KEY = "axentro_auth_v1";
  const LEGACY_OK_KEY = "AX_BO_OK";

  // ✅ بدل ما كلمة المرور تكون ظاهرة، نخزن Hash (SHA-256) للرمز.
  // الافتراضي الحالي مطابق للكود القديم: 1407
  const ALLOWED_PASSWORD_HASHES = new Set([
    "a3346b8b4c26feb607f8a40699c934ef426dee5ceebf51f9f7209aa79c08a0da"
  ]);

  async function sha256Hex(text){
    const enc = new TextEncoder().encode(text);
    const buf = await crypto.subtle.digest("SHA-256", enc);
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }

  function nowMs(){ return Date.now(); }

  function readAuth(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const obj = JSON.parse(raw);
      if(!obj || !obj.exp) return null;
      if(nowMs() > obj.exp) return null;
      try{ sessionStorage.setItem(LEGACY_OK_KEY, "1"); }catch(e){}
      return obj;
    }catch(e){ return null; }
  }

  function writeAuth(session){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    try{ sessionStorage.setItem(LEGACY_OK_KEY, "1"); }catch(e){}
  }

  function clearAuth(){
    localStorage.removeItem(STORAGE_KEY);
    try{ sessionStorage.removeItem(LEGACY_OK_KEY); }catch(e){}
  }

  async function loginWithPassword(password, opts={}){
    const pwd = String(password||"").trim();
    if(!pwd) return false;

    // 12 ساعة افتراضيًا
    const ttlHours = Number(opts.ttlHours || 12);
    const hash = await sha256Hex(pwd);

    if(!ALLOWED_PASSWORD_HASHES.has(hash)) return false;

    writeAuth({
      ok: true,
      // token عشوائي للاستخدام لاحقًا مع الـ API
      token: (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + String(nowMs())),
      exp: nowMs() + ttlHours*60*60*1000
    });
    return true;
  }

  function isAuthed(){
    return !!readAuth();
  }

  function requireAuth(redirectUrl="login.html"){
    if(isAuthed()) return true;

    // مرّر الصفحة الحالية عشان بعد تسجيل الدخول يرجع لها
    const next = encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
    location.replace(`${redirectUrl}?next=${next}`);
    return false;
  }

  function logout(){
    clearAuth();
    location.replace("login.html");
  }

  // expose
  window.AxentroAuth = {
    loginWithPassword,
    isAuthed,
    requireAuth,
    logout,
    // داخلي (للاستخدام لاحقًا مع الـ API)
    _readAuth: readAuth
  };
})();
