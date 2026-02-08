/* Axentro Backoffice - Shared App Logic (Google Auth + API helpers)
   ملاحظات:
   - الواجهة على GitHub Pages "لا يمكن" حمايتها 100% لوحدها.
   - الحماية الحقيقية هنا: كل قراءة/كتابة تتم عبر Google Apps Script الذي يطبق Whitelist/Blacklist.
   - تسجيل الدخول: Google Identity Services (GIS) + Apps Script token verification.
*/
(function(){
  "use strict";

  // ====== Config ======
  const DEFAULTS = {
    // ضع رابط Web App بعد ما تنشر Apps Script كـ Web App
    // مثال: https://script.google.com/macros/s/XXXX/exec
    GAS_WEB_APP_URL: "",
    // ضع Google OAuth Client ID الخاص بـ GIS
    GOOGLE_CLIENT_ID: "",
    // أين تُرسل إشعارات طلبات الدخول (على السيرفر)
    // لا تحتاج هنا.
  };

  // يمكن لكل صفحة أن تضع قبل app.js:
  // <script>window.AXENTRO_CONFIG={ GAS_WEB_APP_URL:"...", GOOGLE_CLIENT_ID:"..." };</script>
  const CFG = Object.assign({}, DEFAULTS, (window.AXENTRO_CONFIG || {}));

  // ====== Session storage ======
  const STORAGE_KEY = "axentro_session_v2"; // {token,email,role,expiresAt}

  function nowMs(){ return Date.now(); }

  function getSession(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || !s.token || !s.expiresAt) return null;
      if(Number(s.expiresAt) <= nowMs()){
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return s;
    }catch(e){ return null; }
  }

  function setSession(sess){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sess));
    // legacy compatibility (بعض الصفحات القديمة)
    try{ sessionStorage.setItem("AX_BO_OK", "1"); }catch(e){}
  }

  function clearSession(){
    localStorage.removeItem(STORAGE_KEY);
    try{ sessionStorage.removeItem("AX_BO_OK"); }catch(e){}
  }

  function buildNextParam(){
    const url = new URL(location.href);
    return encodeURIComponent(url.pathname.split("/").pop() || "dashboard.html");
  }

  function redirectToLogin(){
    location.replace("login.html?next=" + buildNextParam());
  }

  // ====== API helper ======
  async function apiCall(action, payload){
    if(!CFG.GAS_WEB_APP_URL){
      throw new Error("GAS_WEB_APP_URL is not set in AXENTRO_CONFIG.");
    }
    const sess = getSession();
    const body = Object.assign({}, payload || {}, {
      action,
      session_token: sess ? sess.token : null
    });

    // ملاحظة: استخدام text/plain يتجنب غالبًا طلب OPTIONS (CORS preflight) في المتصفح.
    // Apps Script يقرأ e.postData.contents بغض النظر عن Content-Type.
    const res = await fetch(CFG.GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type":"text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(()=> ({}));
    if(!res.ok || data.ok === false){
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ("HTTP " + res.status);
      const err = new Error(msg);
      err.data = data;
      throw err;
    }
    return data;
  }

  // ====== Auth facade (keeps old API names) ======
  const AxentroAuth = {
    cfg: CFG,

    isAuthed(){
      return !!getSession();
    },

    getSession(){
      return getSession();
    },

    requireAuth(){
      if(!getSession()) redirectToLogin();
    },

    logout(){
      clearSession();
      redirectToLogin();
    },

    async loginWithGoogleIdToken(idToken){
      // Returns: {status:'APPROVED'|'PENDING'|'BLOCKED'|'REJECTED', ...}
      const data = await apiCall("auth_login", { id_token: idToken });
      // When approved, server returns session_token + expires_in
      if(data.status === "APPROVED" && data.session_token){
        setSession({
          token: data.session_token,
          email: data.email,
          role: data.role || "user",
          expiresAt: nowMs() + (Number(data.expires_in || 3600) * 1000)
        });
      }
      return data;
    },

    async me(){
      return apiCall("auth_me", {});
    }
  };

  // ====== API facade ======
  const AxentroApi = {
    async getProducts(){
      return apiCall("get_products", {});
    },
    async createPurchase(purchasePayload){
      return apiCall("create_purchase", purchasePayload);
    }
  };

  // Expose globally
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;

})();
