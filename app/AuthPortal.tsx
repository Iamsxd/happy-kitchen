"use client";

import { ArrowRight, ChefHat, KeyRound, Leaf, LockKeyhole, ShieldCheck, UserPlus, UsersRound } from "lucide-react";
import { FormEvent, useState } from "react";

type Mode = "LOGIN" | "REGISTER" | "ADMIN";

export function AuthPortal({ chatgptAvailable }: { chatgptAvailable: boolean }) {
  const [mode, setMode] = useState<Mode>("LOGIN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    const fields = Object.fromEntries(new FormData(event.currentTarget).entries());
    const endpoint = mode === "REGISTER" ? "/api/auth/register" : "/api/auth/login";
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...fields, mode: mode === "ADMIN" ? "ADMIN" : "USER" }) });
      const result = await readApiResult(response);
      if (!response.ok) throw new Error(result.error ?? "登录失败");
      window.location.assign(mode === "ADMIN" || result.user?.role === "ADMIN" && result.firstAccount ? "/admin" : "/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登录失败"); }
    finally { setBusy(false); }
  }

  async function continueWithChatGPT() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/chatgpt", { method: "POST" });
      const result = await readApiResult(response);
      if (!response.ok) throw new Error(result.error ?? "ChatGPT 登录失败");
      window.location.assign(result.user?.role === "ADMIN" ? "/admin" : "/");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "ChatGPT 登录失败"); }
    finally { setBusy(false); }
  }

  return <main className="auth-shell">
    <section className="auth-story">
      <div className="auth-brand"><span className="brand-mark"><Leaf size={25} /></span><span>快乐厨房</span></div>
      <div className="auth-story-copy"><p className="eyebrow">一家人的营养厨房</p><h1>把冰箱里的日常，<br />变成刚刚好的三餐。</h1><p>记住库存、照顾每个人的口味，也不错过快要到期的食材。</p></div>
      <div className="auth-features"><span><ChefHat size={17} />智能食谱</span><span><UsersRound size={17} />全家份量</span><span><ShieldCheck size={17} />安全约束</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-tabs" role="tablist">
        <button className={mode === "LOGIN" ? "active" : ""} onClick={() => { setMode("LOGIN"); setError(""); }}>账户登录</button>
        <button className={mode === "REGISTER" ? "active" : ""} onClick={() => { setMode("REGISTER"); setError(""); }}>注册</button>
        <button className={mode === "ADMIN" ? "active" : ""} onClick={() => { setMode("ADMIN"); setError(""); }}>管理员</button>
      </div>
      <div className="auth-title-icon">{mode === "REGISTER" ? <UserPlus /> : mode === "ADMIN" ? <LockKeyhole /> : <KeyRound />}</div>
      <h2>{mode === "REGISTER" ? "创建家庭账户" : mode === "ADMIN" ? "管理员登录" : "欢迎回来"}</h2>
      <p className="auth-subtitle">{mode === "REGISTER" ? "首个注册账户自动成为管理员" : mode === "ADMIN" ? "进入账户与权限管理后台" : "继续安排今天的一日三餐"}</p>
      <form className="auth-form" onSubmit={submit}>
        {mode === "REGISTER" && <label>昵称<input name="displayName" autoComplete="name" placeholder="例如：小满" required maxLength={30} /></label>}
        {mode === "REGISTER" && <label>家庭邀请码（可选）<input name="inviteCode" autoComplete="off" placeholder="例如：HK-ABCD1234" maxLength={32} /></label>}
        <label>用户名<input name="username" autoComplete="username" placeholder="3—24 位字符" required minLength={3} maxLength={24} /></label>
        <label>密码<input name="password" type="password" autoComplete={mode === "REGISTER" ? "new-password" : "current-password"} placeholder="至少 8 位" required minLength={8} maxLength={128} /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="primary-button full-button auth-submit" disabled={busy}>{busy ? "请稍候…" : <>{mode === "REGISTER" ? "注册并登录" : "登录"}<ArrowRight size={17} /></>}</button>
      </form>
      {chatgptAvailable && <><div className="auth-divider"><span>或</span></div><button className="secondary-button full-button" onClick={continueWithChatGPT} disabled={busy}>使用 ChatGPT 身份继续</button></>}
      <p className="password-note"><ShieldCheck size={14} />密码使用随机盐和 PBKDF2 哈希保存，不存储明文</p>
    </section>
  </main>;
}

async function readApiResult(response: Response): Promise<{ error?: string; user?: { role?: string }; firstAccount?: boolean }> {
  const body = await response.text();
  if (!body) throw new Error(response.ok ? "服务未返回数据，请重试" : "服务暂时不可用，请稍后重试");
  try {
    return JSON.parse(body) as { error?: string; user?: { role?: string }; firstAccount?: boolean };
  } catch {
    throw new Error("服务返回异常，请稍后重试");
  }
}
