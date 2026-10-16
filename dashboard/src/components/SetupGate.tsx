import { useState } from "react";
import QRCode from "qrcode";
import { setupAccount, setupTotpNew, getConfig } from "../lib/api";
import { Icon } from "./Icon";

type Totp = { secret: string; otpauth: string; qr: string };

/**
 * First-run wizard. Two required steps: owner password, then authenticator -
 * the account is only created once both are set, so an instance is never live
 * with a single factor.
 */
export function SetupGate({ onReady }: { onReady: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [totp, setTotp] = useState<Totp | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const passwordReady = password.length >= 8 && confirm === password;

  async function toStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!passwordReady) return;
    setBusy(true);
    setError(null);
    try {
      // Mint the secret once and keep it while the user scans; re-minting on
      // re-render would invalidate the QR they are looking at.
      const next = totp ?? (await mintTotp());
      setTotp(next);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function mintTotp(): Promise<Totp> {
    const { secret, otpauth } = await setupTotpNew(getConfig().baseUrl);
    const qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 190, color: { dark: "#0b0e14", light: "#ffffff" } });
    return { secret, otpauth, qr };
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!totp || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      await setupAccount(getConfig().baseUrl, password, totp.secret, code);
      onReady();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="pane">
        <form className="box" onSubmit={step === 1 ? toStep2 : submit}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 30 }}>
            <div className="logo" style={{ width: 26, height: 26, borderRadius: 8 }}><Icon n="shield" s={14} /></div>
            <div className="mono" style={{ fontSize: 12, fontWeight: 500, letterSpacing: ".1em" }}>UPTIME GUARD</div>
          </div>

          <div className="mono" style={{ fontSize: 11, color: "var(--faint)", letterSpacing: ".1em", marginBottom: 8 }}>
            第 {step} 步 / 共 2 步
          </div>
          <h1>{step === 1 ? "创建账户" : "绑定验证器"}</h1>
          <p className="lead">
            {step === 1
              ? "首次设置 —— 请设置所有者密码。下一步需要绑定验证器 App，此步骤必需。"
              : "在验证器 App 中扫码，然后输入其显示的 6 位数字确认。之后每次登录都需要。"}
          </p>

          {error && (
            <div role="alert" style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "10px 12px", marginBottom: 18, border: "1px solid var(--down)", borderRadius: 9, background: "var(--down-soft)" }}>
              <div style={{ width: 8, height: 8, background: "var(--down)", borderRadius: "50%", marginTop: 5, flex: "none" }} />
              <div style={{ fontWeight: 600, fontSize: 13 }}>{error}</div>
            </div>
          )}

          {step === 1 ? (
            <>
              <label className="fl">密码</label>
              <input className="inp" type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 12, color: tooShort ? "var(--warn)" : "var(--faint)", marginBottom: 16 }}>
                至少 8 个字符。
              </div>

              <label className="fl">确认密码</label>
              <input className="inp" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ marginBottom: 6 }} />
              <div style={{ fontSize: 12, color: mismatch ? "var(--down)" : "var(--faint)", marginBottom: 20 }}>
                {mismatch ? "两次输入的密码不一致。" : "请再次输入密码。"}
              </div>

              <button className="btn pri press" type="submit" disabled={busy || !passwordReady} style={{ width: "100%", justifyContent: "center", padding: 11 }}>
                {busy ? "准备中…" : "继续"}
              </button>
            </>
          ) : (
            <>
              {totp && (
                <>
                  <img src={totp.qr} alt="验证器二维码" width={158} height={158} style={{ borderRadius: 10, background: "#fff", padding: 6, marginBottom: 14 }} />
                  <div style={{ fontSize: 12.5, color: "var(--muted)", marginBottom: 8 }}>
                    在 Google Authenticator / Authy 中扫码，或手动输入密钥：
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                    <code className="mono" style={{ flex: 1, minWidth: 0, padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--sunken)", fontSize: 12, overflowWrap: "anywhere" }}>{totp.secret}</code>
                    <button type="button" className="btn t-fast press" onClick={() => { navigator.clipboard?.writeText(totp.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                      <Icon n="copy" s={13} />{copied ? "已复制" : "复制"}
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--warn)", marginBottom: 18 }}>
                    请妥善保存该密钥。设备丢失时，它是唯一的找回方式。
                  </div>
                </>
              )}

              <label className="fl">6 位验证码</label>
              <input className="inp mono" inputMode="numeric" maxLength={6} autoFocus value={code} placeholder="000000" onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} style={{ fontSize: 18, letterSpacing: ".26em", marginBottom: 20 }} />

              <button className="btn pri press" type="submit" disabled={busy || code.length !== 6} style={{ width: "100%", justifyContent: "center", padding: 11 }}>
                {busy ? "创建中…" : "创建账户并登录"}
              </button>
              <button type="button" className="mono" onClick={() => { setStep(1); setError(null); }} style={{ marginTop: 16, padding: 0, border: 0, background: "none", color: "var(--faint)", fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                返回设置密码
              </button>
            </>
          )}
        </form>
      </div>
      <div className="aside">
        <div className="mono" style={{ fontSize: 11, color: "var(--faint)", letterSpacing: ".1em" }}>欢迎</div>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.02em", lineHeight: 1.5 }}>
          你的 Uptime Guard 已部署完成。
        </div>
        <div style={{ fontSize: 12.5, color: "var(--muted)", maxWidth: "34ch" }}>
          用密码和验证器 App 认领此实例，然后添加第一个监控项。一切都在你自己的 Cloudflare 账户上运行。
        </div>
      </div>
    </div>
  );
}
