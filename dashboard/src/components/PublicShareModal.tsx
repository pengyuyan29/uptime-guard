import { useEffect, useState } from "react";
import { Icon } from "./Icon";

export function PublicShareModal({
  isPublic, slug, onClose, onSetPublic,
}: {
  isPublic: boolean;
  slug: string | null;
  onClose: () => void;
  onSetPublic: (makePublic: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = slug ? `${location.origin}/status/${slug}` : "";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function toggle(makePublic: boolean) {
    setBusy(true);
    try { await onSetPublic(makePublic); } finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.02em" }}>公开状态页</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>任何人可查看的只读页面 · 无需登录</div>
          </div>
          <button className="iconbtn t-fast" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="关闭"><Icon n="x" s={15} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="vseg" role="tablist" aria-label="项目可见性">
            <button role="tab" aria-selected={!isPublic} className={`vseg-i${!isPublic ? " on" : ""}`} disabled={busy} onClick={() => { if (isPublic) toggle(false); }}>
              <Icon n="lock" s={13} />私密
            </button>
            <button role="tab" aria-selected={isPublic} className={`vseg-i${isPublic ? " on" : ""}`} disabled={busy} onClick={() => { if (!isPublic) toggle(true); }}>
              <Icon n="globe" s={13} />公开
            </button>
          </div>

          <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
            {busy
              ? "保存中…"
              : isPublic
                ? "任何拥有下方链接的人都可查看当前状态和 90 天在线率。"
                : "仅你自己可见。"}
          </div>

          {isPublic && url && (
            <div>
              <label className="fl">分享链接</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8 }}>
                <input className="inp mono" readOnly value={url} style={{ fontSize: 12.5 }} onFocus={(e) => e.currentTarget.select()} />
                <button className="btn t-fast press" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>
                  <Icon n="copy" s={13} />{copied ? "已复制" : "复制"}
                </button>
                <a className="btn t-fast press" href={url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }} title="打开状态页">
                  <Icon n="chevron" s={13} />
                </a>
              </div>
            </div>
          )}

          <div style={{ fontSize: 12, color: "var(--faint)" }}>
            仅展示服务名称、当前状态和 90 天在线率 —— 绝不包含 URL、IP 地址或配置信息。
          </div>
        </div>
      </div>
    </div>
  );
}
