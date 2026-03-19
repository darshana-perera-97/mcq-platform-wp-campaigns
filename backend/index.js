const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { IncomingForm } = require("formidable");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");

const PORT = Number.parseInt(process.env.PORT || "3366", 10);
const HOST = process.env.HOST || "0.0.0.0";

const LOG_SUCCESS =
  String(process.env.LOG_SUCCESS || "").toLowerCase() === "1" ||
  String(process.env.LOG_SUCCESS || "").toLowerCase() === "true";

function logRequestResult(req, statusCode, body) {
  const method = req?.method ? String(req.method) : "HTTP";
  const host = req?.headers?.host ? String(req.headers.host) : "localhost";
  let pathname = "";
  try {
    pathname = new URL(req?.url || "/", `http://${host}`).pathname;
  } catch (_) {
    pathname = req?.url ? String(req.url) : "";
  }

  const okFlag = body && typeof body === "object" ? body.ok : undefined;
  const hasError = statusCode >= 400 || okFlag === false || Boolean(body?.error);
  const isSuccessAction = method === "POST" || method === "DELETE";
  if (!hasError && (!LOG_SUCCESS || !isSuccessAction)) return;

  const errorText =
    body && typeof body === "object" && (body.error || body.message) ? String(body.error || body.message) : null;

  // eslint-disable-next-line no-console
  if (hasError) {
    // eslint-disable-next-line no-console
    console.error(`[backend] ${method} ${pathname} -> ${statusCode}` + (errorText ? ` | error: ${errorText}` : ""));
  } else {
    // eslint-disable-next-line no-console
    console.log(`[backend] ${method} ${pathname} -> ${statusCode}`);
  }
}

function sendJson(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  if (statusCode >= 400) {
    // eslint-disable-next-line no-console
    console.error("[backend] HTTP error ->", statusCode, body?.error || body?.message || body);
  }
  res.end(json);
}

function sendJsonCors(req, res, statusCode, body) {
  const origin = req.headers.origin || "*";
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
  });
  logRequestResult(req, statusCode, body);
  res.end(json);
}

function safeExtFromOriginalFilename(name) {
  if (!name) return "";
  const ext = path.extname(String(name)).toLowerCase();
  if (!ext) return "";
  // allow common media extensions only
  const ok = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".mp4", ".webm", ".mov", ".m4v"]);
  return ok.has(ext) ? ext : "";
}

function readJsonArrayIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function writeJsonArrayAtomic(targetPath, items) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(items, null, 2), "utf8");
  fs.renameSync(tmpPath, targetPath);
}

function sendFile(res, filePath, contentType) {
  try {
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": stat.size,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (_) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

function getContentTypeByExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".ico":
      return "image/x-icon";
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".map":
      return "application/json; charset=utf-8";
    case ".woff":
      return "font/woff";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function tryServeFrontendBuild(req, res, url) {
  const buildDir = path.join(__dirname, "..", "frontend", "build");
  if (!fs.existsSync(buildDir)) return false;

  const pathname = url.pathname || "/";
  const rel = pathname === "/" ? "/index.html" : pathname;
  const safeRel = rel.replace(/\\/g, "/");

  // Block obvious traversal
  if (safeRel.includes("..")) return false;

  const filePath = path.join(buildDir, safeRel);

  // If the request maps to a file, serve it. Otherwise serve index.html (SPA fallback).
  let resolved = filePath;
  try {
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      resolved = path.join(filePath, "index.html");
    }
  } catch (_) {
    resolved = path.join(buildDir, "index.html");
  }

  const contentType = getContentTypeByExt(resolved);
  // Do not set immutable cache for index.html
  if (resolved.endsWith(path.join("build", "index.html")) || resolved.endsWith(`${path.sep}index.html`)) {
    try {
      const stat = fs.statSync(resolved);
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(resolved).pipe(res);
      return true;
    } catch (_) {
      return false;
    }
  }

  sendFile(res, resolved, contentType);
  return true;
}

async function getWaGroups() {
  const chats = await waClient.getChats();
  const groups = chats.filter((c) => c && c.isGroup);

  // Fetch group metadata (participants count) from each group chat.
  const results = [];
  for (const g of groups) {
    try {
      const full = typeof g.fetch === "function" ? await g.fetch() : g;
      const participants =
        (Array.isArray(full?.participants) && full.participants.length) ||
        (Array.isArray(full?.groupMetadata?.participants) && full.groupMetadata.participants.length) ||
        (Array.isArray(g?.participants) && g.participants.length) ||
        (Array.isArray(g?.groupMetadata?.participants) && g.groupMetadata.participants.length) ||
        null;
      results.push({
        id: g.id?._serialized || null,
        name: g.name || g.formattedTitle || null,
        participants,
      });
    } catch (_) {
      results.push({
        id: g.id?._serialized || null,
        name: g.name || g.formattedTitle || null,
        participants: null,
      });
    }
  }

  results.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  return results;
}

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      const err = new Error(`${label} timed out after ${ms}ms`);
      err.code = "ETIMEOUT";
      reject(err);
    }, ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

const RESCRAPE_INTERVAL_MS = (() => {
  const raw = process.env.RESCRAPE_INTERVAL_MS;
  if (!raw) return 2 * 60 * 60 * 1000; // 2 hours
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 2 * 60 * 60 * 1000;
})();

let rescrapeInterval = null;
let campaignWorkerInterval = null;
let campaignWorkerRunning = false;

const CAMPAIGNS_FILE_PATH = path.join(__dirname, "data", "campaogns.json");
const CONTACTS_FILE_PATH = path.join(__dirname, "data", "contacts.json");
const CAMPAIGN_SEND_DELAY_MS = 60_000;
const CAMPAIGN_BATCH_SIZE = (() => {
  const raw = process.env.CAMPAIGN_BATCH_SIZE;
  if (!raw) return 10;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10;
})();
const CAMPAIGN_BATCH_COOLDOWN_MS = (() => {
  const raw = process.env.CAMPAIGN_BATCH_COOLDOWN_MS;
  if (!raw) return 10 * 60_000; // 10 minutes
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 10 * 60_000;
})();
const CAMPAIGN_LONG_BREAK_EVERY = (() => {
  const raw = process.env.CAMPAIGN_LONG_BREAK_EVERY;
  if (!raw) return 100;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 100;
})();
const CAMPAIGN_LONG_BREAK_MIN_MS = (() => {
  const raw = process.env.CAMPAIGN_LONG_BREAK_MIN_MS;
  if (!raw) return 20 * 60_000; // 20 minutes
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 20 * 60_000;
})();
const CAMPAIGN_LONG_BREAK_MAX_MS = (() => {
  const raw = process.env.CAMPAIGN_LONG_BREAK_MAX_MS;
  if (!raw) return 30 * 60_000; // 30 minutes
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 30 * 60_000;
})();

function readCampaigns() {
  return readJsonArrayIfExists(CAMPAIGNS_FILE_PATH);
}

function writeCampaigns(campaigns) {
  writeJsonArrayAtomic(CAMPAIGNS_FILE_PATH, campaigns);
}

function ensureCampaignSendDefaults(c) {
  if (!c.send) c.send = {};
  if (!c.send.state) c.send.state = "queued"; // queued | running | paused | completed | error
  if (!Array.isArray(c.send.contactIds)) c.send.contactIds = null;
  if (typeof c.send.currentIndex !== "number") c.send.currentIndex = 0;
  if (typeof c.send.sent !== "number") c.send.sent = 0;
  if (typeof c.send.failed !== "number") c.send.failed = 0;
  if (typeof c.send.total !== "number") c.send.total = 0;
  if (!c.send.startedAt) c.send.startedAt = null;
  if (!c.send.finishedAt) c.send.finishedAt = null;
  if (!c.send.nextSendAt) c.send.nextSendAt = null;
  if (!c.send.lastError) c.send.lastError = null;
  if (!c.send.lastContactId) c.send.lastContactId = null;
  if (!Array.isArray(c.send.recentFailures)) c.send.recentFailures = [];
  if (!Array.isArray(c.send.recentSends)) c.send.recentSends = [];
  if (!Array.isArray(c.send.sentContactIds)) c.send.sentContactIds = [];
  if (!c.send.pausedAt) c.send.pausedAt = null;
  if (!c.send.pauseReason) c.send.pauseReason = null;
  return c;
}

function pauseRunningCampaigns(reason) {
  const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
  let changed = false;
  for (const c of campaigns) {
    if (!c?.send) continue;
    if (c.send.state === "running") {
      c.send.state = "paused";
      c.send.pausedAt = new Date().toISOString();
      c.send.pauseReason = reason || "whatsapp_disconnected";
      c.send.nextSendAt = null;
      changed = true;
    }
  }
  if (changed) writeCampaigns(campaigns);
}

function rebuildCampaignContactListToFailedAndUnsent(c) {
  if (!c?.send) return;
  const sentIds = Array.isArray(c.send.sentContactIds) ? c.send.sentContactIds : [];
  const currentIds = Array.isArray(c.send.contactIds) ? c.send.contactIds : [];
  // Only rebuild when we have a sent list (new behavior); otherwise keep current position (backward compat).
  if (sentIds.length > 0) {
    const sentSet = new Set(sentIds);
    const remaining = currentIds.filter((id) => id && !sentSet.has(id));
    c.send.contactIds = remaining;
    c.send.total = remaining.length;
    c.send.currentIndex = 0;
  }
  c.send.nextSendAt = new Date().toISOString();
}

function resumePausedCampaigns() {
  const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
  let changed = false;
  for (const c of campaigns) {
    if (!c?.send) continue;
    if (c.send.state === "paused") {
      rebuildCampaignContactListToFailedAndUnsent(c);
      c.send.state = "running";
      c.send.pauseReason = null;
      c.send.pausedAt = null;
      changed = true;
    }
  }
  if (changed) writeCampaigns(campaigns);
}

function pauseCampaignById(id, reason) {
  const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
  const campaign = campaigns.find((c) => c?.id === id);
  if (!campaign?.send) return null;

  if (campaign.send.state !== "paused") {
    campaign.send.state = "paused";
    campaign.send.pausedAt = new Date().toISOString();
    campaign.send.pauseReason = reason || "user_paused";
    campaign.send.nextSendAt = null;
    writeCampaigns(campaigns);
  }

  return campaign;
}

function resumeCampaignById(id) {
  const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
  const campaign = campaigns.find((c) => c?.id === id);
  if (!campaign?.send) return null;

  if (campaign.send.state !== "paused") return campaign;

  rebuildCampaignContactListToFailedAndUnsent(campaign);
  campaign.send.state = "running";
  campaign.send.pauseReason = null;
  campaign.send.pausedAt = null;
  writeCampaigns(campaigns);
  return campaign;
}

function isDetachedFrameError(err) {
  const msg = err?.message ? String(err.message) : String(err);
  const m = msg.toLowerCase();
  return m.includes("attempted to use detached frame") || (m.includes("detached frame") && m.includes("attempted"));
}

let waReinitializeInProgress = false;

async function forceWhatsAppReinitialize(reason) {
  if (waReinitializeInProgress) return;
  waReinitializeInProgress = true;
  try {
    const msg = reason ? String(reason) : "forceWhatsAppReinitialize()";
    waStatus.lastError = msg;
    waStatus.state = "reinitializing";
    stopRescrapeScheduler();
    stopCampaignWorker();
    pauseRunningCampaigns("detached_frame");

    try {
      await waClient.destroy();
    } catch (_) {
      // If the browser already crashed, destroy may throw; continue with initialize.
    }

    await waClient.initialize();
  } catch (err) {
    waStatus.lastError = err?.message ? String(err.message) : String(err);
    waStatus.state = "init_error";
    // eslint-disable-next-line no-console
    console.error("WhatsApp reinitialize error:", waStatus.lastError);
  } finally {
    waReinitializeInProgress = false;
  }
}

function loadContactIdsSnapshot() {
  const contacts = readJsonArrayIfExists(CONTACTS_FILE_PATH);
  const ids = [];
  const seen = new Set();
  for (const c of contacts) {
    const id = c?.id;
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

async function sendCampaignToContact(campaign, contactId) {
  const text = String(campaign.text || "");
  if (campaign.media?.storedFilename) {
    const filePath = path.join(__dirname, "data", "media", campaign.media.storedFilename);
    const media = MessageMedia.fromFilePath(filePath);
    await waClient.sendMessage(contactId, media, { caption: text });
    return;
  }
  await waClient.sendMessage(contactId, text);
}

function startCampaignWorker() {
  if (campaignWorkerInterval) return;
  campaignWorkerInterval = setInterval(() => {
    if (waStatus.state !== "ready") return;
    runCampaignWorkerTick();
  }, 2000);
}

function stopCampaignWorker() {
  if (!campaignWorkerInterval) return;
  clearInterval(campaignWorkerInterval);
  campaignWorkerInterval = null;
}

async function runCampaignWorkerTick() {
  if (campaignWorkerRunning) return;
  campaignWorkerRunning = true;
  try {
    const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
    let changed = false;

    for (const c of campaigns) {
      if (!c?.send) continue;
      if (c.send.state !== "queued" && c.send.state !== "running") continue;

      if (!Array.isArray(c.send.contactIds) || c.send.contactIds.length === 0) {
        const ids = loadContactIdsSnapshot();
        c.send.contactIds = ids;
        c.send.total = ids.length;
        c.send.currentIndex = 0;
        c.send.sent = 0;
        c.send.failed = 0;
        c.send.startedAt = c.send.startedAt || new Date().toISOString();
        c.send.nextSendAt = c.send.nextSendAt || new Date().toISOString();
        c.send.state = "running";
        changed = true;
      }

      const ids = c.send.contactIds || [];
      if (c.send.currentIndex >= ids.length) {
        c.send.state = "completed";
        c.send.finishedAt = c.send.finishedAt || new Date().toISOString();
        c.send.nextSendAt = null;
        changed = true;
        continue;
      }

      const nextAt = c.send.nextSendAt ? Date.parse(c.send.nextSendAt) : 0;
      if (nextAt && Date.now() < nextAt) continue;

      const contactId = ids[c.send.currentIndex];
      if (!contactId) {
        c.send.currentIndex += 1;
        c.send.nextSendAt = new Date(Date.now() + CAMPAIGN_SEND_DELAY_MS).toISOString();
        changed = true;
        continue;
      }

      try {
        await withTimeout(sendCampaignToContact(c, contactId), 20000, "sendCampaignToContact()");
        c.send.sent += 1;
        c.send.lastError = null;
        c.send.lastContactId = contactId;
        if (!c.send.sentContactIds) c.send.sentContactIds = [];
        c.send.sentContactIds.push(contactId);
        c.send.recentSends.unshift({ at: new Date().toISOString(), contactId, ok: true });
        c.send.recentSends = c.send.recentSends.slice(0, 50);
        if (LOG_SUCCESS) {
          // eslint-disable-next-line no-console
          console.log(
            `[backend] campaign send ok | campaign=${c?.id || "?"} | contact=${contactId} | totalSent=${c.send.sent}`
          );
        }
      } catch (err) {
        const msg = err?.message ? String(err.message) : String(err);
        c.send.failed += 1;
        c.send.lastError = msg;
        c.send.lastContactId = contactId;
        c.send.recentFailures.unshift({ at: new Date().toISOString(), contactId, error: msg });
        c.send.recentFailures = c.send.recentFailures.slice(0, 50);
        c.send.recentSends.unshift({ at: new Date().toISOString(), contactId, ok: false, error: msg });
        c.send.recentSends = c.send.recentSends.slice(0, 50);
        // eslint-disable-next-line no-console
        console.error(
          `[backend] campaign send failed | campaign=${c?.id || "?"} | contact=${contactId} | error=${msg}`
        );

        if (isDetachedFrameError(err)) {
          // eslint-disable-next-line no-console
          console.error("[backend] Detected detached Frame error; forcing WhatsApp reinitialize.");
          void forceWhatsAppReinitialize(msg);
        }
      } finally {
        c.send.currentIndex += 1;
        const processed = c.send.currentIndex;
        const longBreak = processed > 0 && processed % CAMPAIGN_LONG_BREAK_EVERY === 0;
        const cooldown = processed > 0 && processed % CAMPAIGN_BATCH_SIZE === 0;
        const delay = longBreak
          ? crypto.randomInt(CAMPAIGN_LONG_BREAK_MIN_MS, CAMPAIGN_LONG_BREAK_MAX_MS + 1)
          : cooldown
            ? CAMPAIGN_BATCH_COOLDOWN_MS
            : CAMPAIGN_SEND_DELAY_MS;
        c.send.nextSendAt = new Date(Date.now() + delay).toISOString();
        changed = true;
      }

      // Only send one message per tick globally.
      break;
    }

    if (changed) writeCampaigns(campaigns);
  } finally {
    campaignWorkerRunning = false;
  }
}

const groupsCache = {
  lastUpdatedAt: null,
  groups: [],
  refreshing: false,
  lastError: null,
};

const contactsCache = {
  lastUpdatedAt: null,
  contacts: [],
  refreshing: false,
  lastError: null,
};

async function getGroupParticipants(chat) {
  const full = typeof chat.fetch === "function" ? await chat.fetch() : chat;
  return (
    full?.participants ||
    full?.groupMetadata?.participants ||
    chat?.participants ||
    chat?.groupMetadata?.participants ||
    []
  );
}

function isAdminParticipant(p) {
  return Boolean(p?.isAdmin || p?.isSuperAdmin || p?.isGroupAdmin);
}

function contactIdFromParticipant(p) {
  return p?.id?._serialized || p?.id || null;
}

function normalizeContact(contact) {
  const id = contact?.id?._serialized || contact?.id || null;
  const number = contact?.number || contact?.id?.user || null;
  const name = contact?.name || contact?.shortName || null;
  const pushname = contact?.pushname || null;
  return { id, number, name, pushname };
}

function normalizeContactFromId(pid) {
  const id = pid || null;
  const user = typeof pid === "string" ? pid.split("@")[0] : null;
  const number = user && /^\d+$/.test(user) ? user : user || null;
  return { id, number, name: null, pushname: null };
}

async function getWaContactsFromGroups() {
  const chats = await waClient.getChats();
  const groupChats = chats.filter((c) => c && c.isGroup);

  const seen = new Set();
  const results = [];

  for (const g of groupChats) {
    // Per-group timeout so one slow group doesn't block all contacts.
    let participants = [];
    try {
      participants = await withTimeout(getGroupParticipants(g), 8000, "getGroupParticipants(group)");
    } catch (_) {
      participants = [];
    }
    for (const p of participants || []) {
      if (isAdminParticipant(p)) continue;
      const pid = contactIdFromParticipant(p);
      if (!pid) continue;
      if (seen.has(pid)) continue;

      seen.add(pid);
      // Avoid per-contact lookups (very slow). Store minimal identity.
      results.push(normalizeContactFromId(pid));
    }
  }

  results.sort((a, b) => String(a.pushname || a.name || "").localeCompare(String(b.pushname || b.name || "")));
  return results;
}

async function refreshGroupsCache() {
  if (waStatus.state !== "ready") return;
  if (groupsCache.refreshing) return;
  groupsCache.refreshing = true;
  try {
    const groups = await withTimeout(getWaGroups(), 120000, "getWaGroups()");
    groupsCache.groups = groups;
    groupsCache.lastUpdatedAt = new Date().toISOString();
    groupsCache.lastError = null;

    const filePath = path.join(__dirname, "data", "groups.json");
    const arrayToStore = groups.map((g) => ({
      name: g.name,
      participants: g.participants,
    }));
    writeJsonArrayAtomic(filePath, arrayToStore);
    if (LOG_SUCCESS) {
      // eslint-disable-next-line no-console
      console.log(`[backend] groups cache refreshed (${groups.length} groups)`);
    }
  } catch (err) {
    groupsCache.lastError = err?.message ? String(err.message) : String(err);
    // eslint-disable-next-line no-console
    console.error("[backend] groups cache refresh failed:", groupsCache.lastError);
  } finally {
    groupsCache.refreshing = false;
  }
}

async function refreshContactsCache() {
  if (waStatus.state !== "ready") return;
  if (contactsCache.refreshing) return;
  contactsCache.refreshing = true;
  try {
    const prevIds = new Set((contactsCache.contacts || []).map((c) => c?.id).filter(Boolean));

    // Contacts collection may be heavy for accounts in many groups.
    const contacts = await withTimeout(getWaContactsFromGroups(), 180000, "getWaContactsFromGroups()");
    // Ensure no duplicates even if upstream duplicates appear
    const deduped = [];
    const seen = new Set();
    for (const c of contacts) {
      const id = c?.id || null;
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      deduped.push(c);
    }

    contactsCache.contacts = deduped;
    contactsCache.lastUpdatedAt = new Date().toISOString();
    contactsCache.lastError = null;

    const filePath = path.join(__dirname, "data", "contacts.json");
    writeJsonArrayAtomic(filePath, deduped);

    const newIds = [];
    for (const id of seen) {
      if (!prevIds.has(id)) newIds.push(id);
    }
    if (newIds.length > 0) {
      propagateNewContactsToCampaigns(newIds);
    }
  } catch (err) {
    contactsCache.lastError = err?.message ? String(err.message) : String(err);
    // eslint-disable-next-line no-console
    console.error("[backend] contacts cache refresh failed:", contactsCache.lastError);
  } finally {
    contactsCache.refreshing = false;
  }
}

function propagateNewContactsToCampaigns(newContactIds) {
  const ids = Array.isArray(newContactIds) ? newContactIds.filter(Boolean) : [];
  if (ids.length === 0) return;

  const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
  let changed = false;

  for (const c of campaigns) {
    if (!c?.send) continue;

    // If campaign hasn't snapshotted yet (queued), it will pick up the new contacts automatically.
    if (!Array.isArray(c.send.contactIds) || c.send.contactIds.length === 0) continue;

    const set = new Set(c.send.contactIds);
    let added = 0;
    for (const id of ids) {
      if (set.has(id)) continue;
      set.add(id);
      c.send.contactIds.push(id);
      added += 1;
    }

    if (added > 0) {
      c.send.total = c.send.contactIds.length;
      if (c.send.state === "completed") {
        c.send.state = "running";
        c.send.finishedAt = null;
        c.send.nextSendAt = new Date().toISOString();
      }
      changed = true;
    }
  }

  if (changed) writeCampaigns(campaigns);
}

function startRescrapeScheduler() {
  if (rescrapeInterval) return;
  rescrapeInterval = setInterval(() => {
    if (waStatus.state !== "ready") return;
    refreshGroupsCache();
    refreshContactsCache();
  }, RESCRAPE_INTERVAL_MS);
}

function stopRescrapeScheduler() {
  if (!rescrapeInterval) return;
  clearInterval(rescrapeInterval);
  rescrapeInterval = null;
}

const waStatus = {
  state: "initializing",
  lastQrAt: null,
  authenticatedAt: null,
  readyAt: null,
  disconnectedAt: null,
  disconnectedReason: null,
  lastError: null,
  info: null,
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Vary": "Origin",
      "Access-Control-Allow-Methods": "GET,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    return res.end();
  }

  if (req.method === "GET" && url.pathname.startsWith("/media/")) {
    const rel = url.pathname.replace(/^\/media\//, "");
    const safeRel = rel.replace(/[^a-zA-Z0-9._-]/g, "");
    const mediaPath = path.join(__dirname, "data", "media", safeRel);
    return sendFile(res, mediaPath);
  }

  if (req.method === "GET" && url.pathname === "/api/campaigns") {
    const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
    return sendJsonCors(req, res, 200, { ok: true, count: campaigns.length, campaigns });
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/campaigns/")) {
    const id = url.pathname.replace("/api/campaigns/", "").trim();
    const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
    const campaign = campaigns.find((c) => c && c.id === id);
    if (!campaign) return sendJsonCors(req, res, 404, { ok: false, error: "Campaign not found" });
    return sendJsonCors(req, res, 200, { ok: true, campaign });
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/campaigns/")) {
    const id = url.pathname.replace("/api/campaigns/", "").trim();
    const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
    const idx = campaigns.findIndex((c) => c && c.id === id);
    if (idx === -1) return sendJsonCors(req, res, 404, { ok: false, error: "Campaign not found" });

    const campaign = campaigns[idx];
    campaigns.splice(idx, 1);
    writeCampaigns(campaigns);

    const stored = campaign?.media?.storedFilename;
    if (stored) {
      const filePath = path.join(__dirname, "data", "media", stored);
      try {
        fs.unlinkSync(filePath);
      } catch (_) {
        // ignore
      }
    }

    return sendJsonCors(req, res, 200, { ok: true, deletedId: id });
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/campaigns/")) {
    const m = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/(pause|resume)$/);
    if (m) {
      const id = m[1];
      const action = m[2];

      const campaign = action === "pause" ? pauseCampaignById(id, "user_paused") : resumeCampaignById(id);
      if (!campaign) return sendJsonCors(req, res, 404, { ok: false, error: "Campaign not found" });

      return sendJsonCors(req, res, 200, { ok: true, campaign });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/dashboard") {
    const campaigns = readCampaigns().map(ensureCampaignSendDefaults);
    const contacts = readJsonArrayIfExists(CONTACTS_FILE_PATH);
    const groups = readJsonArrayIfExists(path.join(__dirname, "data", "groups.json"));

    const running = campaigns.filter((c) => c?.send?.state === "running").length;
    const queued = campaigns.filter((c) => c?.send?.state === "queued").length;
    const completed = campaigns.filter((c) => c?.send?.state === "completed").length;
    const failed = campaigns.filter((c) => c?.send?.state === "error").length;

    const contactsWithNumber = contacts.reduce((acc, c) => acc + (c?.number ? 1 : 0), 0);
    const contactsWithoutNumber = contacts.length - contactsWithNumber;

    const campaignsProgress = campaigns
      .map((c) => {
        const send = c?.send || {};
        const total = Number.isFinite(send.total) ? send.total : 0;
        const completedCount = Number.isFinite(send.currentIndex) ? Math.min(total, Math.max(0, send.currentIndex)) : 0;
        const remainingCount = Math.max(0, total - completedCount);
        const percent = total > 0 ? Math.round((completedCount / total) * 100) : 0;
        return {
          id: c?.id || null,
          name: c?.name || null,
          state: send.state || null,
          completed: completedCount,
          remaining: remainingCount,
          percentage: percent,
          total,
        };
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

    return sendJsonCors(req, res, 200, {
      ok: true,
      whatsapp: {
        state: waStatus.state,
        lastError: waStatus.lastError,
        readyAt: waStatus.readyAt,
        authenticatedAt: waStatus.authenticatedAt,
      },
      counts: {
        groups: Array.isArray(groups) ? groups.length : 0,
        contacts: Array.isArray(contacts) ? contacts.length : 0,
        campaigns: campaigns.length,
        campaignsQueued: queued,
        campaignsRunning: running,
        campaignsCompleted: completed,
        campaignsError: failed,
        contactsWithNumber,
        contactsWithoutNumber,
      },
      refresh: {
        groups: { lastUpdatedAt: groupsCache.lastUpdatedAt, refreshing: groupsCache.refreshing, lastError: groupsCache.lastError },
        contacts: {
          lastUpdatedAt: contactsCache.lastUpdatedAt,
          refreshing: contactsCache.refreshing,
          lastError: contactsCache.lastError,
        },
      },
      campaignsProgress,
    });
  }

  if (req.method === "POST" && url.pathname === "/api/campaigns") {
    const uploadDir = path.join(__dirname, "data", "media");
    fs.mkdirSync(uploadDir, { recursive: true });

    const form = new IncomingForm({
      multiples: false,
      allowEmptyFiles: true,
      minFileSize: 0,
      uploadDir,
      keepExtensions: true,
      filename: (name, ext, part) => {
        const safeExt = safeExtFromOriginalFilename(part?.originalFilename) || ext || "";
        return `${crypto.randomUUID()}${safeExt}`;
      },
    });

    return form.parse(req, (err, fields, files) => {
      if (err) {
        return sendJsonCors(req, res, 400, { ok: false, error: String(err.message || err) });
      }

      const name = String(fields?.name || "").trim();
      const text = String(fields?.text || "").trim();
      if (!name) return sendJsonCors(req, res, 400, { ok: false, error: "Campaign name is required" });
      if (!text) return sendJsonCors(req, res, 400, { ok: false, error: "Campaign text is required" });

      const media = files?.media || null;
      const mediaItem = Array.isArray(media) ? media[0] : media;
      let mediaInfo = null;

      if (mediaItem && mediaItem.size > 0) {
        const storedFilename = path.basename(mediaItem.filepath || "");
        mediaInfo = {
          storedFilename,
          originalFilename: mediaItem.originalFilename || null,
          mimetype: mediaItem.mimetype || null,
          size: mediaItem.size || null,
          url: `/media/${storedFilename}`,
        };
      } else if (mediaItem && mediaItem.filepath) {
        // Empty file uploaded; remove it.
        try {
          fs.unlinkSync(mediaItem.filepath);
        } catch (_) {
          // ignore
        }
      }

      const existing = readCampaigns();
      const now = new Date().toISOString();
      const campaign = {
        id: crypto.randomUUID(),
        name,
        text,
        media: mediaInfo,
        createdAt: now,
        send: {
          state: "queued",
          contactIds: null,
          total: 0,
          currentIndex: 0,
          sent: 0,
          failed: 0,
          startedAt: null,
          finishedAt: null,
          nextSendAt: null,
          lastError: null,
          lastContactId: null,
          recentFailures: [],
          recentSends: [],
        },
      };

      existing.unshift(campaign);
      writeCampaigns(existing);
      return sendJsonCors(req, res, 201, { ok: true, campaign });
    });
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/status") {
    const info = waClient?.info
      ? {
          pushname: waClient.info.pushname || null,
          wid: waClient.info.wid?._serialized || null,
          me: waClient.info.me?._serialized || null,
          platform: waClient.info.platform || null,
        }
      : null;

    return sendJsonCors(req, res, 200, {
      ok: true,
      state: waStatus.state,
      timestamps: {
        lastQrAt: waStatus.lastQrAt,
        authenticatedAt: waStatus.authenticatedAt,
        readyAt: waStatus.readyAt,
        disconnectedAt: waStatus.disconnectedAt,
      },
      disconnectedReason: waStatus.disconnectedReason,
      lastError: waStatus.lastError,
      info: info || waStatus.info,
    });
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/groups") {
    if (waStatus.state !== "ready") {
      return sendJsonCors(req, res, 409, {
        ok: false,
        error: "WhatsApp client is not ready",
        state: waStatus.state,
        lastError: waStatus.lastError,
      });
    }

    const refresh = url.searchParams.get("refresh") === "1";
    const staleMs = 60_000;
    const last = groupsCache.lastUpdatedAt ? Date.parse(groupsCache.lastUpdatedAt) : 0;
    const isStale = !last || Number.isNaN(last) || Date.now() - last > staleMs;

    if (refresh || isStale) {
      // Refresh in background; respond quickly with current cache
      refreshGroupsCache();
    }

    return sendJsonCors(req, res, 200, {
      ok: true,
      count: groupsCache.groups.length,
      groups: groupsCache.groups,
      cache: {
        lastUpdatedAt: groupsCache.lastUpdatedAt,
        refreshing: groupsCache.refreshing,
        lastError: groupsCache.lastError,
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/api/whatsapp/contacts") {
    if (waStatus.state !== "ready") {
      return sendJsonCors(req, res, 409, {
        ok: false,
        error: "WhatsApp client is not ready",
        state: waStatus.state,
        lastError: waStatus.lastError,
      });
    }

    const refresh = url.searchParams.get("refresh") === "1";
    const staleMs = 60_000;
    const last = contactsCache.lastUpdatedAt ? Date.parse(contactsCache.lastUpdatedAt) : 0;
    const isStale = !last || Number.isNaN(last) || Date.now() - last > staleMs;

    if (refresh || isStale) {
      refreshContactsCache();
    }

    return sendJsonCors(req, res, 200, {
      ok: true,
      count: contactsCache.contacts.length,
      contacts: contactsCache.contacts,
      cache: {
        lastUpdatedAt: contactsCache.lastUpdatedAt,
        refreshing: contactsCache.refreshing,
        lastError: contactsCache.lastError,
      },
    });
  }

  if (req.method === "GET" && url.pathname === "/health") {
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && url.pathname === "/") {
    return sendJson(res, 200, { name: "backend", status: "running" });
  }

  // Serve frontend build (SPA) for non-API routes
  if (req.method === "GET" && !url.pathname.startsWith("/api/") && !url.pathname.startsWith("/media/")) {
    const served = tryServeFrontendBuild(req, res, url);
    if (served) return;
  }

  return sendJson(res, 404, { error: "Not Found" });
});

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `HTTP server port ${PORT} is already in use. ` +
        "WhatsApp QR/login will still run, but the HTTP API is not listening."
    );
    return;
  }
  // eslint-disable-next-line no-console
  console.error("HTTP server error:", err);
});

server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://${HOST}:${PORT}`);
});

const WA_LOCK_PATH = path.join(__dirname, ".wwebjs_auth", ".wa.lock");
let waLockFd = null;

function isPidRunning(pid) {
  const n = Number.parseInt(String(pid), 10);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function tryAcquireWaLock() {
  try {
    fs.mkdirSync(path.dirname(WA_LOCK_PATH), { recursive: true });
    try {
      waLockFd = fs.openSync(WA_LOCK_PATH, "wx");
      fs.writeFileSync(waLockFd, String(process.pid));
      return true;
    } catch (_) {
      // Lock exists. If it's stale, "steal" it without deleting any files.
      const existing = fs.readFileSync(WA_LOCK_PATH, "utf8").trim();
      if (!isPidRunning(existing)) {
        waLockFd = fs.openSync(WA_LOCK_PATH, "w");
        fs.writeFileSync(waLockFd, String(process.pid));
        return true;
      }
      return false;
    }
  } catch (err) {
    return false;
  }
}

function releaseWaLock() {
  try {
    if (waLockFd) fs.closeSync(waLockFd);
  } catch (_) {
    // ignore
  }
  waLockFd = null;
  // Don't delete any files automatically; leave lock file as-is.
}

const waClient = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

waClient.on("qr", (qr) => {
  waStatus.state = "qr";
  waStatus.lastQrAt = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log("Scan this QR with WhatsApp (Linked Devices):");
  qrcode.generate(qr, { small: true });
});

waClient.on("ready", () => {
  waStatus.state = "ready";
  waStatus.readyAt = new Date().toISOString();
  waStatus.info = waClient?.info
    ? {
        pushname: waClient.info.pushname || null,
        wid: waClient.info.wid?._serialized || null,
        me: waClient.info.me?._serialized || null,
        platform: waClient.info.platform || null,
      }
    : null;
  // eslint-disable-next-line no-console
  console.log("WhatsApp client is ready.");

  // Warm groups cache in background so UI loads fast.
  refreshGroupsCache();
  refreshContactsCache();
  startRescrapeScheduler();
  resumePausedCampaigns();
  startCampaignWorker();
});

waClient.on("authenticated", () => {
  waStatus.state = "authenticated";
  waStatus.authenticatedAt = new Date().toISOString();
  // eslint-disable-next-line no-console
  console.log("WhatsApp client authenticated.");
});

waClient.on("auth_failure", (msg) => {
  waStatus.state = "auth_failure";
  // eslint-disable-next-line no-console
  console.error("WhatsApp auth failure:", msg);
  pauseRunningCampaigns("auth_failure");
  stopCampaignWorker();
});

waClient.on("disconnected", (reason) => {
  waStatus.state = "disconnected";
  waStatus.disconnectedAt = new Date().toISOString();
  waStatus.disconnectedReason = reason || null;
  // eslint-disable-next-line no-console
  console.warn("WhatsApp client disconnected:", reason);
  stopRescrapeScheduler();
  pauseRunningCampaigns(reason || "disconnected");
  stopCampaignWorker();
});

if (!tryAcquireWaLock()) {
  waStatus.state = "already_running";
  waStatus.lastError = "WhatsApp lock exists. Another backend/WhatsApp instance is probably running.";
  // eslint-disable-next-line no-console
  console.error(
    "WhatsApp session is already running (lock exists). Stop the other backend/WhatsApp process and restart."
  );
} else {
  waClient.initialize().catch((err) => {
    const msg = err?.message ? String(err.message) : String(err);
    waStatus.lastError = msg;
    if (msg.toLowerCase().includes("the browser is already running for")) {
      waStatus.state = "browser_already_running";
    } else {
      waStatus.state = "init_error";
    }
    // eslint-disable-next-line no-console
    console.error("WhatsApp init error:", err);
  });
}

async function shutdown() {
  try {
    await waClient.destroy();
  } catch (_) {
    // ignore
  }
  stopRescrapeScheduler();
  stopCampaignWorker();
  releaseWaLock();
  try {
    server.close();
  } catch (_) {
    // ignore
  }
}

process.on("SIGINT", () => {
  shutdown().finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown().finally(() => process.exit(0));
});

