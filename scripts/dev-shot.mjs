/**
 * 用 CDP 驱动无头 Chrome：导航、点按钮、截图、抓控制台。
 *
 * 用法：
 *   node scripts/dev-shot.mjs <url> [out.png] [js表达式] [等待毫秒]
 * 相对文件名保存在项目旁的 RhineLabUI-screenshots。也可显式传入绝对路径。
 *
 * 例：
 *   node scripts/dev-shot.mjs http://127.0.0.1:5173/ shot.png "document.querySelector('#startup-button').click()" 9000
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { testScreenshotPath } from "./test-screenshot-path.mjs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9333 + Math.floor(Math.random() * 200);
const url = process.argv[2] || "http://127.0.0.1:5173/";
const filename = process.argv[3] || "shot.png";
const out = path.isAbsolute(filename) ? filename : testScreenshotPath(filename);
const expr = process.argv[4] || "";
const settle = Number(process.argv[5] || 9000);

const profile = path.join(os.tmpdir(), `rhine-cdp-${Date.now()}`);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--ignore-gpu-blocklist",
    "--use-angle=d3d11",
    "--no-sandbox",
    "--hide-scrollbars",
    "--mute-audio",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    "--window-size=1440,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, ms = 25000, step = 200) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < ms) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (error) {
      last = error;
    }
    await sleep(step);
  }
  throw last ?? new Error("timeout");
}

let ws;
try {
  const target = await waitFor(async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const list = await res.json();
    return list.find((t) => t.type === "page");
  });

  ws = new WebSocket(target.webSocketDebuggerUrl);
  let seq = 0;
  const pending = new Map();
  const logs = [];

  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
      return;
    }
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = (msg.params.args ?? [])
        .map((a) => a.value ?? a.description ?? a.type)
        .join(" ");
      logs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d?.exception?.description ?? d?.text}`);
    } else if (msg.method === "Log.entryAdded") {
      logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
    }
  });
  await new Promise((r) => ws.addEventListener("open", r));

  const send = (method, params = {}) => {
    const id = ++seq;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Page.navigate", { url });
  await sleep(6000);

  if (expr) {
    const res = await send("Runtime.evaluate", {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    const value = res.result?.result?.value ?? res.result?.exceptionDetails?.text;
    console.log("eval:", JSON.stringify(value));
    await sleep(settle);
  }

  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
  console.log("saved:", out, fs.statSync(out).size, "bytes");
  console.log("--- console ---");
  console.log(logs.slice(-40).join("\n") || "(none)");
} finally {
  try {
    ws?.close();
  } catch {
    /* ignore */
  }
  chrome.kill();
}
