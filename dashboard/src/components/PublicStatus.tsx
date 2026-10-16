import { useEffect, useState } from "react";
import { getPublicStatus, type PublicStatusData } from "../lib/api";
import { Icon } from "./Icon";
import { typeMeta } from "../lib/derive";

const COLOR: Record<string, string> = {
  up: "var(--up)", down: "var(--down)", warn: "var(--warn)", cf_protected: "var(--cf)",
};
const SOFT: Record<string, string> = {
  up: "var(--up-soft)", down: "var(--down-soft)", warn: "var(--warn-soft)", cf_protected: "var(--cf-soft)",
};
const LABEL: Record<string, string> = {
  up: "运行正常", down: "宕机", warn: "警告", cf_protected: "CF 防护",
};

function fmtPct(v: number | null): string {
  if (v == null) return "-";
  return (v >= 99.995 ? 100 : v).toFixed(v >= 99.995 ? 0 : 2) + "%";
}

export function PublicStatus({ slug }: { slug: string }) {
  const [data, setData] = useState<PublicStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => getPublicStatus(slug).then((d) => alive && setData(d)).catch((e) => alive && setError(String(e.message ?? e)));
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [slug]);

  if (error) {
    return (
      <div className="pubwrap">
        <div className="pubcard" style={{ textAlign: "center", padding: 48 }}>
          <div className="ring" style={{ margin: "0 auto 14px" }}><Icon n="radar" s={22} /></div>
          <h1 style={{ fontSize: 18, margin: 0 }}>状态页不存在</h1>
          <p style={{ color: "var(--muted)", fontSize: 13.5, marginTop: 8 }}>该状态页不可用或已设为私密。</p>
        </div>
      </div>
    );
  }

  const ok = data?.summary.operational;
  const headColor = !data ? "var(--faint)" : ok ? "var(--up)" : data.summary.down > 0 ? "var(--down)" : "var(--warn)";
  const headBg = !data ? "var(--sunken)" : ok ? "var(--up-soft)" : data.summary.down > 0 ? "var(--down-soft)" : "var(--warn-soft)";
  const headText = !data ? "加载中…" : ok
    ? "所有系统运行正常"
    : data.summary.down > 0
      ? `${data.summary.down} 个服务宕机`
      : `${data.summary.warn} 个警告`;

  const uptimeBar = (v: number | null) => {
    const pct = v == null ? 0 : Math.min(100, Math.max(0, v));
    const col = pct >= 99.9 ? "var(--up)" : pct >= 99 ? "var(--warn)" : "var(--down)";
    return (
      <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, height: 3, borderRadius: 2, background: "var(--sunken)", overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: col, borderRadius: 2, transition: "width .6s var(--ease)" }} />
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: "var(--faint)", flex: "none" }}>{fmtPct(v)}</span>
      </div>
    );
  };

  return (
    <div className="pubwrap">
      <div className="pubinner">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div className="logo" style={{ width: 26, height: 26, borderRadius: 8 }}><Icon n="shield" s={14} /></div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 500, letterSpacing: ".1em", color: "var(--muted)" }}>
            {data ? data.project.toUpperCase() : "STATUS"}
          </div>
        </div>

        <div style={{
          display: "flex", alignItems: "center", gap: 13, padding: "18px 22px", borderRadius: 14, border: `1px solid ${headColor}`,
          background: headBg, marginBottom: 14,
        }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%", background: headColor, flex: "none",
            boxShadow: `0 0 0 5px color-mix(in oklch, ${headColor} 18%, transparent), 0 0 16px color-mix(in oklch, ${headColor} 30%, transparent)`,
          }} />
          <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.025em" }}>{headText}</div>
        </div>

        <div className="pubcard" style={{ padding: 0, marginTop: 14 }}>
          {!data ? (
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="pubrow"><div className="sk" style={{ width: 160 + (i % 3) * 30, height: 14 }} /><div style={{ flex: 1 }} /><div className="sk" style={{ width: 60, height: 14 }} /></div>
            ))
          ) : data.services.length === 0 ? (
            <div className="pubrow" style={{ color: "var(--muted)", fontSize: 13 }}>暂无监控中的服务。</div>
          ) : (
            data.services.map((s, i) => (
              <div key={i} className="pubrow" style={{ padding: "18px 22px", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, flex: "1 1 200px" }}>
                  <span style={{
                    width: 10, height: 10, borderRadius: "50%", background: COLOR[s.status] ?? "var(--faint)", flex: "none",
                    boxShadow: `0 0 0 4px color-mix(in oklch, ${COLOR[s.status] ?? "var(--faint)"} 20%, transparent)`,
                  }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                    <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1 }}>{typeMeta(s.type).badge}</div>
                  </div>
                </div>
                <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600, padding: "3px 10px", borderRadius: 8,
                      background: SOFT[s.status] ?? "var(--surface-2)", color: COLOR[s.status] ?? "var(--fg)",
                    }}>
                      {LABEL[s.status] ?? "-"}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--faint)" }}>90 天在线率</span>
                  </div>
                  {uptimeBar(s.uptime_90d)}
                </div>
              </div>
            ))
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 18, fontSize: 11.5, color: "var(--faint)" }}>
          {data ? `${new Date(data.updated_at).toLocaleTimeString()} 更新 · ` : ""}由 Uptime Guard 监控
        </div>
      </div>
    </div>
  );
}
