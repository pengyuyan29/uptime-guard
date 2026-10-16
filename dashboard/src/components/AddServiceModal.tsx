import { useEffect, useState } from "react";
import { api, type CheckType, type CreateServiceInput, type Service } from "../lib/api";
import { TYPES, cfg } from "../lib/derive";
import { Icon } from "./Icon";

const STEP: Record<CheckType, string> = { http: "请求", tcp: "连接", dns: "记录", tls: "证书", domain: "注册信息", heartbeat: "计划", script: "脚本" };
const INTERVALS: [string, string, number][] = [["1m", "1 分钟", 60], ["5m", "5 分钟", 300], ["15m", "15 分钟", 900], ["daily", "每天", 86400]];

const SCRIPT_PLACEHOLDER = `GET https://api.example.com/auth
header content-type: application/json
body {"user":"probe","pass":"..."}
expect status 200
capture token = json data.token

POST https://api.example.com/orders
header authorization: Bearer {{token}}
expect status 200
expect json orders.count > 0
expect time < 800ms`;

// One line per directive. Kept next to the editor so the format is discoverable
// without leaving the modal.
const SCRIPT_HELP: [string, string][] = [
  ["GET | POST | PUT | PATCH | DELETE | HEAD <url>", "开启一个步骤"],
  ["header <name>: <value>", "可重复"],
  ["body <text>", "可重复，添加多行"],
  ["expect status 200  ·  200-299", "默认要求 2xx"],
  ["expect time < 800ms", ""],
  ["expect body contains | not contains | matches <text>", ""],
  ["expect json <path> = != > < >= <= contains exists <value>", ""],
  ["capture <name> = json <path> | header <name> | status | body", "之后以 {{name}} 复用"],
  ["# comment", "注释"],
];

const DEFAULT_FORM = {
  name: "", url: "", method: "GET", statusMin: "200", statusMax: "299", keyword: "", keywordMode: "present",
  host: "", port: "", domain: "", record: "A", expected: "", warnDays: "", every: "24h", grace: "30m", script: "",
};
function fmtDur(sec: number): string {
  if (sec % 86400 === 0) return sec / 86400 + "d";
  if (sec % 3600 === 0) return sec / 3600 + "h";
  return Math.round(sec / 60) + "m";
}
/** Map an existing service back into editable form fields. */
function formFromService(s: Service): Record<string, string> {
  const c = cfg(s);
  const f = { ...DEFAULT_FORM, name: s.name };
  if (s.check_type === "http") {
    f.url = s.url; f.method = s.method;
    f.statusMin = String(s.expected_status_min); f.statusMax = String(s.expected_status_max);
    if (c.keyword) { f.keyword = String(c.keyword); f.keywordMode = String(c.keyword_mode ?? "present"); }
  } else if (s.check_type === "tcp") { f.host = String(c.host ?? ""); f.port = String(c.port ?? ""); }
  else if (s.check_type === "dns") { f.domain = String(c.domain ?? ""); f.record = String(c.record_type ?? "A"); f.expected = String(c.expected ?? ""); }
  else if (s.check_type === "tls") { f.host = String(c.host ?? ""); f.port = String(c.port ?? 443); f.warnDays = c.warn_days != null ? String(c.warn_days) : ""; }
  else if (s.check_type === "domain") { f.domain = String(c.domain ?? ""); f.warnDays = c.warn_days != null ? String(c.warn_days) : ""; }
  else if (s.check_type === "heartbeat") { f.every = fmtDur(s.interval_seconds); f.grace = fmtDur(Number(c.grace_seconds ?? s.interval_seconds * 2)); }
  else if (s.check_type === "script") { f.script = String(c.script ?? ""); }
  return f;
}
function intervalKey(sec: number): string {
  return sec >= 86400 ? "daily" : sec >= 900 ? "15m" : sec >= 300 ? "5m" : "1m";
}

export function AddServiceModal({
  projectId, projectName, edit, onClose, onCreated, say,
}: {
  projectId: string;
  projectName: string;
  edit?: Service | null;
  onClose: () => void;
  onCreated: () => void;
  say: (m: string) => void;
}) {
  const [type, setType] = useState<CheckType>(edit?.check_type ?? "http");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>(() => (edit ? formFromService(edit) : { ...DEFAULT_FORM }));
  const [interval, setIntervalKey] = useState(edit ? intervalKey(edit.interval_seconds) : "5m");
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const expiry = type === "tls" || type === "domain";

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function pickType(t: CheckType) {
    setType(t); setErr(null);
    setIntervalKey(t === "tls" || t === "domain" ? "daily" : "5m");
  }

  function toSeconds(v: string): number {
    const m = /^(\d+)\s*(s|m|h|d)?$/i.exec(v.trim());
    if (!m) return 86400;
    const n = +m[1], u = (m[2] || "m").toLowerCase();
    return n * (u === "s" ? 1 : u === "m" ? 60 : u === "h" ? 3600 : 86400);
  }

  async function save() {
    if (!f.name.trim()) return setErr("请为监控项命名。");
    const data: CreateServiceInput = { name: f.name.trim(), check_type: type };
    if (type === "http") {
      if (!f.url.trim()) return setErr("请输入 URL。");
      data.url = f.url.trim(); data.method = f.method;
      data.expected_status_min = +f.statusMin || 200; data.expected_status_max = +f.statusMax || 299;
      if (f.keyword.trim()) { data.keyword = f.keyword.trim(); data.keyword_mode = f.keywordMode as "present" | "absent"; }
    } else if (type === "tcp") {
      if (!f.host.trim() || !f.port.trim()) return setErr("请填写主机和端口。");
      data.host = f.host.trim(); data.port = +f.port;
    } else if (type === "dns") {
      if (!f.domain.trim()) return setErr("请输入域名。");
      data.domain = f.domain.trim(); data.record_type = f.record; if (f.expected.trim()) data.expected = f.expected.trim();
    } else if (type === "tls") {
      if (!f.host.trim()) return setErr("请输入主机。");
      data.host = f.host.trim(); if (f.port.trim()) data.port = +f.port; if (f.warnDays.trim()) data.warn_days = +f.warnDays;
    } else if (type === "domain") {
      if (!f.domain.trim()) return setErr("请输入域名。");
      data.domain = f.domain.trim(); if (f.warnDays.trim()) data.warn_days = +f.warnDays;
    } else if (type === "script") {
      if (!f.script.trim()) return setErr("请编写脚本 —— 至少包含一行请求。");
      data.script = f.script;
    } else if (type === "heartbeat") {
      data.interval_seconds = toSeconds(f.every); data.grace_seconds = toSeconds(f.grace);
    }
    if (type !== "heartbeat") data.interval_seconds = INTERVALS.find((i) => i[0] === interval)?.[2] ?? 300;

    setBusy(true); setErr(null);
    try {
      if (edit) { await api.updateService(edit.id, data); say("服务已更新"); }
      else { await api.createService(projectId, data); say("服务已添加，60 秒内进行首次检查"); }
      onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  const F = (label: string, node: React.ReactNode, full?: boolean) => (
    <div className="field" style={full ? { gridColumn: "1/-1" } : undefined}><label>{label}</label>{node}</div>
  );
  const inp = (k: string, ph = "", mono = true) => <input className={`inp${mono ? " mono" : ""}`} value={f[k]} placeholder={ph} onChange={(e) => set(k, e.target.value)} />;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.02em" }}>{edit ? "编辑服务" : "添加服务"}</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>项目：{projectName}</div>
          </div>
          <button className="iconbtn t-fast" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="关闭"><Icon n="x" s={15} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 9 }}>1 · 要监控什么？</div>
            <div className="typegrid">
              {TYPES.map(({ type: t, meta }) => (
                <button key={t} className={`typecard t-fast${type === t ? " on" : ""}`} onClick={() => pickType(t)}>
                  <span style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span className="badge">{meta.badge}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.012em" }}>{meta.name}</span>
                  </span>
                  <span style={{ display: "block", marginTop: 5, fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>{meta.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 9 }}>2 · {STEP[type]}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
              {F("名称", inp("name", type === "http" ? "GitHub API" : "我的监控项", false), true)}

              {type === "http" && <>
                {F("URL", inp("url", "https://api.example.com/health"), true)}
                {F("请求方法", <select className="inp mono" value={f.method} onChange={(e) => set("method", e.target.value)}><option>GET</option><option>HEAD</option><option>POST</option></select>)}
                {F("期望状态码", <div style={{ display: "flex", gap: 6 }}>{inp("statusMin")}{inp("statusMax")}</div>)}
                <div className="field" style={{ gridColumn: "1/-1", display: "grid", gridTemplateColumns: "150px 1fr", gap: 8 }}>
                  <select className="inp" style={{ background: "var(--sunken)", fontSize: 12.5 }} value={f.keywordMode} onChange={(e) => set("keywordMode", e.target.value)}><option value="present">响应体包含</option><option value="absent">响应体不得包含</option></select>
                  {inp("keyword", "可选关键词")}
                </div>
              </>}
              {type === "tcp" && <>{F("主机", inp("host", "db.internal"))}{F("端口", inp("port", "5432"))}</>}
              {type === "dns" && <>
                {F("域名", inp("domain", "example.com"))}
                {F("记录类型", <select className="inp mono" value={f.record} onChange={(e) => set("record", e.target.value)}>{["A", "AAAA", "CNAME", "MX", "TXT", "NS"].map((r) => <option key={r}>{r}</option>)}</select>)}
                {F("期望值（可选）", inp("expected", "93.184.215.14"), true)}
              </>}
              {type === "tls" && <>{F("主机", inp("host", "example.com"))}{F("端口", inp("port", "443"))}{F("到期前提前预警（天）", inp("warnDays", "14"), true)}</>}
              {type === "domain" && <>{F("域名", inp("domain", "example.com"))}{F("到期前提前预警（天）", inp("warnDays", "30"))}</>}
              {type === "script" && <>
                <div className="field" style={{ gridColumn: "1/-1" }}>
                  <label>脚本</label>
                  <textarea
                    className="inp mono"
                    value={f.script}
                    onChange={(e) => set("script", e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Tab") { e.preventDefault(); const t = e.currentTarget; const at = t.selectionStart; set("script", f.script.slice(0, at) + "  " + f.script.slice(t.selectionEnd)); requestAnimationFrame(() => t.setSelectionRange(at + 2, at + 2)); } }}
                    placeholder={SCRIPT_PLACEHOLDER}
                    spellCheck={false}
                    rows={12}
                    style={{ resize: "vertical", lineHeight: 1.55, minHeight: 200, whiteSpace: "pre", overflowWrap: "normal", overflowX: "auto" }}
                  />
                  <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
                    自上而下执行 · 最多 10 个步骤 · 整个运行共享一个超时时间。任一断言失败即标记为宕机。
                  </div>
                </div>
                <div style={{ gridColumn: "1/-1", padding: "11px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--sunken)" }}>
                  <div className="eyebrow" style={{ marginBottom: 8 }}>指令说明</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {SCRIPT_HELP.map(([syntax, note]) => (
                      <div key={syntax} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
                        <code style={{ fontSize: 11.5, color: "var(--fg)" }}>{syntax}</code>
                        {note && <span style={{ fontSize: 11, color: "var(--faint)" }}>{note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </>}
              {type === "heartbeat" && <>
                {F("预期间隔", inp("every", "24h"))}
                {F("宽限期", inp("grace", "30m"))}
                <div style={{ gridColumn: "1/-1", padding: "11px 12px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--sunken)", fontSize: 12.5, color: "var(--muted)" }}>
                  保存后将生成唯一的 Ping 地址。请在定时任务每次成功运行后调用它。
                </div>
              </>}

              {type !== "heartbeat" && (
                <div className="field" style={{ gridColumn: "1/-1" }}>
                  <label>检查间隔</label>
                  <div style={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                    {(expiry ? INTERVALS.filter((i) => i[0] === "daily") : INTERVALS).map(([k, label]) => (
                      <button key={k} className={`tabc${interval === k ? " on" : ""}`} onClick={() => setIntervalKey(k)}>{label}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 6 }}>
                    {expiry ? "到期检查每天运行一次。" : "Worker 定时任务每 60 秒运行一次；检查间隔需为其整数倍。"}
                  </div>
                </div>
              )}
            </div>
          </div>
          {err && <div style={{ padding: "10px 12px", border: "1px solid var(--down)", borderRadius: 9, background: "var(--down-soft)", fontSize: 13, color: "var(--fg)" }}>{err}</div>}
        </div>

        <div className="mf">
          <div style={{ flex: 1, fontSize: 12, color: "var(--faint)" }}>{edit ? "更改将在下次检查时生效。" : "保存后 60 秒内开始检查。"}</div>
          <button className="btn t-fast press" onClick={onClose}>取消</button>
          <button className="btn pri t-fast press" onClick={save} disabled={busy}>{busy ? "保存中…" : edit ? "保存更改" : "保存服务"}</button>
        </div>
      </div>
    </div>
  );
}
