import { chromium } from "playwright";

const url = process.argv[2] || "http://127.0.0.1:8080/ver/sintel";
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") errors.push(msg.text());
});
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(8000);
const info = await page.evaluate(() => {
  const v = document.querySelector("video");
  return {
    hasVideo: Boolean(v),
    src: v?.currentSrc || v?.src || "",
    readyState: v?.readyState ?? -1,
    duration: v?.duration ?? 0,
    error: v?.error?.message ?? null,
    title: document.body.innerText.slice(0, 240),
  };
});
await page.screenshot({ path: "/workspace/screenshots/player.png" });
await browser.close();
console.log(JSON.stringify({ info, errors }, null, 2));
