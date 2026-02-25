// config.js
// ضع هذا الملف قبل app.js في كل صفحة:
// <script src="./config.js"></script>
// <script src="./app.js"></script>

// إعدادات عامة للواجهة الأمامية
window.AXENTRO_CONFIG = {
  // رابط Google Apps Script Web App (Deployment: Web app) وينتهي بـ /exec
  GAS_WEB_APP_URL: "https://script.google.com/macros/s/AKfycbwNnxOZefML1MZ7dX0sMprbQn1YGnNEVNGR2gOBYlVIGoNblFWTo22_C1ZtKf95xTL4Pg/exec",

  // Google OAuth Client ID (GIS)
  GOOGLE_CLIENT_ID: "543538686182-r5i5f5al9brh5q7n3rmqq9p36t438jqf.apps.googleusercontent.com",

  // اختيارية: للمساعدة أثناء التطوير
  DEBUG: false,
};
