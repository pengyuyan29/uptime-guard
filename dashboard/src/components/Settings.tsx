import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { api, setToken, type AppSettings } from "../lib/api";
import { Icon, type IconName } from "./Icon";
import { StatusGlyph } from "./ui";

const RETENTION_OPTIONS: [number, string][] = [
  [14, "14 天"], [30, "30 天"], [60, "60 天"], [90, "90 天"],
  [180, "180 天"], [365, "1 年"], [0, "永久保留"],
];

type SectionId = "notifications" | "telegram" | "security" | "data" | "appearance";
const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "notifications", label: "通知", icon: "bell" },
  { id: "telegram", label: "Telegram", icon: "send" },
  { id: "security", label: "安全", icon: "lock" },
  { id: "data", label: "数据", icon: "gauge" },
  { id: "appearance", label: "外观", icon: "sun" },
];

export function Settings({
  theme, onTheme, sound, onToggleSound, notify, onToggleNotify, onLogout, say,
}: {
  theme: "light" | "dark";
  onTheme: (t: "light" | "dark") => void;
  sound: boolean;
  onToggleSound: () => void;
  notify: boolean;
  onToggleNotify: () => void;
  onLogout: () => void;
  say: (m: string) => void;
}) {
  const [section, setSection] = useState<SectionId>("notifications");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const reload = () => api.getSettings().then(setSettings).catch(() => {});
  useEffect(() => { reload(); }, []);

  return (
    <div className="screen">
      <div className="settings2">
        <nav className="rail" aria-label="设置分区">
          {SECTIONS.map((s) => (
            <button key={s.id} className={section === s.id ? "on" : ""} onClick={() => setSection(s.id)}>
              <Icon n={s.icon} s={15} />{s.label}
            </button>
          ))}
        </nav>

        <div className="panel">
          {section === "notifications" && <Notifications sound={sound} onToggleSound={onToggleSound} notify={notify} onToggleNotify={onToggleNotify} />}
          {section === "telegram" && <Telegram settings={settings} onSaved={reload} say={say} />}
          {section === "security" && <Security settings={settings} onTotpSaved={reload} onLogout={onLogout} say={say} />}
          {section === "data" && <DataRetention settings={settings} onSaved={setSettings} say={say} />}
          {section === "appearance" && <Appearance theme={theme} onTheme={onTheme} />}
        </div>
      </div>
    </div>
  );
}

function Notifications({ sound, onToggleSound, notify, onToggleNotify }: { sound: boolean; onToggleSound: () => void; notify: boolean; onToggleNotify: () => void }) {
  const notifPerm = typeof Notification !== "undefined" ? Notification.permission : "unsupported";
  return (
    <div className="sec">
      <div className="h"><span className="name">通知</span></div>
      <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Row icon={sound ? "bell" : "bellOff"} title="警报音" desc="服务宕机或恢复时，在当前标签页播放提示音。" on={sound} onToggle={onToggleSound} />
        <Row
          icon="siren"
          title="桌面通知"
          desc={notifPerm === "denied" ? "已被浏览器阻止。请为该站点允许通知后再开启。" : "状态变化时发送系统通知 —— 应用关闭时也能送达。"}
          on={notify && notifPerm === "granted"}
          disabled={notifPerm === "denied" || notifPerm === "unsupported"}
          onToggle={onToggleNotify}
        />
      </div>
    </div>
  );
}

function Telegram({ settings, onSaved, say }: { settings: AppSettings | null; onSaved: () => void; say: (m: string) => void }) {
  const tg = settings?.telegram;
  const [token, setToken] = useState("");
  const [chat, setChat] = useState("");
  const [thread, setThread] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  useEffect(() => { if (tg) { setChat(tg.chat_id); setThread(tg.thread_id); } }, [tg?.chat_id, tg?.thread_id]);

  async function save() {
    setBusy("save");
    try {
      const patch: Record<string, string> = { telegram_chat_id: chat, telegram_thread_id: thread };
      if (token.trim()) patch.telegram_bot_token = token.trim(); // blank = keep existing
      await api.updateSettings(patch);
      setToken("");
      onSaved();
      say("Telegram 设置已保存");
    } catch { say("保存 Telegram 设置失败"); } finally { setBusy(""); }
  }
  async function test() {
    setBusy("test");
    try { await api.telegramTest(); say("测试消息已发送 —— 请查看 Telegram"); }
    catch (e) { say(e instanceof Error ? e.message : "测试失败"); } finally { setBusy(""); }
  }

  return (
    <div className="sec">
      <div className="h"><span className="name">Telegram 通知</span>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: tg?.has_token ? "var(--up)" : "var(--faint)" }}>
          <StatusGlyph k={tg?.has_token ? "up" : "unknown"} s={12} />{tg?.has_token ? "已配置" : "未设置"}
        </span>
      </div>
      <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 13 }}>
        <div className="field">
          <label className="fl">Bot Token</label>
          <input className="inp mono" type="password" value={token} placeholder={tg?.has_token ? `${tg.token_hint} · 留空保持不变` : "来自 @BotFather 的 123456:ABC-…"} onChange={(e) => setToken(e.target.value)} />
        </div>
        <div className="tgrid">
          <div className="field">
            <label className="fl">Chat / 频道 ID</label>
            <input className="inp mono" value={chat} placeholder="-1001234567890" onChange={(e) => setChat(e.target.value)} />
          </div>
          <div className="field">
            <label className="fl">话题 ID <span style={{ color: "var(--faint)", fontWeight: 400 }}>· 可选</span></label>
            <input className="inp mono" value={thread} placeholder="话题 ID" onChange={(e) => setThread(e.target.value)} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--faint)" }}>
          向 <strong>@BotFather</strong> 发消息即可创建 Bot。频道需将 Bot 设为管理员；ID 形如 <code>-100…</code>。话题 ID 用于定位论坛群中的特定话题。
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn pri t-fast press" onClick={save} disabled={busy !== ""}>{busy === "save" ? "保存中…" : "保存"}</button>
          <button className="btn t-fast press" onClick={test} disabled={busy !== "" || !tg?.has_token}>{busy === "test" ? "发送中…" : "发送测试"}</button>
        </div>
      </div>
    </div>
  );
}

function Security({ settings, onTotpSaved, onLogout, say }: { settings: AppSettings | null; onTotpSaved: () => void; onLogout: () => void; say: (m: string) => void }) {
  const [revoking, setRevoking] = useState(false);
  async function revokeOthers() {
    if (!confirm("注销其他所有设备？当前会话保持登录，其余登录将立即结束。")) return;
    setRevoking(true);
    try { const { token } = await api.revokeSessions(); setToken(token); say("其他会话已全部注销"); }
    catch { say("注销其他会话失败"); } finally { setRevoking(false); }
  }

  return (
    <>
      <TotpCard configured={settings?.totp.configured ?? false} onSaved={onTotpSaved} say={say} />
      <div className="sec">
        <div className="h"><span className="name">会话</span></div>
        <div style={{ padding: "16px 14px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
          <div style={{ flex: "1 1 240px" }}>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>以 <strong style={{ color: "var(--fg)" }}>所有者</strong> 身份登录 · 密码 + 验证器</div>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 3 }}>令牌保存在本浏览器 · 会话有效期 30 天</div>
          </div>
          <button className="btn t-fast press" disabled={revoking} onClick={revokeOthers}>{revoking ? "注销中…" : "退出其他设备"}</button>
          <button className="btn t-fast press" style={{ borderColor: "var(--down)", color: "var(--down)", fontWeight: 600 }} onClick={onLogout}>退出登录</button>
        </div>
      </div>
    </>
  );
}

function TotpCard({ configured, onSaved, say }: { configured: boolean; onSaved: () => void; say: (m: string) => void }) {
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function begin() {
    setBusy(true);
    try {
      const { secret, otpauth } = await api.totpNew();
      const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 190, color: { dark: "#0b0e14", light: "#ffffff" } });
      setSetup({ secret, otpauth, qr }); setCode("");
    } catch { say("无法开始验证器设置"); } finally { setBusy(false); }
  }
  async function confirm() {
    if (!setup) return;
    setBusy(true);
    try { await api.totpConfirm(setup.secret, code.trim()); setSetup(null); onSaved(); say("验证器已更新"); }
    catch (e) { say(e instanceof Error ? e.message : "验证码无效"); } finally { setBusy(false); }
  }

  return (
    <div className="sec">
      <div className="h"><span className="name">两步验证</span>
        <div style={{ flex: 1 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: configured ? "var(--up)" : "var(--warn)" }}>
          <StatusGlyph k={configured ? "up" : "warn"} s={12} />{configured ? "已配置" : "未设置"}
        </span>
      </div>
      <div style={{ padding: "16px 14px" }}>
        {!setup ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center" }}>
            <div style={{ flex: "1 1 260px", fontSize: 12.5, color: "var(--muted)" }}>
              登录时需要验证器 App 提供的 6 位验证码。重新配置会替换当前验证器。
            </div>
            <button className="btn t-fast press" disabled={busy} onClick={begin}>{busy ? "准备中…" : configured ? "重新配置" : "设置验证器"}</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
            <img src={setup.qr} alt="验证器二维码" width={158} height={158} style={{ borderRadius: 10, flex: "none", background: "#fff", padding: 6 }} />
            <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>使用 Google Authenticator / Authy 扫码，或手动输入密钥：</div>
              <div style={{ display: "flex", gap: 8 }}>
                <code className="mono" style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--sunken)", fontSize: 12, overflowWrap: "anywhere" }}>{setup.secret}</code>
                <button className="btn t-fast press" onClick={() => { navigator.clipboard?.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Icon n="copy" s={13} />{copied ? "已复制" : "复制"}</button>
              </div>
              <label className="fl" style={{ marginTop: 4 }}>输入 6 位验证码确认</label>
              <input className="inp mono" inputMode="numeric" maxLength={6} value={code} placeholder="000000" style={{ fontSize: 17, letterSpacing: ".22em", maxWidth: 180 }} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn pri t-fast press" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? "验证中…" : "确认保存"}</button>
                <button className="btn t-fast press" onClick={() => setSetup(null)}>取消</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DataRetention({ settings, onSaved, say }: { settings: AppSettings | null; onSaved: (s: AppSettings) => void; say: (m: string) => void }) {
  const [saving, setSaving] = useState(false);
  async function change(days: number) {
    setSaving(true);
    try { const s = await api.updateSettings({ retention_days: days }); onSaved(s); say(days === 0 ? "历史将永久保留" : `历史保留 ${days} 天`); }
    catch { say("更新保留策略失败"); } finally { setSaving(false); }
  }
  return (
    <div className="sec">
      <div className="h"><span className="name">数据保留</span></div>
      <div style={{ padding: "16px 14px" }}>
        <label className="fl">检查历史与故障记录保留时长</label>
        <select className="inp" style={{ maxWidth: 220 }} value={settings?.retention_days ?? 60} disabled={settings == null || saving} onChange={(e) => change(Number(e.target.value))}>
          {RETENTION_OPTIONS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          过期记录每天自动清理。「永久保留」会关闭清理 —— 历史将无限增长。
        </div>
      </div>
    </div>
  );
}

function Appearance({ theme, onTheme }: { theme: "light" | "dark"; onTheme: (t: "light" | "dark") => void }) {
  return (
    <div className="sec">
      <div className="h"><span className="name">外观</span></div>
      <div style={{ padding: "16px 14px" }}>
        <label className="fl">主题</label>
        <div style={{ display: "flex", gap: 2 }}>
          {(["light", "dark"] as const).map((t) => (
            <button key={t} className={`tabc${theme === t ? " on" : ""}`} onClick={() => onTheme(t)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Icon n={t === "light" ? "sun" : "moon"} s={13} />{t === "light" ? "浅色" : "深色"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Row({ icon, title, desc, on, disabled, onToggle }: { icon: "bell" | "bellOff" | "siren"; title: string; desc: string; on: boolean; disabled?: boolean; onToggle: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ color: on ? "var(--accent)" : "var(--faint)", flex: "none" }}><Icon n={icon} s={17} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{desc}</div>
      </div>
      <button className={`toggle${on ? " on" : ""}`} role="switch" aria-checked={on} aria-label={title} disabled={disabled} onClick={onToggle}>
        <span className="knob" />
      </button>
    </div>
  );
}
