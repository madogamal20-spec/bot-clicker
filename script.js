import puppeteer from "puppeteer";
import { readFile, writeFile } from "fs/promises";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TARGET_URL = process.env.TARGET_URL || "https://llamacoder.together.ai/share/v2/ZLj9CSyHTf69OnIb";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendTelegram(text) {
  if (!BOT_TOKEN || !CHAT_ID) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, text, parse_mode: "HTML" }),
    });
    await res.text();
  } catch {}
}

async function clickByText(page, text) {
  return page.evaluate((t) => {
    const all = document.querySelectorAll("button, a, div, span");
    const el = Array.from(all).find(
      (n) => (n.textContent || "").trim().toLowerCase() === t.trim().toLowerCase()
    );
    if (el) { el.click(); return true; }
    return false;
  }, text);
}

async function withRetry(fn, attempts = 3, delayMs = 2000) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) { last = e; await wait(delayMs); }
  }
  throw last;
}

async function openAndStart(page) {
  await withRetry(() => page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 }));
  await wait(5000);
  await clickByText(page, "Start Bot");
  await wait(3000);
}

async function readStatuses(page) {
  // انتظر أكثر لتجنّب القراءة المبكرة
  await wait(12000);

  const statuses = await page.evaluate(() => {
    const mapText = (t) => {
      const s = (t || "").toLowerCase();
      if (s.includes("strong buy")) return "BUY";
      if (s.includes("strong sell")) return "SELL";
      if (s.includes("neutral")) return "NEUTRAL";
      return null;
    };

    const out = [];

    // محاولة دقيقة على مستوى العناصر الشائعة
    const rows = document.querySelectorAll(".card, .row, .item, li, .coin, .asset, .col, .box");
    rows.forEach((r) => {
      const m = mapText((r.textContent || "").trim());
      if (m) out.push(m);
    });

    // fallback شامل
    if (out.length < 6) {
      const all = document.querySelectorAll("*");
      for (const n of all) {
        const m = mapText((n.textContent || "").trim());
        if (m) out.push(m);
        if (out.length >= 6) break;
      }
    }

    return out.slice(0, 6);
  });

  return statuses;
}

function trendFrom(statuses) {
  if (!statuses || statuses.length === 0) return "UNKNOWN";
  const buy = statuses.filter((s) => s === "BUY").length;
  const sell = statuses.filter((s) => s === "SELL").length;
  const neutral = statuses.filter((s) => s === "NEUTRAL").length;
  if (buy === 0 && sell === 0 && neutral === statuses.length) return "NEUTRAL_ALL";
  if (buy > sell) return "BUY";
  if (sell > buy) return "SELL";
  return "NEUTRAL_ALL";
}

const STATE_FILE = "last_state.txt";
async function getLastTrend() {
  try { return (await readFile(STATE_FILE, "utf8")).trim(); }
  catch { return "NONE"; }
}
async function setLastTrend(v) {
  try { await writeFile(STATE_FILE, v, "utf8"); } catch {}
}

async function withGlobalTimeout(promise, ms = 120000) {
  let to;
  const timer = new Promise((_, rej) => { to = setTimeout(() => rej(new Error("Timeout")), ms); });
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(to); }
}

async function taskStart() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  try {
    await withGlobalTimeout(openAndStart(page));
    await sendTelegram("✅ Bot started (hourly).");
  } catch (e) {
    await sendTelegram("⚠️ Start failed: " + (e?.message || e));
  } finally {
    await browser.close();
  }
}

async function taskAnalyze() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  try {
    await withGlobalTimeout(openAndStart(page));

    const statuses = await readStatuses(page);

    // حماية: لو أقل من 6 نتائج، لا ترسل، اعتبرها لسه بتحميل
    if (statuses.length < 6) return;

    const trend = trendFrom(statuses);
    const last = await getLastTrend();

    if (trend === "NEUTRAL_ALL") {
      if (last !== "NEUTRAL_ALL") await setLastTrend("NEUTRAL_ALL");
      return;
    }

    if (trend !== last) {
      await sendTelegram(`📊 Trend changed to <b>${trend}</b>
Statuses: ${statuses.join(", ")}`);
      await setLastTrend(trend);
    }
  } catch (e) {
    await sendTelegram("⚠️ Analyze failed: " + (e?.message || e));
  } finally {
    await browser.close();
  }
}

const arg = process.argv.find((a) => a.startsWith("--task=")) || "";
const mode = arg.replace("--task=", "");
if (mode === "start") taskStart();
else if (mode === "analyze") taskAnalyze();
else taskAnalyze();
