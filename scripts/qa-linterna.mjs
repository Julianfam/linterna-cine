import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.argv[2] || "http://127.0.0.1:8080";
await mkdir("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });

async function shot(name, url, size) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1800);
  const text = await page.locator("body").innerText();
  await page.screenshot({ path: `/workspace/screenshots/${name}.png`, fullPage: false });
  await page.close();
  return { name, url, text: text.slice(0, 400), errors };
}

const results = [];
results.push(await shot("home", `${base}/`, { width: 1280, height: 800 }));
results.push(await shot("home-mobile", `${base}/`, { width: 390, height: 844 }));
results.push(
  await shot("film", `${base}/pelicula/night-of-the-living-dead`, { width: 1280, height: 800 }),
);
results.push(await shot("search", `${base}/buscar`, { width: 1280, height: 800 }));
results.push(await shot("login", `${base}/login`, { width: 390, height: 844 }));

await browser.close();
console.log(JSON.stringify(results, null, 2));
