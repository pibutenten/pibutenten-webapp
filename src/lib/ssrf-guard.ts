/**
 * SSRF (Server-Side Request Forgery) defense helpers — Phase 6-2 (2026-05-16).
 *
 * 외부 URL fetch 시 내부망/사설/메타데이터 endpoint 차단.
 * 단순 hostname string 매칭으로는 부족 — DNS 해석 후 실제 IP 검증해야
 * `internal.example.com → 10.0.0.5` 같은 우회를 막을 수 있다.
 *
 * 사용:
 *   const result = await safeFetchExternal(url, { maxBytes, timeoutMs });
 *   if (!result.ok) return result.error;
 *   const html = result.text;
 */
import { lookup } from "dns/promises";

/** 사설/특수 IP 대역 (IPv4) — RFC1918 + loopback + link-local + cloud metadata. */
const BLOCKED_IPV4_PATTERNS: RegExp[] = [
  /^127\./,                        // 127.0.0.0/8 loopback
  /^10\./,                         // 10.0.0.0/8 RFC1918
  /^192\.168\./,                   // 192.168.0.0/16 RFC1918
  /^172\.(1[6-9]|2\d|3[01])\./,    // 172.16.0.0/12 RFC1918
  /^0\./,                          // 0.0.0.0/8
  /^169\.254\./,                   // 169.254.0.0/16 link-local + AWS/GCP metadata
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./, // 100.64.0.0/10 CGN
  /^224\./,                        // 224.0.0.0/4 multicast
  /^255\./,                        // 255.0.0.0/8
];

/** 사설/특수 IPv6 — loopback, link-local, ULA, cloud metadata. */
function isBlockedIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fe80:")) return true;         // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA
  if (lower.startsWith("ff")) return true;            // multicast
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 등) — IPv4 검사로 위임
  if (lower.startsWith("::ffff:")) {
    const v4 = lower.slice(7);
    return BLOCKED_IPV4_PATTERNS.some((p) => p.test(v4));
  }
  return false;
}

/** 차단 호스트명 (DNS 우회 가능한 well-known metadata 호스트). */
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "metadata.google.internal",
  "metadata.azure.com",
]);

/** 단일 host (DNS 해석 포함) 가 안전한지 검사. */
export async function isHostSafeForExternalFetch(
  hostname: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) {
    return { ok: false, reason: `blocked hostname: ${lower}` };
  }

  // 이미 IP literal 인 경우 즉시 검사
  if (/^\d+\.\d+\.\d+\.\d+$/.test(lower)) {
    if (BLOCKED_IPV4_PATTERNS.some((p) => p.test(lower))) {
      return { ok: false, reason: `blocked private IPv4: ${lower}` };
    }
    return { ok: true };
  }
  if (lower.includes(":") && !lower.includes(".")) {
    // IPv6 literal (대괄호 없는 케이스 만일을 위해)
    if (isBlockedIpv6(lower)) {
      return { ok: false, reason: `blocked private IPv6: ${lower}` };
    }
    return { ok: true };
  }

  // 도메인 — DNS 해석 후 모든 결과 IP 검사
  try {
    const results = await lookup(lower, { all: true });
    for (const r of results) {
      if (r.family === 4) {
        if (BLOCKED_IPV4_PATTERNS.some((p) => p.test(r.address))) {
          return {
            ok: false,
            reason: `${lower} resolves to private IPv4 ${r.address}`,
          };
        }
      } else if (r.family === 6) {
        if (isBlockedIpv6(r.address)) {
          return {
            ok: false,
            reason: `${lower} resolves to private IPv6 ${r.address}`,
          };
        }
      }
    }
  } catch (e) {
    return {
      ok: false,
      reason: `DNS lookup failed: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  return { ok: true };
}

export type SafeFetchOptions = {
  timeoutMs?: number;       // default 6000
  maxBytes?: number;        // default 1MB
  maxRedirects?: number;    // default 3
  /** 허용 프로토콜. 기본 ['https:']. 두 번째 인자로 ['http:', 'https:'] 가능. */
  allowedProtocols?: string[];
  headers?: Record<string, string>;
  /** 응답 본문 디코딩 전 content-type 화이트리스트 (prefix 매칭). */
  expectedContentType?: string;
};

export type SafeFetchResult =
  | { ok: true; finalUrl: string; status: number; bodyBytes: Uint8Array; contentType: string }
  | { ok: false; status: number; error: string };

/**
 * SSRF-safe fetch — 각 redirect hop 마다 host 검증을 다시 수행한다.
 *
 * Node native fetch 의 `redirect: 'follow'` 는 hop 별 검증을 못 하므로
 * `redirect: 'manual'` 로 직접 처리한다.
 */
export async function safeFetchExternal(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = opts.timeoutMs ?? 6000;
  const maxBytes = opts.maxBytes ?? 1024 * 1024;
  const maxRedirects = opts.maxRedirects ?? 3;
  const allowed = opts.allowedProtocols ?? ["https:"];

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    return { ok: false, status: 0, error: "invalid URL format" };
  }

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!allowed.includes(currentUrl.protocol)) {
      return { ok: false, status: 0, error: `protocol ${currentUrl.protocol} blocked` };
    }
    const hostCheck = await isHostSafeForExternalFetch(currentUrl.hostname);
    if (!hostCheck.ok) {
      return { ok: false, status: 0, error: hostCheck.reason };
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(currentUrl.toString(), {
        method: "GET",
        signal: ctl.signal,
        redirect: "manual",
        headers: opts.headers ?? {},
      });
    } catch (e) {
      clearTimeout(timer);
      return {
        ok: false,
        status: 0,
        error: e instanceof Error ? e.message : "fetch failed",
      };
    } finally {
      clearTimeout(timer);
    }

    // 3xx redirect 처리 — Location 재검증 후 hop 진행
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        return { ok: false, status: res.status, error: "redirect without Location header" };
      }
      try {
        currentUrl = new URL(loc, currentUrl);
      } catch {
        return { ok: false, status: res.status, error: "invalid redirect Location" };
      }
      continue;
    }

    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (opts.expectedContentType && !contentType.includes(opts.expectedContentType)) {
      return { ok: false, status: res.status, error: `unexpected content-type: ${contentType}` };
    }

    // 스트림 읽기 — maxBytes 초과 시 즉시 abort
    const reader = res.body?.getReader();
    if (!reader) {
      return { ok: false, status: res.status, error: "no response body" };
    }
    const chunks: Uint8Array[] = [];
    let received = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > maxBytes) {
          await reader.cancel();
          return { ok: false, status: res.status, error: `response exceeds ${maxBytes} bytes` };
        }
        chunks.push(value);
      }
    } catch (e) {
      await reader.cancel().catch(() => {});
      return {
        ok: false,
        status: res.status,
        error: e instanceof Error ? e.message : "read failed",
      };
    }

    // 합치기
    const body = new Uint8Array(received);
    let offset = 0;
    for (const c of chunks) {
      body.set(c, offset);
      offset += c.byteLength;
    }

    return {
      ok: true,
      finalUrl: currentUrl.toString(),
      status: res.status,
      bodyBytes: body,
      contentType,
    };
  }

  return { ok: false, status: 0, error: `exceeded ${maxRedirects} redirects` };
}
