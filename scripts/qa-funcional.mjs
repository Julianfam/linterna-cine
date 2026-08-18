import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = (process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
await mkdir("/workspace/screenshots", { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];

async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - started });
    console.log(`PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, ms: Date.now() - started, error: String(err?.message || err) });
    console.error(`FAIL  ${name}: ${err?.message || err}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));

await test("home-render", async () => {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1600);
  const text = await page.locator("body").innerText();
  assert(text.includes("Linterna"), "no muestra Linterna");
  assert(text.includes("Reproducir"), "no muestra Reproducir");
  assert(text.includes("En español") || text.includes("Metrópolis"), "cartelera vacía");
  await page.screenshot({ path: "/workspace/screenshots/qa-home.png" });
});

await test("film-page", async () => {
  await page.goto(`${base}/pelicula/sintel`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(900);
  const text = await page.locator("body").innerText();
  assert(text.includes("Sintel"), "ficha de Sintel no carga");
  assert(text.includes("Reproducir"), "sin botón reproducir");
});

await test("player-starts", async () => {
  await page.goto(`${base}/ver/sintel?pista=es`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(2500);
  const info = await page.evaluate(() => {
    const v = document.querySelector("video");
    return {
      src: v?.currentSrc || v?.src || "",
      ready: v?.readyState ?? 0,
      dur: v?.duration || 0,
    };
  });
  assert(Boolean(info.src), "el vídeo no tiene fuente");
  assert(info.ready >= 2 || info.dur > 0, `el vídeo no arrancó (ready=${info.ready})`);
  await page.screenshot({ path: "/workspace/screenshots/qa-player.png" });
});

await test("fullscreen-toggle", async () => {
  const enlarge = page.getByRole("button", { name: "Agrandar pantalla" });
  assert((await enlarge.count()) > 0, "no hay botón agrandar");
  const before = await page.evaluate(() => {
    const r = document.querySelector("video")?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0 };
  });
  await enlarge.click();
  await page.waitForTimeout(250);
  const after = await page.evaluate(() => {
    const v = document.querySelector("video");
    const r = v?.getBoundingClientRect();
    return {
      w: r?.width ?? 0,
      h: r?.height ?? 0,
      shrink: Boolean(document.querySelector('[aria-label="Achicar pantalla"]')),
    };
  });
  assert(after.shrink, "no cambió a achicar");
  assert(after.w >= before.w - 1 && after.h >= before.h - 1, "no agrandó el recuadro");
  await page.getByRole("button", { name: "Achicar pantalla" }).click();
  await page.waitForTimeout(200);
  const back = await page.evaluate(() => Boolean(document.querySelector('[aria-label="Agrandar pantalla"]')));
  assert(back, "no volvió al marco");
});

await test("search-catalog", async () => {
  await page.goto(`${base}/buscar?q=romero&fuente=sala`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(700);
  const text = await page.locator("body").innerText();
  assert(text.toLowerCase().includes("muertos") || text.toLowerCase().includes("romero"), "búsqueda de cartelera vacía");
});

await test("archive-search", async () => {
  await page.goto(`${base}/buscar?q=chaplin&fuente=archivo`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(4500);
  const text = await page.locator("body").innerText();
  assert(/copias encontradas|Chaplin|Agregar/i.test(text), "el archivo no devolvió resultados");
  await page.screenshot({ path: "/workspace/screenshots/qa-archivo.png" });
});

await test("mobile-no-overflow", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(800);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
  assert(!overflow, "hay desborde horizontal en móvil");
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(
  JSON.stringify(
    {
      base,
      passed: results.filter((r) => r.ok).length,
      failed: failed.length,
      consoleErrors,
      results,
    },
    null,
    2,
  ),
);
if (failed.length) process.exit(1);
