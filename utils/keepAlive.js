// utils/keepAlive.js
const https = require("https");

/*
=================================
KEEP ALIVE — PING OWN SERVER
Render spins down after 15min
of inactivity on free tier
=================================
*/

const RENDER_URL = process.env.RENDER_EXTERNAL_URL; // auto-set by Render

const keepAlive = () => {
  if (!RENDER_URL) {
    console.warn("⚠️  RENDER_EXTERNAL_URL not set, skipping keep-alive");
    return;
  }

  https
    .get(RENDER_URL, (res) => {
      console.log(`✅ Keep-alive ping sent — status: ${res.statusCode}`);
    })
    .on("error", (err) => {
      console.error("❌ Keep-alive ping failed:", err.message);
    });
};

/*
=================================
CRON — PING EVERY 14 MINUTES
(Render sleeps after 15min)
=================================
*/

const startKeepAlive = () => {
  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  console.log("🔁 Keep-alive cron started");
  setInterval(keepAlive, INTERVAL_MS);

  // Ping immediately on startup too
  keepAlive();
};

module.exports = { startKeepAlive };