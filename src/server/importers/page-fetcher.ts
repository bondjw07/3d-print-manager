import type { ProductImportFetchMode } from "./types";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

type FetchedPage = {
  body: string;
  fetchMode: ProductImportFetchMode;
};

type MirrorRateLimitPayload = {
  retryAfter?: number;
  retryAfterDate?: string;
  code?: number;
  status?: number;
  message?: string;
  readableMessage?: string;
};

const browserLikeHeaders = {
  "user-agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

const MIRROR_MAX_ATTEMPTS = 4;
const MIRROR_MIN_INTERVAL_MS = 250;
const MIRROR_BACKOFF_BASE_MS = 1_500;
const MIRROR_BACKOFF_MAX_MS = 20_000;

let mirrorNextAllowedAt = 0;
const execFileAsync = promisify(execFile);

function wait(ms: number) {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

function defaultBackoffForAttempt(attempt: number) {
  return Math.min(MIRROR_BACKOFF_MAX_MS, MIRROR_BACKOFF_BASE_MS * attempt);
}

function reserveMirrorCooldown(ms: number) {
  mirrorNextAllowedAt = Math.max(mirrorNextAllowedAt, Date.now() + Math.max(0, ms));
}

async function waitForMirrorWindow() {
  const delay = mirrorNextAllowedAt - Date.now();
  if (delay > 0) {
    await wait(delay);
  }
}

function looksLikeBotChallenge(body: string) {
  const lowered = body.toLowerCase();
  return (
    lowered.includes("just a moment") ||
    lowered.includes("enable javascript and cookies to continue") ||
    lowered.includes("cf_chl_opt") ||
    lowered.includes("cf-mitigated")
  );
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseRetryAfterHeader(value: string | null) {
  if (!value) {
    return null;
  }

  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1_000;
  }

  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }

  return null;
}

function parseRetryAfterMs(response: Response, body: string) {
  const fromHeader = parseRetryAfterHeader(response.headers.get("retry-after"));
  if (fromHeader !== null) {
    return fromHeader;
  }

  const payload = safeJsonParse<MirrorRateLimitPayload>(body);
  if (payload?.retryAfter !== undefined && Number.isFinite(payload.retryAfter)) {
    return Math.max(0, payload.retryAfter * 1_000);
  }

  if (payload?.retryAfterDate) {
    const parsedDate = Date.parse(payload.retryAfterDate);
    if (Number.isFinite(parsedDate)) {
      return Math.max(0, parsedDate - Date.now());
    }
  }

  return null;
}

function isMirrorRateLimitResponse(response: Response, body: string) {
  if (response.status === 429) {
    return true;
  }

  const payload = safeJsonParse<MirrorRateLimitPayload>(body);
  if (payload) {
    if (payload.code === 429) {
      return true;
    }

    if (typeof payload.readableMessage === "string" && payload.readableMessage.includes("RateLimitTriggeredError")) {
      return true;
    }

    if (typeof payload.message === "string" && payload.message.toLowerCase().includes("rate limit")) {
      return true;
    }
  }

  const lowered = body.toLowerCase();
  return lowered.includes("ratelimittriggerederror") || lowered.includes("rate limit exceeded");
}

async function fetchDirect(url: string): Promise<FetchedPage | null> {
  const response = await fetch(url, {
    method: "GET",
    headers: browserLikeHeaders,
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });

  if (!response.ok) {
    throw new Error(`Direct fetch failed (${response.status}).`);
  }

  const body = await response.text();
  if (looksLikeBotChallenge(body)) {
    throw new Error("Direct fetch was blocked by a bot challenge.");
  }

  return {
    body,
    fetchMode: "DIRECT_HTML",
  };
}

function buildMirrorUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  return `https://r.jina.ai/http://${parsed.host}${parsed.pathname}${parsed.search}`;
}

async function fetchMirrorWithCurl(sourceUrl: string): Promise<{ body: string | null; diagnostic?: string }> {
  try {
    // Jina can issue a Cloudflare challenge to Node's TLS fingerprint even when
    // the same request works through curl. This is deliberately a last-resort
    // fallback for mirror 403s; normal requests remain on fetch.
    const { stdout } = await execFileAsync(
      "curl",
      [
        "--fail",
        "--location",
        "--silent",
        "--show-error",
        "--max-time",
        "20",
        "--user-agent",
        browserLikeHeaders["user-agent"],
        "--header",
        "Accept: text/plain, text/markdown;q=0.9, */*;q=0.8",
        buildMirrorUrl(sourceUrl),
      ],
      { maxBuffer: 5 * 1024 * 1024 },
    );
    return { body: stdout.trim() || null };
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/\s+/g, " ").trim() : "Unknown curl error.";
    return { body: null, diagnostic: `curl fallback failed: ${message.slice(0, 240)}` };
  }
}

async function fetchMirror(sourceUrl: string): Promise<FetchedPage> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MIRROR_MAX_ATTEMPTS; attempt += 1) {
    await waitForMirrorWindow();

    let response: Response;
    try {
      response = await fetch(buildMirrorUrl(sourceUrl), {
        method: "GET",
        headers: {
          "user-agent": browserLikeHeaders["user-agent"],
          accept: "text/plain, text/markdown;q=0.9, */*;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Mirror request failed.");
      const retryMs = defaultBackoffForAttempt(attempt);
      reserveMirrorCooldown(retryMs);

      if (attempt >= MIRROR_MAX_ATTEMPTS) {
        break;
      }

      await wait(retryMs);
      continue;
    }

    const body = await response.text();
    if (isMirrorRateLimitResponse(response, body)) {
      const retryMs = parseRetryAfterMs(response, body) ?? defaultBackoffForAttempt(attempt);
      reserveMirrorCooldown(retryMs);

      if (attempt >= MIRROR_MAX_ATTEMPTS) {
        const retrySeconds = Math.max(1, Math.ceil(retryMs / 1_000));
        throw new Error(`Mirror rate limit reached. Retry in about ${retrySeconds}s.`);
      }

      await wait(retryMs);
      continue;
    }

    if (!response.ok) {
      if (response.status === 403) {
        const curlResult = await fetchMirrorWithCurl(sourceUrl);
        if (curlResult.body) {
          reserveMirrorCooldown(MIRROR_MIN_INTERVAL_MS);
          return {
            body: curlResult.body,
            fetchMode: "MIRROR_MARKDOWN",
          };
        }
        lastError = new Error(`Mirror fetch failed (403). ${curlResult.diagnostic ?? "curl fallback returned no content."}`);
      } else {
        lastError = new Error(`Mirror fetch failed (${response.status}).`);
      }
      const retryMs = defaultBackoffForAttempt(attempt);
      reserveMirrorCooldown(retryMs);

      if (attempt >= MIRROR_MAX_ATTEMPTS) {
        break;
      }

      await wait(retryMs);
      continue;
    }

    if (!body.trim()) {
      lastError = new Error("Mirror fetch returned an empty response.");
      const retryMs = defaultBackoffForAttempt(attempt);
      reserveMirrorCooldown(retryMs);

      if (attempt >= MIRROR_MAX_ATTEMPTS) {
        break;
      }

      await wait(retryMs);
      continue;
    }

    reserveMirrorCooldown(MIRROR_MIN_INTERVAL_MS);
    return {
      body,
      fetchMode: "MIRROR_MARKDOWN",
    };
  }

  throw lastError ?? new Error("Mirror fetch failed.");
}

export async function fetchMirrorPage(sourceUrl: string): Promise<FetchedPage> {
  return fetchMirror(sourceUrl);
}

export async function fetchPageWithFallback(sourceUrl: string): Promise<FetchedPage> {
  let directDiagnostic = "Direct fetch was unavailable.";
  try {
    const direct = await fetchDirect(sourceUrl);
    if (direct) {
      return direct;
    }
  } catch (error) {
    directDiagnostic = error instanceof Error ? error.message : "Direct fetch failed unexpectedly.";
    // fall through to mirror fallback
  }

  try {
    return await fetchMirror(sourceUrl);
  } catch (error) {
    const mirrorDiagnostic = error instanceof Error ? error.message : "Mirror fetch failed unexpectedly.";
    throw new Error(`Unable to fetch ${sourceUrl}. ${directDiagnostic} ${mirrorDiagnostic}`);
  }
}
