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
  assert(text.includes("CineLinterna"), "no muestra CineLinterna");
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

await test("ipad-controls-and-mp4", async () => {
  const ipad = await browser.newPage({
    viewport: { width: 1024, height: 768 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
  });
  await ipad.goto(`${base}/ver/sintel?pista=es`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await ipad.waitForTimeout(2200);
  const back = ipad.getByRole("link", { name: "Volver" });
  const enlarge = ipad.getByRole("button", { name: /Agrandar pantalla|Achicar pantalla/ });
  assert(await back.isVisible(), "volver no se ve en iPad");
  assert(await enlarge.isVisible(), "agrandar no se ve en iPad");
  const info = await ipad.evaluate(() => {
    const v = document.querySelector("video");
    const backBtn = document.querySelector('[aria-label="Volver"]');
    const enlargeBtn = document.querySelector('[aria-label="Agrandar pantalla"], [aria-label="Achicar pantalla"]');
    const br = backBtn?.getBoundingClientRect();
    const er = enlargeBtn?.getBoundingClientRect();
    return {
      src: v?.currentSrc || v?.src || "",
      playsInline: Boolean(v?.playsInline),
      controls: Boolean(v?.controls),
      backTop: br?.top ?? -1,
      enlargeTop: er?.top ?? -1,
      videoTop: v?.getBoundingClientRect().top ?? 0,
    };
  });
  assert(info.playsInline, "falta playsInline en iPad");
  assert(info.controls, "en iPad el vídeo debe mostrar controles nativos");
  assert(/\.mp4(\?|$)/i.test(info.src) || info.src.includes("archive.org"), `iPad no usa mp4: ${info.src}`);
  assert(info.backTop >= 0 && info.backTop < info.videoTop + 2, "volver quedó debajo del vídeo");
  assert(info.enlargeTop >= 0 && info.enlargeTop < info.videoTop + 2, "agrandar quedó debajo del vídeo");
  await ipad.screenshot({ path: "/workspace/screenshots/qa-ipad.png" });
  await ipad.close();
});

await test("tv-send-and-sala", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}/ver/sintel?pista=es`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1200);
  const tvBtn = page.getByRole("button", { name: "Ver en la tele" });
  assert(await tvBtn.isVisible(), "no hay botón de tele en el player");
  await tvBtn.click();
  await page.waitForTimeout(300);
  const dialog = page.getByRole("dialog");
  const text = await dialog.innerText();
  assert(/Apple TV|Chromecast|Sala de TV/i.test(text), "el panel de TV no explica cómo enviar");
  assert(await page.getByRole("button", { name: /Enviar a Apple TV o Chromecast/i }).isVisible(), "falta enviar");
  await page.goto(`${base}/tv`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(700);
  const sala = await page.locator("body").innerText();
  assert(sala.includes("Sala de TV"), "la sala de TV no carga");
  assert(sala.includes("Sintel") || sala.includes("Reproducir") || sala.includes("Para ver ahora"), "cartelera de TV vacía");
  await page.screenshot({ path: "/workspace/screenshots/qa-tv.png" });
});

await test("subtitle-generator", async () => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`${base}/ver/his-girl-friday?pista=es`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1400);
  const generate = page.getByRole("button", { name: /Generar subtítulos/i });
  assert(await generate.isVisible(), "no hay generador en un título sin subtítulos");
  await page.goto(`${base}/pelicula/detour`, { waitUntil: "domcontentloaded", timeout: 20000 });
  await page.waitForTimeout(800);
  const ficha = await page.locator("body").innerText();
  assert(/generar subtítulos/i.test(ficha), "la ficha no ofrece el generador");
  await page.goto(`${base}/ver/sintel?pista=es`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.waitForTimeout(1200);
  assert(
    (await page.getByRole("button", { name: /Generar subtítulos/i }).count()) === 0,
    "Sintel no debe pedir generar: ya tiene subtítulos oficiales",
  );
  const official = page.getByRole("button", { name: /Ocultar subtítulos|Subtítulos en español/ });
  assert((await official.count()) > 0, "Sintel debe mostrar el interruptor de subtítulos");
  await page.screenshot({ path: "/workspace/screenshots/qa-subs.png" });
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
