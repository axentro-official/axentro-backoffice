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
        const role = data.role || "viewer";
        setSession({
          token: data.session_token,
          email: data.email,
          role,
          expiresAt: nowMs() + (Number(data.expires_in || 3600) * 1000)
        });
        // Keep legacy localStorage role key in sync for pages that still read it.
        try { localStorage.setItem("ax_role", role); } catch(e) {}
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

    // ===== Sales (in case the page needs it) =====
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
    async getFinancialReport(payload){ return apiCall("get_financial_report", payload||{}); },
    async getDashboardSummary(){ return apiCall("get_dashboard_summary", {}); },

    // ===== Expenses =====
    async getExpenses(){ return apiCall("get_expenses", {}); },
    async createExpense(payload){ return apiCall("create_expense", payload); },

    // ===== Full invoice view/edit/delete/restore/purge =====
    async getSaleInvoice(invoice_no){ return apiCall("get_sale_invoice", { invoice_no }); },
    async updateSaleInvoice(payload){ return apiCall("update_sale_invoice", payload); },
    // Back-end uses purge_* actions (row-level hard delete). Keep method name for UI compatibility.
    async softDeleteSaleInvoice(invoice_no){ return apiCall("purge_sale_invoice", { invoice_no }); },
    async listDeletedSales(){ return apiCall("list_deleted_sales", {}); },
    async restoreSaleInvoice(invoice_no){ return apiCall("restore_sale_invoice", { invoice_no }); },
    async purgeSaleInvoice(invoice_no){ return apiCall("purge_sale_invoice", { invoice_no }); },

    async getPurchaseInvoice(invoice_no){ return apiCall("get_purchase_invoice", { invoice_no }); },
    async updatePurchaseInvoice(payload){ return apiCall("update_purchase_invoice", payload); },
    // Back-end uses purge_* actions (row-level hard delete). Keep method name for UI compatibility.
    async softDeletePurchaseInvoice(invoice_no){ return apiCall("purge_purchase_invoice", { invoice_no }); },
    async listDeletedPurchases(){ return apiCall("list_deleted_purchases", {}); },
    async restorePurchaseInvoice(invoice_no){ return apiCall("restore_purchase_invoice", { invoice_no }); },
    async purgePurchaseInvoice(invoice_no){ return apiCall("purge_purchase_invoice", { invoice_no }); },
  };

  // ===== Role helpers (UI guardrails) =====
  function axRole(){
    // 'admin' | 'sales' | 'viewer'
    // Prefer role from session (set during login); fallback to legacy localStorage.
    const s = getSession();
    const r = (s && s.role) || localStorage.getItem("ax_role") || "viewer";
    return String(r).toLowerCase();
  }
  function axIsAdmin(){ return axRole() === "admin"; }
  function axIsSales(){ return axRole() === "sales"; }
  function axIsViewer(){ return axRole() === "viewer"; }
  function axCanCreate(){ return axIsAdmin() || axIsSales(); }
  function axCanEdit(){ return axIsAdmin(); }

  function axRequire(allowedRoles, redirectTo){
    const role = axRole();
    const ok = Array.isArray(allowedRoles) ? allowedRoles.includes(role) : (role === allowedRoles);
    if(ok) return true;
    alert('Unauthorized: role="' + role + '"');
    window.location.href = redirectTo || "dashboard.html";
    return false;
  }

  function axSetReadOnly(root){
    const el = (typeof root === "string") ? document.querySelector(root) : root;
    if(!el) return;

    // Disable inputs/selects/textareas/buttons except navigation and logout
    el.querySelectorAll("input, select, textarea, button").forEach((n)=>{
      const id = (n.id||"").toLowerCase();
      const cls = (n.className||"").toLowerCase();
      const keep = id.includes("logout") || cls.includes("logout") || n.dataset.allowReadonly === "1";
      if(keep) return;
      n.disabled = true;
    });

    // Prevent add/remove row buttons implemented as links
    el.querySelectorAll("a").forEach((a)=>{
      if(a.dataset.allowReadonly === "1") return;
      if((a.getAttribute("href")||"").toLowerCase().endsWith(".html")) return;
      a.addEventListener("click", (e)=> e.preventDefault());
    });
  }

  window.AxentroRoles = { axRole, axIsAdmin, axIsSales, axIsViewer, axCanCreate, axCanEdit, axRequire, axSetReadOnly };

  // Expose globally
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;

})();
