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
  async function apiCall(action, payload) {
    const url = AxentroConfig.apiUrl;
    const body = JSON.stringify(Object.assign({ action }, payload || {}));

    // Timeout (default 25s) — keeps UI responsive on bad networks
    const timeoutMs = Number(AxentroConfig.apiTimeoutMs || 25000);
    const ctrl = ("AbortController" in window) ? new AbortController() : null;
    const t = ctrl ? setTimeout(() => { try { ctrl.abort(); } catch(e){} }, timeoutMs) : null;

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: ctrl ? ctrl.signal : undefined
      });

      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : {}; } catch(e) { json = { ok:false, error: "Bad JSON from server", raw: text }; }

      if (!res.ok) {
        return { ok:false, error: (json && (json.error || json.message)) ? (json.error || json.message) : ("HTTP " + res.status), status: res.status, raw: text };
      }
      return json || {};
    } catch (e) {
      const msg = (e && e.name === "AbortError") ? "Request timeout" : (e && e.message ? e.message : String(e));
      return { ok:false, error: msg };
    } finally {
      if (t) clearTimeout(t);
    }
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

    // جاهزة للمرحلة الجاية (Username/Password) بدون كسر Google
    async loginWithPassword(username, password){
      const data = await apiCall("auth_login", { username, password });
      if(data && data.ok && data.session_token){
        setSession({
          token: data.session_token,
          email: data.email || username || "",
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
    },

    // ===== Sales =====
    async createSale(salePayload){
      return apiCall("create_sale", salePayload);
    },

    // ===== Warehouses =====
    async getWarehouses(){
      return apiCall("get_warehouses", {});
    },

    // ===== Inventory =====
    async getInventoryView(){
      return apiCall("get_inventory_view", {});
    },
    async rebuildInventoryView(){
      return apiCall("rebuild_inventory_view", {});
    },

    // ===== Products (Min Qty) =====
    async updateProductMinQty(payload){
      return apiCall("update_product_min_qty", payload);
    },

    // ===== Logs / Reports =====
    async getPurchasesLog(){ return apiCall("get_purchases_log", {}); },
    async getSalesLog(){ return apiCall("get_sales_log", {}); },
    async getProfitSummary(){ return apiCall("get_profit_summary", {}); },
    async getDashboardSummary(){ return apiCall("get_dashboard_summary", {}); },

    // ===== Expenses =====
    async getExpenses(){ return apiCall("get_expenses", {}); },
    async createExpense(payload){ return apiCall("create_expense", payload); },
  };

  // Expose globally
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;

})();
