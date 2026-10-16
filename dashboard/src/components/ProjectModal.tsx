import { useEffect, useState } from "react";
import { Icon } from "./Icon";

/**
 * Rename or delete the selected project. Deleting cascades to every monitor and
 * its history, so a project that still has monitors asks for the name to be typed.
 */
export function ProjectModal({
  name, serviceCount, onClose, onRename, onDelete,
}: {
  name: string;
  serviceCount: number;
  onClose: () => void;
  onRename: (next: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [draft, setDraft] = useState(name);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0 && trimmed !== name;
  const canDelete = serviceCount === 0 || typed.trim() === name;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    try { await onRename(trimmed); onClose(); } finally { setBusy(false); }
  }
  async function remove() {
    if (!canDelete) return;
    setBusy(true);
    try { await onDelete(); onClose(); } finally { setBusy(false); }
  }

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.02em" }}>项目设置</div>
            <div style={{ fontSize: 12.5, color: "var(--muted)", overflowWrap: "anywhere" }}>{name}</div>
          </div>
          <button className="iconbtn t-fast" style={{ width: 28, height: 28 }} onClick={onClose} aria-label="关闭"><Icon n="x" s={15} /></button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="field">
            <label htmlFor="project-name">名称</label>
            <input
              id="project-name"
              className="inp"
              autoFocus
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            />
          </div>

          {!confirming ? (
            <button
              className="btn t-fast press"
              disabled={busy}
              onClick={() => setConfirming(true)}
              style={{ alignSelf: "flex-start", color: "var(--down)", borderColor: "var(--down)" }}
            >
              <Icon n="trash" s={13} />删除项目
            </button>
          ) : (
            <div style={{ padding: 12, border: "1px solid var(--down)", borderRadius: 10, background: "var(--down-soft)", display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                删除此项目{serviceCount > 0 ? `及其 ${serviceCount} 个监控项？` : "？"}
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                故障历史和检查结果将一并删除，此操作无法撤销。
              </div>
              {serviceCount > 0 && (
                <input
                  className="inp"
                  autoFocus
                  value={typed}
                  disabled={busy}
                  placeholder={`输入 "${name}" 以确认`}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") remove(); }}
                />
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn t-fast press" disabled={busy || !canDelete} onClick={remove} style={{ background: "var(--down)", borderColor: "var(--down)", color: "var(--accent-fg)" }}>
                  {busy ? "删除中…" : "永久删除"}
                </button>
                <button className="btn t-fast press" disabled={busy} onClick={() => { setConfirming(false); setTyped(""); }}>取消</button>
              </div>
            </div>
          )}
        </div>

        <div className="mf">
          <div style={{ flex: 1 }} />
          <button className="btn t-fast press" disabled={busy} onClick={onClose}>关闭</button>
          <button className="btn pri t-fast press" disabled={busy || !canSave} onClick={save}>{busy ? "保存中…" : "保存名称"}</button>
        </div>
      </div>
    </div>
  );
}
