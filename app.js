/* Axentro Backoffice - Shared App Logic (Google Auth + API helpers) */
(function(){
  "use strict";

  const DEFAULTS = {
    GAS_WEB_APP_URL: "",
    GOOGLE_CLIENT_ID: ""
  };

  const CFG = Object.assign({}, DEFAULTS, (window.AXENTRO_CONFIG || {}));
  const STORAGE_KEY = "axentro_session_v2";

  function nowMs(){ return Date.now(); }
  function isObj(v){ return !!v && typeof v === "object" && !Array.isArray(v); }

  function getSession(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return null;
      const s = JSON.parse(raw);
      if(!s || !s.token) return null;
      if(s.expiresAt && Number(s.expiresAt) <= nowMs()){
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return s;
    }catch(e){ return null; }
  }

  function setSession(sess){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sess));
    try{ sessionStorage.setItem("AX_BO_OK", "1"); }catch(e){}
    try{ localStorage.setItem("ax_role", sess.role || "viewer"); }catch(e){}
    try{ localStorage.setItem("session_token", sess.token || ""); }catch(e){}
  }

  function clearSession(){
    localStorage.removeItem(STORAGE_KEY);
    try{ sessionStorage.removeItem("AX_BO_OK"); }catch(e){}
    try{ localStorage.removeItem("ax_role"); }catch(e){}
    try{ localStorage.removeItem("session_token"); }catch(e){}
  }

  function buildNextParam(){
    const url = new URL(location.href);
    return encodeURIComponent(url.pathname.split("/").pop() || "dashboard.html");
  }
  function redirectToLogin(){ location.replace("login.html?next=" + buildNextParam()); }

  function normalizeData(action, data){
    if(!isObj(data)) return data;
    const items = Array.isArray(data.items) ? data.items : [];
    switch(action){
      case 'get_products':
        if(!Array.isArray(data.products)) data.products = items;
        break;
      case 'get_warehouses':
        if(!Array.isArray(data.warehouses)) data.warehouses = items;
        break;
      case 'get_inventory_view':
        if(Array.isArray(data.items)) {
          data.items = data.items.map(it => Object.assign({}, it, {
            on_hand_qty: Number(it.on_hand_qty ?? it.qty ?? 0) || 0,
            min_effective: Number(it.min_effective ?? it.min_qty ?? 0) || 0,
          }));
        }
        break;
      case 'get_expenses':
        if(!Array.isArray(data.expenses)) data.expenses = items;
        break;
      case 'get_sales_log':
        if(!Array.isArray(data.sales)) data.sales = items;
        break;
      case 'get_purchases_log':
        if(!Array.isArray(data.purchases)) data.purchases = items;
        break;
    }
    return data;
  }

  async function apiCall(action, payload){
    if(!CFG.GAS_WEB_APP_URL) throw new Error("GAS_WEB_APP_URL is not set in AXENTRO_CONFIG.");
    const sess = getSession();
    const body = Object.assign({}, payload || {}, {
      action,
      session_token: sess ? sess.token : (localStorage.getItem('session_token') || null)
    });

    const res = await fetch(CFG.GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type":"text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      cache: "no-store"
    });
    const data = await res.json().catch(()=>({}));
    if(!res.ok || data.ok === false){
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ("HTTP " + res.status);
      const err = new Error(msg);
      err.data = data;
      throw err;
    }
    return normalizeData(action, data);
  }

  const AxentroAuth = {
    cfg: CFG,
    isAuthed(){ return !!getSession(); },
    getSession(){ return getSession(); },
    requireAuth(){ if(!getSession()) redirectToLogin(); },
    logout(){ clearSession(); redirectToLogin(); },
    async loginWithGoogleIdToken(idToken){
      const data = await apiCall("auth_login", { id_token: idToken });
      if(data.status === "APPROVED" && data.session_token){
        const role = data.role || "viewer";
        setSession({
          token: data.session_token,
          email: data.email,
          role,
          expiresAt: nowMs() + (Number(data.expires_in || 3600) * 1000)
        });
      }
      return data;
    },
    async me(){ return apiCall("auth_me", {}); }
  };

  const AxentroApi = {
    async getProducts(payload){ return apiCall("get_products", payload||{}); },
    async createPurchase(payload){ return apiCall("create_purchase", payload); },
    async createSale(payload){ return apiCall("create_sale", payload); },
    async getWarehouses(payload){ return apiCall("get_warehouses", payload||{}); },
    async getInventoryView(payload){ return apiCall("get_inventory_view", payload||{}); },
    async rebuildInventoryView(){ return apiCall("rebuild_inventory_view", {}); },
    async updateProductMinQty(payload){ return apiCall("update_product_min_qty", payload); },
    async getPurchasesLog(payload){ return apiCall("get_purchases_log", payload||{}); },
    async getSalesLog(payload){ return apiCall("get_sales_log", payload||{}); },
    async getProfitSummary(payload){ return apiCall("get_profit_summary", payload||{}); },
    async getFinancialReport(payload){ return apiCall("get_financial_report", payload||{}); },
    async getDashboardSummary(payload){ return apiCall("get_dashboard_summary", payload||{}); },
    async getExpenses(payload){ return apiCall("get_expenses", payload||{}); },
    async createExpense(payload){ return apiCall("create_expense", payload); },
    async getSaleInvoice(invoice_no){ return apiCall("get_sale_invoice", { invoice_no }); },
    async updateSaleInvoice(payload){ return apiCall("update_sale_invoice", payload); },
    async softDeleteSaleInvoice(invoice_no){ return apiCall("soft_delete_sale_invoice", { invoice_no }); },
    async listDeletedSales(){ return apiCall("list_deleted_sales", {}); },
    async restoreSaleInvoice(invoice_no){ return apiCall("restore_sale_invoice", { invoice_no }); },
    async purgeSaleInvoice(invoice_no){ return apiCall("purge_sale_invoice", { invoice_no }); },
    async getPurchaseInvoice(invoice_no){ return apiCall("get_purchase_invoice", { invoice_no }); },
    async updatePurchaseInvoice(payload){ return apiCall("update_purchase_invoice", payload); },
    async softDeletePurchaseInvoice(invoice_no){ return apiCall("soft_delete_purchase_invoice", { invoice_no }); },
    async listDeletedPurchases(){ return apiCall("list_deleted_purchases", {}); },
    async restorePurchaseInvoice(invoice_no){ return apiCall("restore_purchase_invoice", { invoice_no }); },
    async purgePurchaseInvoice(invoice_no){ return apiCall("purge_purchase_invoice", { invoice_no }); },
  };

  function axRole(){
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
    el.querySelectorAll("input, select, textarea, button").forEach((n)=>{
      const id = (n.id||"").toLowerCase();
      const cls = (n.className||"").toLowerCase();
      const keep = id.includes("logout") || cls.includes("logout") || n.dataset.allowReadonly === "1";
      if(keep) return;
      n.disabled = true;
    });
    el.querySelectorAll("a").forEach((a)=>{
      if(a.dataset.allowReadonly === "1") return;
      if((a.getAttribute("href")||"").toLowerCase().endsWith(".html")) return;
      a.addEventListener("click", (e)=> e.preventDefault());
    });
  }

  window.AxentroRoles = { axRole, axIsAdmin, axIsSales, axIsViewer, axCanCreate, axCanEdit, axRequire, axSetReadOnly };
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;
})();
