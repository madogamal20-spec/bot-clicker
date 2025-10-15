import puppeteer from "puppeteer";
import { readFile, writeFile } from "fs/promises";

// Env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TARGET_URL = process.env.TARGET_URL || "https://llamacoder.together.ai/share/v2/ZLj9CSyHTf69OnIb";

// Helpers
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

// find and click element by exact text (case-insensitive)
async function clickByText(page, text) {
  return page.evaluate((t) => {
    const all = document.querySelectorAll("button, a, div, span");
    const el = Array.from(all).find(
      (n) => (n.textContent || "").trim().toLowerCase() === t.trim().toLowerCase()
    );
    if (el) {
      el.click();
      return true;
    }
    return false;
  }, text);
}

// Retry wrapper
async function withRetry(fn, attempts = 3, delayMs = 2000) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await wait(delayMs);
    }
  }
  throw last;
}

// Open page and press Start Bot safely
async function openAndStart(page) {
  await withRetry(() => page.goto(TARGET_URL, { waitUntil: "domcontentloaded", timeout: 30000 }));
  await wait(5000);

  const clicked = await clickByText(page, "Start Bot");
  if (!clicked) {
    // ربما الزر متغير بالفعل لStop Bot، فنكمل
  }
  await wait(3000);

  // تأكيد ظهور Stop Bot إن أمكن
  const hasStop = await page.evaluate(() => {
    const all = document.querySelectorAll("*");
    return Array.from(all).some(
      (n) => (n.textContent || "").trim().toLowerCase() === "stop bot"
    );
  });
  // حتى لو لم يظهر، نكمل للتحليل
  return hasStop;
}

// Extract up to 6 statuses
async function readStatuses(page) {
  const texts = await page.evaluate(() => {
    const out = [];
    const nodes = document.querySelectorAll("*");
    for (const n of nodes) {
      const t = (n.textContent || "").trim();
      if (/(Strong Buy|Strong Sell|Neutral)/i.test(t)) out.push(t);
      if (out.length >= 100) break;
    }
    return out;
  });

  const statuses = [];
  for (const t of texts) {
    const low = t.toLowerCase();
    if (low.includes("strong buy")) statuses.push("BUY");
    else if (low.includes("strong sell")) statuses.push("SELL");
    else if (low.includes("neutral")) statuses.push("NEUTRAL");
    if (statuses.length === 6) break;
  }
  return statuses;
}

function trendFrom(statuses) {
  if (statuses.length === 0) return "UNKNOWN";
  const buy = statuses.filter((s) => s === "BUY").length;
  const sell = statuses.filter((s) => s === "SELL").length;
  const neutral = statuses.filter((s) => s === "NEUTRAL").length;

  if (buy === 0 && sell === 0 && neutral === statuses.length) return "NEUTRAL_ALL";
  if (buy > sell) return "BUY";
  if (sell > buy) return "SELL";
  return "NEUTRAL_ALL";
}

// Persist last trend
const STATE_FILE = "last_state.txt";
async function getLastTrend() {
  try { return (await readFile(STATE_FILE, "utf8")).trim(); }
  catch { return "NONE"; }
}
async function setLastTrend(v) {
  try { await writeFile(STATE_FILE, v, "utf8"); } catch {}
}

// Run with a global timeout to avoid hanging
async function withGlobalTimeout(promise, ms = 120000) {
  let to;
  const timer = new Promise((_, rej) => { to = setTimeout(() => rej(new Error("Timeout")), ms); });
  try { return await Promise.race([promise, timer]); }
  finally { clearTimeout(to); }
}

// Tasks
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
    await wait(8000);

    const statuses = await readStatuses(page);
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

// Entry
const arg = process.argv.find((a) => a.startsWith("--task=")) || "";
const mode = arg.replace("--task=", "");
if (mode === "start") taskStart();
else if (mode === "analyze") taskAnalyze();
else taskAnalyze();
