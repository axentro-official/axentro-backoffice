/* Axentro Backoffice - Shared App Logic (Google Auth + API helpers)
   Notes:
   - الواجهة على GitHub Pages "لا يمكن" حمايتها 100% لوحدها.
   - الحماية الحقيقية هنا: كل قراءة/كتابة تتم عبر Google Apps Script الذي يطبق Whitelist/Blacklist.
   - تسجيل الدخول: Google Identity Services (GIS) + Apps Script token verification.
*/
(function(){
  "use strict";

  // ====== Config ======
  const DEFAULTS = {
    GAS_WEB_APP_URL: "",
    GOOGLE_CLIENT_ID: "",
  };

  const CFG = Object.assign({}, DEFAULTS, (window.AXENTRO_CONFIG || {}));

  // ====== Session storage ======
  const STORAGE_KEY = "axentro_session_v2"; // {token,email,role,expiresAt}

  function nowMs(){ return Date.now(); }

  function getSession(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (!s || !s.token || !s.expiresAt) return null;
      if (Number(s.expiresAt) <= nowMs()) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return s;
    } catch(e) {
      console.error("Failed to parse session:", e);
      return null;
    }
  }

  function setSession(sess){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sess));
  }

  function clearSession(){
    localStorage.removeItem(STORAGE_KEY);
  }

  function buildNextParam(){
    return encodeURIComponent(location.pathname.split("/").pop() || "dashboard.html");
  }

  function redirectToLogin(){
    location.replace("login.html?next=" + buildNextParam());
  }

  // ====== API helper ======
  /**
   * Helper for making API calls to the Google Apps Script backend.
   * @param {string} action - The action to perform on the backend.
   * @param {object} [payload] - The data to send with the action.
   * @returns {Promise<object>} The JSON response from the server.
   * @throws {Error} If the API call fails or the server returns an error.
   */
  async function apiCall(action, payload){
    if (!CFG.GAS_WEB_APP_URL) {
      throw new Error("GAS_WEB_APP_URL is not set in AXENTRO_CONFIG.");
    }
    const sess = getSession();
    const body = {
      ...(payload || {}),
      action,
      session_token: sess ? sess.token : null
    };

    const res = await fetch(CFG.GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error(`Failed to parse JSON response from server. Status: ${res.status}`);
    }
    if (!res.ok || data.ok === false) {
      const msg = data && (data.error || data.message) ? (data.error || data.message) : ("HTTP " + res.status);
      const err = new Error(msg);
      err.data = data;
      throw err;
    }
    return data;
  }

  // ====== Auth facade (keeps old API names) ======
  /** @namespace AxentroAuth */
  const AxentroAuth = {
    cfg: CFG,

    /**
     * Checks if the user is currently authenticated.
     * @returns {boolean} True if there is an active session.
     */
    isAuthed(){
      return !!getSession();
    },

    /**
     * Retrieves the current session object.
     * @returns {({token: string, email: string, role: string, expiresAt: number})|null} The session object or null.
     */
    getSession(){
      return getSession();
    },

    /**
     * If the user is not authenticated, redirects to the login page.
     */
    requireAuth(){
      if (!this.isAuthed()) redirectToLogin();
    },

    /**
     * Logs the user out by clearing the session and redirecting to login.
     */
    logout(){
      clearSession();
      redirectToLogin();
    },

    /**
     * Attempts to log in using a Google ID token.
     * @param {string} idToken - The ID token from Google Identity Services.
     * @returns {Promise<{status:'APPROVED'|'PENDING'|'BLOCKED'|'REJECTED', ...}>}
     */
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

    /**
     * Fetches the current user's profile from the backend.
     * @returns {Promise<object>}
     */
    async me(){
      return apiCall("auth_me", {});
    }
  };

  // ====== API facade ======
  /** @namespace AxentroApi */
  const AxentroApi = {
    /**
     * Fetches the list of products.
     * @returns {Promise<object>}
     */
    async getProducts(){
      return apiCall("get_products", {});
    },
    /**
     * Creates a new purchase record.
     * @param {object} purchasePayload - The details of the purchase.
     * @returns {Promise<object>}
     */
    async createPurchase(purchasePayload){
      return apiCall("create_purchase", purchasePayload);
    }
  };

  // ====== Shared UI & Helpers ======
  /** @namespace AxentroUtils */
  const AxentroUtils = {
    /**
     * Displays a short-lived notification toast.
     * @param {string} msg The message to display.
     */
    showToast(msg) {
      const toast = document.getElementById("toast");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("show");
      if (toast.timer) clearTimeout(toast.timer);
      toast.timer = setTimeout(() => toast.classList.remove("show"), 2200);
    },

    /**
     * Converts a number to its Arabic word representation for currency.
     * @param {number} number The number to convert.
     * @returns {string} The number in Arabic words.
     */
    numberToArabicWords(number) {
      number = Number(number) || 0;
      if (number === 0) return "صفر جنيه مصري فقط لا غير";
      const ones = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة", "أحد عشر", "اثنا عشر", "ثلاثة عشر", "أربعة عشر", "خمسة عشر", "ستة عشر", "سبعة عشر", "ثمانية عشر", "تسعة عشر"];
      const tens = ["", "عشرة", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
      const hundreds = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
      function subThousand(n) {
        n = Number(n); if (n === 0) return "";
        let res = []; const h = Math.floor(n / 100); const rest = n % 100;
        if (h) res.push(hundreds[h]);
        if (rest) { if (rest < 20) res.push(ones[rest]); else { const t = Math.floor(rest / 10), o = rest % 10; if (o) res.push(ones[o] + " و " + tens[t]); else res.push(tens[t]); } }
        return res.join(" و ");
      }
      let parts = [];
      const million = Math.floor(number / 1000000); const thousand = Math.floor((number % 1000000) / 1000); const rest = number % 1000;
      if (million) { if (million === 1) parts.push("مليون"); else if (million === 2) parts.push("مليونان"); else parts.push(subThousand(million) + " مليون"); }
      if (thousand) { if (thousand === 1) parts.push("ألف"); else if (thousand === 2) parts.push("ألفان"); else parts.push(subThousand(thousand) + " ألف"); }
      if (rest) parts.push(subThousand(rest));
      return `${parts.join(" و ")} جنيه مصري فقط لا غير`;
    }
  };

  // Expose globally
  window.AxentroAuth = AxentroAuth;
  window.AxentroApi = AxentroApi;
  window.AxentroUtils = AxentroUtils;

})();
