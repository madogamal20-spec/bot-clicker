// ========== Config from env ==========
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TARGET_URL = process.env.TARGET_URL || "";

// ========== Utils ==========
async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function tg(text){
  if(!TOKEN || !CHAT_ID) { console.log("No Telegram creds; skipping send."); return; }
  const url = `https://api.telegram.org/bot${TOKEN}/sendMessage`;
  const body = { chat_id: CHAT_ID, text, parse_mode: "HTML", disable_web_page_preview: true };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(body)
    });
    const ok = res.ok;
    console.log("Telegram send:", ok ? "OK" : `HTTP ${res.status}`);
  } catch(e){ console.log("Telegram error:", e.message); }
}

// ========== Task selection ==========
const argTask = (process.argv.find(a => a.startsWith("--task=")) || "").split("=")[1];
const task = argTask || "auto";

// إذا كان الـ workflow ما بيمررش --task، هنقرر حسب الدقيقة الحالية:
// الدقيقة % 60 == 0 → مهمة الساعة، غير كده → تحليل كل 10 دقائق
function decideAuto(){
  const m = new Date().getUTCMinutes();
  if (m === 0) return "start";
  if (m % 10 === 0) return "analyze";
  // لو التشغيل اليدوي في أي وقت، نخليها تحليل بشكل افتراضي
  return "analyze";
}
const chosen = task === "auto" ? decideAuto() : task;

// ========== Core actions ==========
async function startTask(){
  console.log("START task: pressing Start Bot and sending hourly message");
  // محاكاة ضغط زر Start على الرابط الرئيسي (استدعاء GET بسيط)
  if (TARGET_URL){
    try {
      const res = await fetch(TARGET_URL, { method:"GET" });
      console.log("Start page status:", res.status);
    } catch(e){ console.log("Start page error:", e.message); }
  } else {
    console.log("TARGET_URL is empty; skipping start click.");
  }
  await tg("✅ Bot started (hourly).");
}

async function analyzeTask(){
  console.log("ANALYZE task: checking 6 statuses and notifying on change");
  // هنا التحليل الفعلي: اجلب الحالات واحسب الاتجاه
  // لأغراض الاختبار هنطبع فقط
  // استبدل الجزء التالي بمنطقك الحقيقي
  const statuses = ["BUY","BUY","BUY"]; // مثال
  console.log("Statuses:", statuses.join(", "));
  // إشعار تجريبي عند تغيير افتراضي (يمكن ربطه بذاكرة state.json لاحقًا)
  await tg("ℹ️ Analysis run finished (no change detected).");
}

// ========== Main ==========
(async()=>{
  console.log("Task chosen:", chosen);
  if (chosen === "start") {
    await startTask();
  } else {
    await analyzeTask();
  }
})();
