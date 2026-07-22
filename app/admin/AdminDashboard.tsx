"use client";

import { ArrowLeft, CheckCircle2, KeyRound, Leaf, LogOut, RefreshCw, ShieldCheck, UserRoundCheck, UsersRound, UserX } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type User = { id: string; username: string; display_name: string; auth_provider: string; role: "USER" | "ADMIN"; active: number; created_at: string; last_login_at: string | null };

export function AdminDashboard({ currentName }: { currentName: string }) {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch("/api/admin/users", { cache: "no-store" });
    if (!response.ok) { window.location.assign("/"); return; }
    const data = await response.json();
    setUsers(data.users); setCurrentUserId(data.currentUserId); setLoading(false);
  }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  const stats = useMemo(() => ({ total: users.length, admins: users.filter((user) => user.role === "ADMIN").length, active: users.filter((user) => user.active).length }), [users]);

  async function update(userId: string, patch: Record<string, unknown>) {
    const response = await fetch("/api/admin/users", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId, ...patch }) });
    const result = await response.json();
    setMessage(response.ok ? "账户权限已更新" : result.error ?? "更新失败");
    if (response.ok) await load();
    setTimeout(() => setMessage(""), 2600);
  }

  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.assign("/"); }

  return <main className="admin-shell">
    <header className="admin-header"><div className="brand"><span className="brand-mark"><Leaf size={21} /></span><span>快乐厨房</span></div><div className="admin-header-actions"><span>{currentName} · 管理员</span><button onClick={() => window.location.assign("/")}><ArrowLeft size={16} />返回应用</button><button onClick={logout}><LogOut size={16} />退出</button></div></header>
    <div className="admin-content">
      <div className="page-heading"><div><p className="eyebrow">账户与权限</p><h1>管理员后台</h1><p>查看注册账户、登录方式和账户状态。</p></div><button className="secondary-button" onClick={load}><RefreshCw size={16} />刷新</button></div>
      <section className="admin-stats"><div><span className="summary-icon green"><UsersRound size={20} /></span><p><strong>{stats.total}</strong><small>注册账户</small></p></div><div><span className="summary-icon orange"><ShieldCheck size={20} /></span><p><strong>{stats.admins}</strong><small>管理员</small></p></div><div><span className="summary-icon blue"><UserRoundCheck size={20} /></span><p><strong>{stats.active}</strong><small>启用账户</small></p></div></section>
      <section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">用户列表</p><h2>全部账户</h2></div><span>首个注册账户自动获得管理员权限</span></div>{loading ? <div className="admin-loading">正在读取账户…</div> : <div className="admin-table-wrap"><table><thead><tr><th>用户</th><th>登录方式</th><th>角色</th><th>状态</th><th>最近登录</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><div className="user-cell"><span>{user.display_name.slice(0, 1)}</span><div><strong>{user.display_name}</strong><small>{user.username}</small></div></div></td><td><span className="provider-badge"><KeyRound size={13} />{user.auth_provider === "PASSWORD" ? "用户名密码" : "ChatGPT"}</span></td><td><span className={`role-badge ${user.role.toLowerCase()}`}>{user.role === "ADMIN" ? "管理员" : "普通用户"}</span></td><td><span className={`account-status ${user.active ? "active" : "disabled"}`}>{user.active ? "已启用" : "已停用"}</span></td><td>{user.last_login_at ? formatDate(user.last_login_at) : "尚未登录"}</td><td><div className="row-actions">{user.id === currentUserId ? <span className="self-label">当前账户</span> : <><button onClick={() => update(user.id, { role: user.role === "ADMIN" ? "USER" : "ADMIN" })}>{user.role === "ADMIN" ? "设为用户" : "设为管理员"}</button><button className="danger" onClick={() => update(user.id, { active: !user.active })}>{user.active ? <><UserX size={14} />停用</> : <><CheckCircle2 size={14} />启用</>}</button></>}</div></td></tr>)}</tbody></table></div>}</section>
      <section className="admin-security"><ShieldCheck size={20} /><div><strong>密码安全</strong><p>密码不会以明文保存。系统存储随机盐、PBKDF2-SHA256 哈希和迭代次数；会话令牌只以 SHA-256 摘要形式存入数据库。</p></div></section>
    </div>
    {message && <div className="toast"><CheckCircle2 size={18} />{message}</div>}
  </main>;
}

function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }

