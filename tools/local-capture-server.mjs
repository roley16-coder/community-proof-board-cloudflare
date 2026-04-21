import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { chromium } from "playwright";

const port = Number(process.env.LOCAL_CAPTURE_PORT || 8788);
const authToken = process.env.LOCAL_CAPTURE_TOKEN || "";
const browserPath = process.env.LOCAL_CAPTURE_BROWSER_PATH || "";
const profileDir = process.env.LOCAL_CAPTURE_PROFILE_DIR || path.join(os.homedir(), ".community-proof-board", "browser-profile");

await fs.mkdir(profileDir, { recursive: true });

const context = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  executablePath: browserPath || undefined,
  viewport: { width: 1920, height: 1280 },
  deviceScaleFactor: 1
});

let activePage = context.pages()[0] || await context.newPage();

console.log(`[local-capture] running on http://127.0.0.1:${port}`);
console.log(`[local-capture] profile dir: ${profileDir}`);
console.log("[local-capture] first run tip: open FMKorea once in this window and solve any human check manually.");

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      return sendJson(res, 200, { ok: true });
    }

    if (req.method !== "POST" || req.url !== "/capture") {
      return sendJson(res, 404, { error: "Not found" });
    }

    if (authToken && req.headers["x-capture-token"] !== authToken) {
      return sendJson(res, 401, { error: "Invalid token" });
    }

    const body = await readJson(req);
    const url = String(body?.url || "").trim();
    if (!url) {
      return sendJson(res, 400, { error: "url is required" });
    }

    const screenshot = await captureWithLocalBrowser(url);
    res.writeHead(200, { "content-type": "image/png", "cache-control": "no-store" });
    res.end(screenshot);
  } catch (error) {
    console.error("[local-capture] error", error);
    sendJson(res, 500, { error: error.message || "capture failed" });
  }
});

server.listen(port);

async function captureWithLocalBrowser(url) {
  const page = await ensureActivePage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
  await waitForUsefulRender(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1200);
  return await page.screenshot({ type: "png", fullPage: false });
}

async function ensureActivePage() {
  if (activePage && !activePage.isClosed()) {
    return activePage;
  }

  activePage = context.pages().find((page) => !page.isClosed()) || await context.newPage();
  return activePage;
}

async function waitForUsefulRender(page) {
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => null);

  await page.waitForFunction(() => {
    const humanCheckText = document.body?.innerText || "";
    if (humanCheckText.includes("Verify you are human") || humanCheckText.includes("사람인지 확인")) {
      return false;
    }

    const bodyImages = [...document.querySelectorAll(
      "#new_contents img, .view-content img, img.maxImg, img[src*='img2.quasarzone.com/editor/'], img[src*='/qb_partnersaleinfo/']"
    )];

    if (bodyImages.length === 0) {
      return document.body && document.body.innerText.trim().length > 100;
    }

    return bodyImages.some((img) => img.complete && img.naturalWidth > 0);
  }, { timeout: 30000 }).catch(() => null);

  await page.evaluate(async () => {
    const rendered = document.querySelector("#new_contents");
    const hiddenSource = document.querySelector("#org_contents");
    if (rendered && !rendered.children.length && hiddenSource && "value" in hiddenSource) {
      rendered.innerHTML = hiddenSource.value;
    }

    const targetImages = [...document.querySelectorAll(
      "#new_contents img, .view-content img, img.maxImg, img[src*='img2.quasarzone.com/editor/'], img[src*='/qb_partnersaleinfo/']"
    )].slice(0, 10);

    for (const img of targetImages) {
      img.loading = "eager";
      img.decoding = "sync";
      if (img.dataset?.src && !img.src) img.src = img.dataset.src;
      if (img.dataset?.original && !img.src) img.src = img.dataset.original;
    }

    await Promise.all(targetImages.map(async (img) => {
      if (img.complete && img.naturalWidth > 0) return;
      try {
        if (typeof img.decode === "function") await img.decode();
      } catch (_) {}
    }));
  }).catch(() => null);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}
