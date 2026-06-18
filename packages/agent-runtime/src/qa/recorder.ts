/**
 * QA 录制器 — 支持 iframe 内操作追踪
 *
 * 核心逻辑：
 * - 监听所有 frame（含 iframe）的创建和加载
 * - 注入点击追踪脚本到每个 same-origin frame
 * - 识别页签（el-tabs__item）和按钮点击
 * - URL 白名单过滤
 */
import type { QaRecordEvent, QaRecordEventKind } from "@lets-talk/shared-types";
import { randomUUID } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page, type Frame } from "playwright";
import { createSession, appendEvent, setBrowserUrl, finalizeSession, type RecordedSession } from "./store.js";
import { publishEvent } from "./event-bus.js";

let currentSession: RecordedSession | null = null;
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
let groupSeq = 0;
const injectedFrames = new Set<string>();

const DEFAULT_WHITELIST = [
  "/api/", "/smps/api/", "/smr/api/", "/smsbm/api/", "/smrm/api/", "/smrw/api/",
  "/smda/api/", "/smcm/api/", "/smfs/api/", "/smrts/api/", "/smam/api/",
  "/smdm/api/", "/smdmt/api/", "/smc/api/", "/smbe/api/", "/smip/api/",
  "/smcs/api/", "/smfm/api/",
];
let urlWhitelist: string[] = [...DEFAULT_WHITELIST];

export function matchWhitelist(url: string): boolean {
  return urlWhitelist.some((p) => url.includes(p));
}
export function getWhitelist(): string[] { return [...urlWhitelist]; }
export function setWhitelist(p: string[]): void { urlWhitelist = [...p]; }
export function resetWhitelist(): void { urlWhitelist = [...DEFAULT_WHITELIST]; }

/** 点击追踪脚本 — 注入到每个 frame 中 */
const TRACKER_SCRIPT = `
{
  const K = '__qa_tk';
  if (!document[K]) {
    document[K] = true;
    const findEl = (el) => {
      if (!el || el === document.body || el === document.documentElement) return null;
      if (el.matches?.('button,a,[role=button],[role=tab],.el-tabs__item,.el-button')) return el;
      return el.closest?.('button,a,[role=button],[role=tab],.el-tabs__item,.el-button') || null;
    };
    document.addEventListener('pointerdown', (e) => {
      const el = findEl(e.target);
      if (!el) return;
      let text = (el.innerText || el.textContent || el.value || '').trim().slice(0, 60);
      if (!text) text = el.title || el.getAttribute('aria-label') || '';
      if (!text) text = el.tagName;
      const isTab = el.getAttribute('role') === 'tab' || el.classList?.contains('el-tabs__item');
      parent.postMessage({ type: '__qa_act', data: { text, tag: el.tagName, isTab, ts: Date.now() } }, '*');
    }, true);
  }
}
`;

/** 检测 URL 变化（iframe 或主页面） */
function getCleanUrl(url: string): string {
  try { return url.split("?")[0]!.split("#")[0]!.replace(/\/+$/, ""); } catch { return url; }
}

/** 记录事件 */
function record(kind: QaRecordEventKind, summary: string, detail: Record<string, unknown>, extra?: { statusCode?: number; method?: string; url?: string; traceId?: string; }): QaRecordEvent | null {
  if (!currentSession) return null;
  const event: QaRecordEvent = { kind, summary, timestamp: new Date().toISOString(), detail, ...extra };
  appendEvent(currentSession, event);
  publishEvent(currentSession.sessionId, event);
  return event;
}

/** 打开浏览器 */
export async function openBrowser(chatSessionId: string, targetUrl: string = "http://localhost:9999/ptp-page/index"): Promise<{ sessionId: string; ok: boolean; error?: string }> {
  try {
    currentSession = createSession(chatSessionId);
    const sessionId = currentSession.sessionId;
    groupSeq = 0;
    injectedFrames.clear();

    const browser = await chromium.launch({ headless: false, args: ["--start-maximized"] });
    browserInstance = browser;
    const context = await browser.newContext();
    const page = await context.newPage();
    pageInstance = page;

    // 设置 Node.js 端回调（供页面内 JS 调用）
    await page.exposeFunction("__qa_onAct", (data: string) => {
      try {
        const act = JSON.parse(data) as { text: string; tag: string; isTab: boolean; ts: number };
        if (!act.text && !act.tag) return;
        groupSeq++;
        if (act.isTab) {
          record("TAB", `页签: ${act.text || act.tag}`, { ...act, groupSeq }, {});
        } else {
          record("CLICK", `点击「${act.text || act.tag}」`, { ...act, groupSeq }, {});
        }
      } catch {}
    });

    // 用 addInitScript 设置消息监听（持久化，导航不丢）
    await page.addInitScript(() => {
      window.addEventListener("message", (e) => {
        if (e.data?.type === "__qa_act" && typeof (window as any).__qa_onAct === "function") {
          (window as any).__qa_onAct(JSON.stringify(e.data.data));
        }
      });
    });

    // 导航到目标页后再注入 iframe 追踪
    const injectAllFrames = async () => {
      await page.evaluate(() => {
        const K = "__qa_tk";

        const inject = () => {
          for (const f of document.querySelectorAll("iframe")) {
            try {
              const d = f.contentDocument;
              if (!d || (d as any)[K]) continue;
              (d as any)[K] = true;
              d.addEventListener("pointerdown", (e: Event) => {
                // 匹配按钮/链接/可点击元素，最后尝试 td（操作列）
                const el = (e.target as Element).closest("button,a,[role=button],[role=tab],.el-tabs__item,.el-button,.el-link,td,th") as HTMLElement | null;
                if (!el) return;
                // 优先用被点击元素本身的文本（而不是 td 的整格文本）
                let text = (e.target as HTMLElement).innerText?.trim()?.slice(0, 60)
                  || (e.target as HTMLElement).textContent?.trim()?.slice(0, 60)
                  || "";
                if (!text || text.length > 40) {
                  // 被点击元素文本不合适时（如空白或过长），用匹配到的元素
                  text = (el.innerText || el.textContent || (el as any).value || "").trim().slice(0, 40);
                }
                if (!text) text = el.title || el.getAttribute("aria-label") || "";
                if (!text) text = el.tagName;
                const isTab = el.getAttribute("role") === "tab" || el.classList?.contains("el-tabs__item");
                parent.postMessage({ type: "__qa_act", data: { text, tag: el.tagName, isTab, ts: Date.now() } }, "*");
              }, true);
            } catch {}
          }
        };
        inject();
        const obs = new MutationObserver(() => inject());
        const target = document.body || document.documentElement;
        if (target) obs.observe(target, { childList: true, subtree: true });
      }).catch(() => {});
    };

    // 监听 iframe URL 变化（去重：同一 label 2 秒内不重复记录）
    let lastPageLabel = "";
    let lastPageTime = 0;
    page.on("framenavigated", async (frame) => {
      if (frame === page.mainFrame()) return;
      const url = frame.url();
      if (!url || url === "about:blank" || !url.includes("/smifc/web/")) return;
      let label = "workspace";
      try {
        const parsed = new URL(url);
        // menuname 在 hash 内（如 #/smrts/...?menuname=支付计划申请）
        const hash = parsed.hash;
        const qIdx = hash.indexOf("?");
        let menuName = "";
        if (qIdx >= 0) {
          const hp = new URLSearchParams(hash.slice(qIdx + 1));
          menuName = hp.get("menuname") || hp.get("menuName") || "";
        }
        if (menuName) {
          label = decodeURIComponent(menuName);
        } else {
          // 没有菜单名参数，用 hash 路由第一段
          const route = qIdx >= 0 ? hash.slice(0, qIdx) : hash;
          const seg = route.replace(/^#\//, "").split("/")[0];
          if (seg) label = "/" + seg;
        }
      } catch {}
      // 去重：同一 label 2 秒内不重复触发
      const now = Date.now();
      if (label === lastPageLabel && now - lastPageTime < 2000) return;
      lastPageLabel = label;
      lastPageTime = now;
      groupSeq++;
      record("PAGE", label, { url, iframe: true });
    });

    // 监听网络请求
    page.on("response", async (response) => {
      const url = response.url();
      if (!matchWhitelist(url)) return;
      const status = response.status();
      const headers = response.headers();
      const method = response.request().method();
      const pathname = getCleanUrl(url);
      const tid = headers["traceid"] || headers["traceId"] || "";
      record("REQUEST", `${method} ${pathname}`, { url: pathname, fullUrl: url, method, status, traceId: tid },
        { statusCode: status, method, url: pathname, traceId: tid });
    });

    // 导航到目标
    try {
      await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    } catch (e) {
      console.warn("qa/navigate:", e instanceof Error ? e.message : e);
    }

    record("PAGE", "登录页", { url: targetUrl });
    setBrowserUrl(currentSession, targetUrl);

    // 注入 iframe 追踪（首次 + 定时刷新）
    await injectAllFrames();
    setInterval(() => { injectAllFrames().catch(() => {}); }, 3000);

    return { sessionId, ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("qa/openBrowser error:", error);
    return { sessionId: "", ok: false, error };
  }
}

/** 关闭浏览器 */
export async function closeBrowser(): Promise<boolean> {
  try {
    if (pageInstance) await pageInstance.close().catch(() => {});
    if (browserInstance) await browserInstance.close().catch(() => {});
    pageInstance = null; browserInstance = null;
    if (currentSession) { finalizeSession(currentSession); currentSession = null; }
    return true;
  } catch { return false; }
}

export function getCurrentSession() { return currentSession; }
export function stopRecording() {
  if (!currentSession) return null;
  finalizeSession(currentSession);
  const s = currentSession; currentSession = null; return s;
}
export function getRecordingStatus() {
  if (!currentSession) return { active: false, sessionId: null, eventCount: 0, browserUrl: null };
  return { active: true, sessionId: currentSession.sessionId, eventCount: currentSession.events.length, browserUrl: currentSession.browserUrl };
}
