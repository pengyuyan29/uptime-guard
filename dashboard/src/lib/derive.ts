import type { Service, CheckType } from "./api";
import type { IconName } from "../components/Icon";

export type StatusKind = "up" | "down" | "warn" | "paused" | "unknown" | "cf_protected";

const DAY = 86_400_000;

/** Parse a service's JSON config safely. */
export function cfg(s: Service): Record<string, unknown> {
  try {
    return JSON.parse(s.config || "{}");
  } catch {
    return {};
  }
}

/** Days until expiry, or null. */
export function expiryDays(s: Service): number | null {
  if (s.expires_at == null) return null;
  return Math.floor((s.expires_at - Date.now()) / DAY);
}

/** The single display status for a service, folding in pause + expiry warnings. */
export function statusOf(s: Service): StatusKind {
  if (s.paused) return "paused";
  if (s.current_status === "cf_protected") return "cf_protected";
  if (s.check_type === "tls" || s.check_type === "domain") {
    // Expiring soon is a warning, not an outage; only expired or unreadable is "down".
    const d = expiryDays(s);
    const warn = Number(cfg(s).warn_days ?? (s.check_type === "tls" ? 14 : 30));
    if (d != null && d <= warn) return d < 0 ? "down" : "warn";
    if (s.current_status === "down") return "down";
  }
  if (s.current_status === "down") return "down";
  if (s.current_status === "up") return "up";
  return "unknown";
}

export const statusColor = (k: StatusKind) =>
  k === "down" ? "var(--down)" : k === "warn" ? "var(--warn)" : k === "paused" ? "var(--paused)" : k === "cf_protected" ? "var(--cf)" : k === "unknown" ? "var(--faint)" : "var(--up)";
export const statusSoft = (k: StatusKind) =>
  k === "down" ? "var(--down-soft)" : k === "warn" ? "var(--warn-soft)" : k === "paused" ? "var(--sunken)" : k === "cf_protected" ? "var(--cf-soft)" : "var(--up-soft)";
export const statusLabel = (k: StatusKind) =>
  k === "down" ? "宕机" : k === "warn" ? "警告" : k === "paused" ? "已暂停" : k === "cf_protected" ? "CF 防护中" : k === "unknown" ? "等待中" : "正常";
/** Expiry monitors read as Valid / Expiring / Expired / Check failed, heartbeats as On time / Missed. */
export function labelOf(s: Service): string | undefined {
  const k = statusOf(s);
  if (s.check_type === "heartbeat") return k === "down" ? (s.last_ping_at ? "漏报" : "暂无 Ping") : k === "up" ? "准时" : undefined;
  if (s.check_type !== "tls" && s.check_type !== "domain") return undefined;
  if (k === "warn") return "即将到期";
  if (k === "down") return (expiryDays(s) ?? 0) < 0 ? "已过期" : "检查失败";
  if (k === "up") return "有效";
  return undefined;
}

/** Short verb phrase for a status change, worded for the monitor type. */
export function changePhrase(s: Service, bad: boolean): string {
  const l = labelOf(s);
  if (bad) return l === "已过期" ? "已过期" : l === "漏报" || l === "暂无 Ping" ? "签到超时" : l === "检查失败" ? "检查失败" : "已宕机";
  return s.check_type === "heartbeat" ? "已恢复签到" : s.check_type === "tls" || s.check_type === "domain" ? "已恢复有效" : "已恢复";
}

/** Same idea for a single recorded check of an expiry monitor, from its error text. */
export function checkLabel(type: CheckType, status: string, error: string | null): string | undefined {
  if (type === "heartbeat") return status === "up" ? "准时" : status === "down" ? "漏报" : undefined;
  if (type !== "tls" && type !== "domain") return undefined;
  if (status === "up") return "有效";
  if (status !== "down") return undefined;
  if (error && / expired /.test(error)) return "已过期";
  if (error && / expires in /.test(error)) return "即将到期";
  return "检查失败";
}

export const statusIcon = (k: StatusKind): IconName =>
  k === "down" ? "cX" : k === "warn" ? "tri" : k === "paused" ? "cPause" : k === "cf_protected" ? "cloud" : "cCheck";

/** Rank for severity sort · most urgent first. */
const RANK: Record<StatusKind, number> = { down: 0, warn: 1, unknown: 2, up: 3, cf_protected: 4, paused: 5 };
export function bySeverity(a: Service, b: Service) {
  return RANK[statusOf(a)] - RANK[statusOf(b)];
}

export interface Beat {
  kind: "up" | "down" | "blank";
  tip?: string;
}
/** Build a fixed-width heartbeat strip from recent[] (newest last), padded with blanks. */
export function beats(s: Service, n = 40): Beat[] {
  const rec = s.recent ?? [];
  const tail = rec.slice(-n);
  const pad = Math.max(0, n - tail.length);
  const out: Beat[] = [];
  for (let i = 0; i < pad; i++) out.push({ kind: "blank" });
  for (const c of tail) {
    const down = c.status === "down";
    const expiry = s.check_type === "tls" || s.check_type === "domain";
    const label = c.status === "cf_protected" ? "CF 防护中"
      : expiry ? (down ? "警告" : "有效")
      : s.check_type === "heartbeat" ? (down ? "漏报" : "准时")
      : down ? "宕机" : "正常";
    const ms = !down && c.response_time_ms != null ? ` · ${c.response_time_ms} ms` : "";
    const clock = new Date(c.checked_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    out.push({ kind: down ? "down" : "up", tip: `${label}${ms} · ${clock} · ${timeAgo(c.checked_at)}` });
  }
  return out;
}

export function uptimePct(s: Service): string {
  if (s.check_type === "tls" || s.check_type === "domain") return "-";
  if (s.uptime_24h == null) return "-";
  const v = s.uptime_24h;
  return (v >= 99.995 ? 100 : v).toFixed(v >= 99.995 ? 0 : 2) + "%";
}

export function respMs(s: Service): string {
  if (s.check_type === "heartbeat" || s.check_type === "domain") return "-";
  if (statusOf(s) === "down") return "-";
  if (s.avg_response_ms == null) return "-";
  return s.avg_response_ms + " ms";
}

/** Mask the last two octets of any IPv4 address for privacy in the read-only UI. */
export function maskIp(str: string): string {
  return str.replace(/\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, "$1.$2.•.•");
}

/** Target text shown under the service name. */
export function targetOf(s: Service): string {
  if (s.check_type === "heartbeat") return s.heartbeat_token ? `/ping/${s.heartbeat_token.slice(0, 6)}…` : "heartbeat";
  // Script urls are stored as "script:<n> steps · GET <first url>" for exactly this.
  if (s.check_type === "script") return maskIp(s.url.replace(/^script:/, ""));
  return maskIp(s.url);
}

export function timeAgo(ts: number | null): string {
  if (!ts) return "从未";
  const d = Math.max(0, Date.now() - ts);
  const s = Math.floor(d / 1000);
  if (s < 60) return s + " 秒前";
  const m = Math.floor(s / 60);
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  return Math.floor(h / 24) + " 天前";
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export interface Summary {
  up: number;
  down: number;
  warn: number;
  paused: number;
  fleet: string;
}
export function summarize(list: Service[]): Summary {
  let up = 0, down = 0, warn = 0, paused = 0;
  const upt: number[] = [];
  for (const s of list) {
    const k = statusOf(s);
    if (k === "up") up++;
    else if (k === "down") down++;
    else if (k === "warn") warn++;
    else if (k === "paused") paused++;
    if (s.uptime_24h != null && s.check_type !== "tls" && s.check_type !== "domain") upt.push(s.uptime_24h);
  }
  const fleet = upt.length ? (upt.reduce((a, b) => a + b, 0) / upt.length).toFixed(2) + "%" : "-";
  return { up, down, warn, paused, fleet };
}

export interface TypeMeta {
  badge: string;
  name: string;
  desc: string;
}
export const TYPES: { type: CheckType; meta: TypeMeta }[] = [
  { type: "http", meta: { badge: "HTTP", name: "HTTP(S)", desc: "请求一个 URL，检查状态码、响应体或 JSON 字段。" } },
  { type: "tcp", meta: { badge: "TCP", name: "TCP 端口", desc: "建立到 host:port 的连接 · SSH、Postgres、SMTP、游戏服务器。" } },
  { type: "dns", meta: { badge: "DNS", name: "DNS 记录", desc: "解析 A / AAAA / CNAME / MX / TXT / NS，可选校验记录值。" } },
  { type: "tls", meta: { badge: "TLS", name: "TLS 证书", desc: "读取站点证书，在过期前提前预警。" } },
  { type: "domain", meta: { badge: "DOMAIN", name: "域名到期", desc: "通过 WHOIS / RDAP 关注注册商到期日期。" } },
  { type: "heartbeat", meta: { badge: "HEARTBEAT", name: "心跳", desc: "定时任务主动 Ping 一个地址。宽限期内无 Ping 即视为宕机。" } },
  { type: "script", meta: { badge: "SCRIPT", name: "自定义脚本", desc: "串联多个请求，在步骤间传递变量，并对每一步断言。" } },
];
export const typeMeta = (t: CheckType): TypeMeta => TYPES.find((x) => x.type === t)?.meta ?? TYPES[0].meta;
