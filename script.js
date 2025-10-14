import puppeteer from 'puppeteer';

async function run() {
  const url = 'https://llamacoder.together.ai/share/v2/ZLj9CSyHTf69OnIb';
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox','--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });

  // انتظر 5 ثواني
  await page.waitForTimeout(5000);

  // اضغط زر Start Bot
  const [btn] = await page.$x("//button[contains(., 'Start Bot')]");
  if (btn) {
    await btn.click();
    console.log('Clicked Start Bot');
  } else {
    console.log('Start Bot not found');
  }

  await page.waitForTimeout(3000);
  await browser.close();
}

run().catch(e=>{ console.error(e); process.exit(1); });
