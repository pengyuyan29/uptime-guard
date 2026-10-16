import { useEffect, useState } from "react";
import { getPublicStatus, type PublicStatusData } from "../lib/api";
import { Icon } from "./Icon";
import { typeMeta } from "../lib/derive";

const COLOR: Record<string, string> = {
  up: "var(--up)", down: "var(--down)", warn: "var(--warn)",
};
const LABEL: Record<string, string> = {
  up: "运行正常", down: "宕机", warn: "警告",
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
  const headText = !data ? "加载中…" : ok
    ? "所有系统运行正常"
    : data.summary.down > 0
      ? `${data.summary.down} 个服务宕机`
      : `${data.summary.warn} 个警告`;

  return (
    <div className="pubwrap">
      <div className="pubinner">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
          <div className="logo" style={{ width: 26, height: 26, borderRadius: 8 }}><Icon n="shield" s={14} /></div>
          <div className="mono" style={{ fontSize: 12, fontWeight: 500, letterSpacing: ".1em", color: "var(--muted)" }}>
            {data ? data.project.toUpperCase() : "STATUS"}
          </div>
        </div>

        <div className="pubcard pubhead" style={{ borderColor: headColor }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: headColor, flex: "none", boxShadow: `0 0 0 4px color-mix(in oklch, ${headColor} 22%, transparent)` }} />
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-.02em" }}>{headText}</div>
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
              <div key={i} className="pubrow">
                <span style={{ width: 9, height: 9, borderRadius: "50%", background: COLOR[s.status] ?? "var(--faint)", flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1 }}>{typeMeta(s.type).badge}</div>
                </div>
                <div style={{ flex: 1 }} />
                <div style={{ textAlign: "right", flex: "none" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: COLOR[s.status] ?? "var(--fg)" }}>{LABEL[s.status] ?? "-"}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--faint)", marginTop: 1 }}>{fmtPct(s.uptime_90d)} · 90 天</div>
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
