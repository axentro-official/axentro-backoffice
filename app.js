/* app.js — Axentro Backoffice Core (Stable+)
   - Keeps existing API method names
   - Adds: timeout, robust error handling, safer storage, helper auth
*/
(function () {
  "use strict";

  // ====== Config Guard ======
  const SCRIPT_URL = (typeof window !== "undefined" && window.AXENTRO_SCRIPT_URL) ? window.AXENTRO_SCRIPT_URL : "";
  const APP_KEY = (typeof window !== "undefined" && window.AXENTRO_APP_KEY) ? window.AXENTRO_APP_KEY : "";
  const REQUEST_TIMEOUT_MS = (typeof window !== "undefined" && window.AXENTRO_REQUEST_TIMEOUT_MS)
    ? Number(window.AXENTRO_REQUEST_TIMEOUT_MS || 0)
    : 20000;

  const STORAGE = {
    token: "axentro_token",
    username: "axentro_username",
    user: "axentro_user", // optional cached user object
  };

  // ====== Utils ======
  function safeJsonParse(text) {
    try { return JSON.parse(text); } catch (e) { return null; }
  }
  function toStr(v) { return (v == null) ? "" : String(v); }

  function getToken() {
    return localStorage.getItem(STORAGE.token) || "";
  }
  function setToken(t) {
    if (!t) localStorage.removeItem(STORAGE.token);
    else localStorage.setItem(STORAGE.token, String(t));
  }
  function getUsername() {
    return localStorage.getItem(STORAGE.username) || "";
  }
  function setUsername(u) {
    if (!u) localStorage.removeItem(STORAGE.username);
    else localStorage.setItem(STORAGE.username, String(u));
  }
  function setUserCache(userObj) {
    try {
      if (!userObj) localStorage.removeItem(STORAGE.user);
      else localStorage.setItem(STORAGE.user, JSON.stringify(userObj));
    } catch (e) { /* ignore */ }
  }
  function getUserCache() {
    try {
      const raw = localStorage.getItem(STORAGE.user);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function normalizeApiError(payload, fallbackMsg) {
    // payload could be object or string
    if (payload && typeof payload === "object") {
      const msg = payload.error || payload.message || payload.msg;
      if (msg) return new Error(String(msg));
    }
    if (typeof payload === "string" && payload.trim()) return new Error(payload);
    return new Error(fallbackMsg || "Request failed");
  }

  async function fetchWithTimeout(url, options, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.max(1000, timeoutMs || REQUEST_TIMEOUT_MS || 20000));
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
  }

  async function apiCall(action, payload) {
    if (!SCRIPT_URL) throw new Error("AXENTRO_SCRIPT_URL غير مضبوط في config.js");
    if (!APP_KEY) throw new Error("AXENTRO_APP_KEY غير مضبوط في config.js");

    const body = {
      app_key: APP_KEY,
      action: String(action || ""),
      token: getToken(),
      username: getUsername(),
      payload: payload || {}
    };

    let res;
    try {
      res = await fetchWithTimeout(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }, REQUEST_TIMEOUT_MS);
    } catch (e) {
      // AbortError / network
      if (e && e.name === "AbortError") throw new Error("انتهت مهلة الاتصال (Timeout)");
      throw new Error("تعذر الاتصال بالسيرفر (Network)");
    }

    const text = await res.text();
    const data = safeJsonParse(text);

    // If server returned non-JSON, keep a readable error
    if (!data) {
      if (!res.ok) throw new Error(`HTTP ${res.status} — ${text ? text.slice(0, 200) : "Bad Response"}`);
      throw new Error(text ? text.slice(0, 200) : "Invalid JSON response");
    }

    // Common OK flags
    const ok = !!(data.ok || data.success);
    if (!ok) {
      // Unauthorized patterns
      const errTxt = toStr(data.error || data.message || "");
      if (errTxt.toLowerCase().includes("unauthorized") || errTxt.includes("غير مصرح") || errTxt.includes("Token")) {
        // Auto logout on auth failure
        AxentroAuth.logout(true);
      }
      throw normalizeApiError(data, "API Error");
    }

    return data;
  }

  // ====== Auth ======
  const AxentroAuth = {
    isLoggedIn() {
      return !!getToken();
    },

    async me() {
      const out = await apiCall("me", {});
      // Cache user for role-based UI usage
      if (out && out.user) setUserCache(out.user);
      return out;
    },

    async login(username, password) {
      const out = await apiCall("login", { username, password });
      if (out && out.token) {
        setToken(out.token);
        setUsername(username);
        if (out.user) setUserCache(out.user);
      }
      return out;
    },

    logout(silent) {
      setToken("");
      setUsername("");
      setUserCache(null);
      if (!silent) {
        try { alert("تم تسجيل الخروج"); } catch (e) {}
      }
      // Always redirect to login
      if (typeof window !== "undefined") window.location.href = "login.html";
    },

    // Existing behavior: protect pages
    requireAuth() {
      if (!this.isLoggedIn()) {
        if (typeof window !== "undefined") window.location.href = "login.html";
        return;
      }
      // Optional background validation (non-blocking)
      // If server rejects => auto logout inside apiCall
      this.me().catch(() => {});
    },

    // Extra helpers (don’t break existing pages)
    getCachedUser() {
      return getUserCache();
    },
    hasRole(role) {
      const u = getUserCache();
      if (!u) return false;
      return String(u.role || "").toLowerCase() === String(role || "").toLowerCase();
    }
  };

  // ====== API Surface (same names used by pages) ======
  const AxentroApi = {
    ping: () => apiCall("ping", {}),

    // products
    getProducts: () => apiCall("getProducts", {}),
    createProduct: (p) => apiCall("createProduct", p),
    updateProduct: (p) => apiCall("updateProduct", p),
    deleteProduct: (p) => apiCall("deleteProduct", p),

    // purchases
    createPurchase: (p) => apiCall("createPurchase", p),
    getPurchasesLog: () => apiCall("getPurchasesLog", {}),
    getPurchaseById: (id) => apiCall("getPurchaseById", { id }),

    // sales
    createSale: (p) => apiCall("createSale", p),
    getSalesLog: () => apiCall("getSalesLog", {}),
    getSaleById: (id) => apiCall("getSaleById", { id }),

    // expenses
    getExpenses: () => apiCall("getExpenses", {}),
    createExpense: (p) => apiCall("createExpense", p),
    deleteExpense: (p) => apiCall("deleteExpense", p),

    // inventory / fifo
    getInventoryView: () => apiCall("getInventoryView", {}),
    rebuildInventoryView: () => apiCall("rebuildInventoryView", {}),

    // summaries
    getDashboardSummary: () => apiCall("getDashboardSummary", {}),
    getProfitSummary: (p) => apiCall("getProfitSummary", p || {}),
  };

  // Expose to window (existing pages expect these globals)
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;

})();
