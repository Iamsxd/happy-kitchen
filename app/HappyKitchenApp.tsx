"use client";

import {
  ArrowRight,
  CalendarDays,
  BookOpen,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  CookingPot,
  Heart,
  Home,
  Leaf,
  ListChecks,
  LogOut,
  Lock,
  PackagePlus,
  Pencil,
  Trash2,
  Download,
  GraduationCap,
  Lightbulb,
  LibraryBig,
  Scale,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  Sparkles,
  UsersRound,
  Utensils,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { PwaRegister } from "./PwaRegister";

type Tab = "today" | "week" | "inventory" | "recipes" | "shopping" | "learn" | "family";
type AppState = {
  household: { id: string; name: string };
  access: { role: "OWNER" | "MEMBER"; memberId: string | null; userId: string };
  accountMembers: Record<string, unknown>[];
  members: Record<string, unknown>[];
  profiles: Record<string, unknown>[];
  recipes: Record<string, unknown>[];
  inventory: Record<string, unknown>[];
  plan: Record<string, unknown>[];
  shopping: Record<string, unknown>[];
  rules: Record<string, unknown>[];
  summary: Record<string, number>;
};
type Candidate = { id: string; title: string; emoji: string; cookMinutes: number; score: number; inventory: number; reasons: string[]; nutrition?: { energy?: number; protein?: number; fiber?: number }; nutritionSource?: string };
type CatalogItem = { id: string; title: string; category: string; emoji?: string; path: string; summary: string; sourceUrl: string };
type LearningArticle = CatalogItem & { intro: string; sections: { heading: string; paragraphs: string[] }[]; sourceLicense: string };

const navItems: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "today", label: "今天", icon: Home },
  { id: "week", label: "周计划", icon: CalendarDays },
  { id: "inventory", label: "冰箱", icon: ShoppingBasket },
  { id: "recipes", label: "菜谱", icon: ChefHat },
  { id: "shopping", label: "清单", icon: ListChecks },
  { id: "learn", label: "学厨艺", icon: GraduationCap },
  { id: "family", label: "家人", icon: UsersRound },
];

export function HappyKitchenApp({ displayName, role }: { displayName: string; role: "USER" | "ADMIN" }) {
  const [tab, setTab] = useState<Tab>("today");
  const [data, setData] = useState<AppState | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"inventory" | "recipe" | "recipeEdit" | "recipeDetail" | "shoppingItem" | "purchase" | "article" | "member" | "memberEdit" | "rule" | "plan" | "recommend" | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<Record<string, unknown> | null>(null);
  const [selectedShopping, setSelectedShopping] = useState<Record<string, unknown> | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<LearningArticle | null>(null);
  const [selectedMember, setSelectedMember] = useState<Record<string, unknown> | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<string, unknown> | null>(null);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("暂时无法读取家庭数据");
    setData(await response.json());
  }, []);

  const runRecommendation = useCallback(async (open = false) => {
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "RECOMMEND" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setCandidates(result.candidates);
      if (open) setModal("recommend");
    } finally { setBusy(false); }
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      load().then(() => runRecommendation()).catch((error) => setToast(error.message)).finally(() => setLoading(false));
    });
  }, [load, runRecommendation]);

  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "操作失败");
      setModal(null);
      setToast(success);
      await load();
      await runRecommendation();
      return result as Record<string, unknown>;
    } catch (error) {
      setToast(error instanceof Error ? error.message : "操作失败");
      return null;
    } finally { setBusy(false); }
  }

  async function openCatalogRecipe(path: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/howtocook?type=recipe&path=${encodeURIComponent(path)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "暂时无法读取菜谱");
      setSelectedRecipe(result.recipe);
      setModal("recipeDetail");
    } catch (error) { setToast(error instanceof Error ? error.message : "暂时无法读取菜谱"); }
    finally { setBusy(false); }
  }

  async function openLearningArticle(path: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/howtocook?type=article&path=${encodeURIComponent(path)}`);
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "暂时无法读取文章");
      setSelectedArticle(result.article);
      setModal("article");
    } catch (error) { setToast(error instanceof Error ? error.message : "暂时无法读取文章"); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  const firstName = displayName.includes("@") ? "小满" : displayName.split(" ")[0];
  const todayPlan = data?.plan.find((item) => String(item.meal_date) === new Date().toISOString().slice(0, 10) && String(item.meal_type) === "DINNER");
  const expiring = data?.inventory.filter((item) => daysUntil(String(item.use_by_at ?? item.best_before_at ?? "")) <= 3 && Number(item.current_quantity_g) > 0) ?? [];

  return (
    <div className="app-shell">
      <PwaRegister />
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark"><Leaf size={22} /></span><span>快乐厨房</span></div>
        <nav aria-label="主要导航">
          {navItems.map((item) => <NavButton key={item.id} {...item} active={tab === item.id} onClick={() => setTab(item.id)} />)}
        </nav>
        <div className="sidebar-tip">
          <Sparkles size={18} />
          <strong>本周少浪费一点</strong>
          <span>已有 83% 的临期食材安排进计划</span>
        </div>
        <button className="profile-button" onClick={() => setTab("family")}><Avatar name={firstName} /><span><strong>{firstName}</strong><small>{role === "ADMIN" ? "管理员" : data?.household.name ?? "我们家"}</small></span><ChevronRight size={17} /></button>
        <div className="account-actions">{role === "ADMIN" && <button onClick={() => window.location.assign("/admin")}><Settings size={15} />管理后台</button>}<button onClick={logout}><LogOut size={15} />退出登录</button></div>
      </aside>

      <main className="main-content">
        <header className="mobile-header"><div className="brand"><span className="brand-mark"><Leaf size={20} /></span><span>快乐厨房</span></div><div className="mobile-account">{role === "ADMIN" && <button aria-label="管理后台" onClick={() => window.location.assign("/admin")}><Settings size={18} /></button>}<button aria-label="退出登录" onClick={logout}><LogOut size={18} /></button><Avatar name={firstName} /></div></header>
        {loading ? <LoadingView /> : !data ? <EmptyError onRetry={() => location.reload()} /> : (
          <>
            {tab === "today" && <TodayView data={data} firstName={firstName} plan={todayPlan} expiring={expiring} candidates={candidates} busy={busy} onRecommend={() => runRecommendation(true)} onComplete={() => todayPlan && action({ action: "COMPLETE_MEAL", itemId: todayPlan.id }, "晚餐已完成，库存已按先到期先使用扣减")} onGoInventory={() => setTab("inventory")} />}
            {tab === "week" && <WeekView data={data} busy={busy} onAdd={(mealDate, mealType) => { setSelectedPlan({ meal_date: mealDate, meal_type: mealType }); setModal("plan"); }} onEdit={(item) => { setSelectedPlan(item); setModal("plan"); }} onToggleLock={(id) => action({ action: "TOGGLE_PLAN_LOCK", id }, "计划锁定状态已更新")} onRemove={(id) => action({ action: "REMOVE_PLAN_ITEM", id }, "餐次已移出周计划，采购清单已同步")} onGenerate={(startDate) => action({ action: "GENERATE_WEEK_PLAN", startDate }, "已按全家成员、餐次、库存与饮食限制生成整周计划")} />}
            {tab === "inventory" && <InventoryView data={data} onAdd={() => setModal("inventory")} />}
            {tab === "recipes" && <RecipesView data={data} busy={busy} onAdd={() => setModal("recipe")} onView={(recipe) => { setSelectedRecipe(recipe); setModal("recipeDetail"); }} onOpenCatalog={openCatalogRecipe} onImportLocalOcr={async () => { const result = await action({ action: "IMPORT_LOCAL_OCR_RECIPES" }, ""); if (result) setToast(`已导入 ${String(result.imported ?? 0)} 道菜谱，跳过 ${String(result.skipped ?? 0)} 道重复菜谱；${String(result.needsReview ?? 0)} 道待核对。`); }} />}
            {tab === "shopping" && <ShoppingView data={data} busy={busy} onAdd={() => setModal("shoppingItem")} onAction={action} onPurchase={(item) => { setSelectedShopping(item); setModal("purchase"); }} />}
            {tab === "learn" && <LearningView busy={busy} onOpen={openLearningArticle} />}
            {tab === "family" && <FamilyView data={data} onAdd={() => setModal("member")} onEdit={(member) => { const profile = data.profiles.find((item) => item.member_id === member.id); setSelectedMember({ ...member, targets: profile?.targets ?? {} }); setModal("memberEdit"); }} onAddRule={(member) => { setSelectedMember(member); setModal("rule"); }} onDeleteRule={(id) => action({ action: "DELETE_DIETARY_RULE", id }, "饮食规则已移除，推荐已同步")} onCreateInvite={async () => { const result = await action({ action: "CREATE_HOUSEHOLD_INVITE", maxUses: 1 }, "邀请码已生成，请安全地发送给家人"); return result?.invite as Record<string, unknown> | undefined; }} onRemoveAccount={(userId) => action({ action: "REMOVE_HOUSEHOLD_ACCOUNT", userId }, "账号已移出家庭，历史数据仍保留在本家庭")} />}
          </>
        )}
      </main>

      <nav className="bottom-nav" aria-label="移动端导航">
        {navItems.map((item) => <NavButton key={item.id} {...item} active={tab === item.id} onClick={() => setTab(item.id)} />)}
      </nav>

      {modal && <Modal title={modalTitle(modal)} onClose={() => setModal(null)}>
        {modal === "inventory" && <InventoryForm busy={busy} onSubmit={(payload) => action({ action: "ADD_INVENTORY", ...payload }, "食材已放进冰箱")} />}
        {modal === "recipe" && <RecipeForm busy={busy} onSubmit={(payload) => action({ action: "ADD_RECIPE", ...payload }, "家庭菜谱已保存为新版本")} />}
        {modal === "recipeEdit" && selectedRecipe && <RecipeForm busy={busy} initial={selectedRecipe} onSubmit={(payload) => action({ action: "UPDATE_RECIPE", id: selectedRecipe.id, ...payload }, "菜谱和操作步骤已更新")} />}
        {modal === "recipeDetail" && selectedRecipe && <RecipeDetail recipe={selectedRecipe} busy={busy} onEdit={selectedRecipe.catalogPath ? undefined : () => setModal("recipeEdit")} onImport={selectedRecipe.catalogPath ? () => action({ action: "IMPORT_HOWTOCOOK", path: selectedRecipe.catalogPath }, "开源菜谱已加入我的菜谱") : undefined} />}
        {modal === "shoppingItem" && <ShoppingItemForm busy={busy} onSubmit={(payload) => action({ action: "ADD_SHOPPING_ITEM", ...payload }, "已加入采购清单")} />}
        {modal === "purchase" && selectedShopping && <PurchaseForm item={selectedShopping} busy={busy} onSubmit={(payload) => action({ action: "PURCHASE_SHOPPING_ITEM", id: selectedShopping.id, ...payload }, "实际购入数量已加入冰箱，多买的部分会保留为库存")} />}
        {modal === "article" && selectedArticle && <LearningArticleView article={selectedArticle} />}
        {modal === "member" && <MemberForm busy={busy} onSubmit={(payload) => action({ action: "ADD_MEMBER", ...payload }, "家庭成员已加入")} />}
        {modal === "memberEdit" && selectedMember && <MemberForm busy={busy} initial={selectedMember} onSubmit={(payload) => action({ action: "UPDATE_MEMBER", id: selectedMember.id, ...payload }, "成员档案和营养目标已更新")} />}
        {modal === "rule" && selectedMember && <DietaryRuleForm member={selectedMember} busy={busy} onSubmit={(payload) => action({ action: "ADD_DIETARY_RULE", memberId: selectedMember.id, ...payload }, "饮食规则已保存，推荐会自动避开硬性限制")} />}
        {modal === "plan" && <PlanItemForm initial={selectedPlan ?? undefined} recipes={data?.recipes ?? []} members={data?.members ?? []} busy={busy} onSubmit={(payload) => action({ action: "SET_PLAN_ITEM", ...(selectedPlan?.id ? { id: selectedPlan.id } : {}), ...payload }, selectedPlan?.id ? "餐次已更新，采购清单已同步" : "餐次已加入周计划，采购清单已同步")} />}
        {modal === "recommend" && <RecommendationPanel candidates={candidates} busy={busy} onRefresh={() => runRecommendation()} />}
      </Modal>}
      {toast && <div className="toast" role="status"><CheckCircle2 size={18} />{toast}</div>}
    </div>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" });
  window.location.assign("/");
}

function TodayView({ data, firstName, plan, expiring, candidates, busy, onRecommend, onComplete, onGoInventory }: { data: AppState; firstName: string; plan?: Record<string, unknown>; expiring: Record<string, unknown>[]; candidates: Candidate[]; busy: boolean; onRecommend: () => void; onComplete: () => void; onGoInventory: () => void }) {
  const summary = data.summary;
  const topCandidate = candidates[0];
  const cooked = plan?.state === "COOKED";
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">{formatFullDate(new Date())}</p><h1>{greeting()}，{firstName}</h1><p>今天也让每一口都更合适。</p></div><button className="secondary-button desktop-only" onClick={onRecommend}><Sparkles size={17} />智能推荐</button></div>

    <section className="today-hero">
      <div className="hero-copy"><span className="status-pill"><Clock3 size={14} /> 下一餐 · 晚餐</span><h2>{String(plan?.title ?? topCandidate?.title ?? "正在为你挑选晚餐")}</h2><p>{String((plan?.explanations as string[] | undefined)?.[0] ?? topCandidate?.reasons?.[0] ?? "兼顾全家营养、口味和当前库存")}</p><div className="hero-meta"><span><UsersRound size={16} /> {data.members.length} 人</span><span><Clock3 size={16} /> {String(plan?.cook_minutes ?? topCandidate?.cookMinutes ?? 30)} 分钟</span><span><ShoppingBasket size={16} /> 库存优先</span></div><div className="hero-actions"><button className="primary-button" onClick={onComplete} disabled={busy || cooked}>{cooked ? <><Check size={17} /> 已完成</> : <><CookingPot size={17} /> 完成烹饪</>}</button><button className="ghost-button" onClick={onRecommend}><RefreshCw size={16} /> 换一道</button></div></div>
      <div className="dish-visual" aria-hidden="true"><span>{String(plan?.emoji ?? topCandidate?.emoji ?? "🍲")}</span><i className="leaf-shape leaf-one" /><i className="leaf-shape leaf-two" /></div>
    </section>

    <section><SectionHeading eyebrow="今日已安排餐次" title="营养，一眼就懂" action={<span className="muted-inline">计划值会随餐次更新</span>} /><div className="nutrition-grid"><NutritionCard label="能量" value={summary.energy} target={summary.energyTarget} unit="kcal" color="#f28b50" /><NutritionCard label="蛋白质" value={summary.protein} target={summary.proteinTarget} unit="g" color="#5a9274" /><NutritionCard label="膳食纤维" value={summary.fiber} target={summary.fiberTarget} unit="g" color="#d2a43a" /><NutritionCard label="饮水" value={summary.water} target={summary.waterTarget} unit="ml" color="#5d91a8" /></div></section>

    <div className="split-grid">
      <section className="content-card"><SectionHeading eyebrow="冰箱提醒" title="这些食材该优先吃" action={<button className="text-button" onClick={onGoInventory}>全部库存 <ArrowRight size={15} /></button>} /><div className="expiry-list">{expiring.slice(0, 3).map((item) => <div className="expiry-row" key={String(item.id)}><span className="food-icon">{String(item.emoji)}</span><span><strong>{String(item.ingredient_name)}</strong><small>{String(item.location)} · 剩余 {Number(item.current_quantity_g)}g</small></span><span className={`expiry-badge ${daysUntil(String(item.best_before_at ?? item.use_by_at)) <= 1 ? "urgent" : ""}`}>{expiryText(String(item.best_before_at ?? item.use_by_at))}</span></div>)}</div></section>
      <section className="content-card recommendation-mini"><SectionHeading eyebrow="为什么是它" title={topCandidate?.title ?? "推荐正在计算"} /><div className="mini-score"><strong>{Math.round((topCandidate?.score ?? 0) * 100)}</strong><span>综合推荐分</span></div><ul>{(topCandidate?.reasons ?? ["营养、口味与库存综合匹配"]).map((reason) => <li key={reason}><Check size={14} />{reason}</li>)}</ul><button className="secondary-button full-button" onClick={onRecommend}>查看 3 个候选 <ArrowRight size={16} /></button></section>
    </div>
  </div>;
}

function WeekView({ data, busy, onAdd, onEdit, onToggleLock, onRemove, onGenerate }: { data: AppState; busy: boolean; onAdd: (mealDate: string, mealType: string) => void; onEdit: (item: Record<string, unknown>) => void; onToggleLock: (id: string) => void; onRemove: (id: string) => void; onGenerate: (startDate: string) => void }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const days = weekDates(startDate);
  const mealTypes = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];
  const slots = new Map(data.plan.filter((item) => item.state !== "REMOVED").map((item) => [`${item.meal_date}-${item.meal_type}`, item]));
  const activePlan = days.flatMap((date) => mealTypes.map((mealType) => slots.get(`${date}-${mealType}`)).filter(Boolean));
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">全家的一周</p><h1>周食谱计划</h1><p>按日期、餐次和成员自由排期；一键生成会优化整周所有启用餐次，并保留锁定或已完成安排。</p></div><div className="heading-actions"><label className="week-start-picker">从<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><button className="secondary-button" onClick={() => onAdd(startDate, "DINNER")}><Plus size={17} />安排一餐</button><button className="primary-button" disabled={busy} onClick={() => onGenerate(startDate)}><Sparkles size={17} />生成整周食谱</button></div></div>
    <div className="plan-summary"><div><span className="summary-icon green"><CalendarDays size={20} /></span><span><strong>{activePlan.length} 餐</strong><small>本周已安排</small></span></div><div><span className="summary-icon orange"><UsersRound size={20} /></span><span><strong>{data.members.length} 人</strong><small>按参与成员分配份数</small></span></div><div><span className="summary-icon blue"><ListChecks size={20} /></span><span><strong>{data.shopping.filter((item) => item.status !== "CHECKED").length} 项</strong><small>计划变更自动重算</small></span></div></div>
    <section className="weekly-planner" aria-label="整周食谱计划"><div className="week-head-row"><span className="week-corner">餐次</span>{days.map((date) => <div key={date} className={isToday(date) ? "today" : ""}><strong>{weekday(date)}</strong><small>{monthDay(date)}</small>{isToday(date) && <i>今天</i>}</div>)}</div>{mealTypes.map((mealType) => <div className="week-meal-row" key={mealType}><div className="week-meal-label">{mealTypeLabel(mealType)}</div>{days.map((date) => { const item = slots.get(`${date}-${mealType}`); if (!item) return <button className="week-empty-slot" key={`${date}-${mealType}`} disabled={busy} onClick={() => onAdd(date, mealType)}><Plus size={15} /><span>安排</span></button>; const participants = (item.participants as { name?: string }[] | undefined) ?? []; const locked = Boolean(item.locked); const cooked = item.state === "COOKED"; return <article className={`week-slot ${locked ? "locked" : ""} ${cooked ? "cooked" : ""}`} key={String(item.id)}><button className="week-slot-main" disabled={busy || locked || cooked} onClick={() => onEdit(item)}><span>{String(item.emoji)}</span><strong>{String(item.title)}</strong><small>{String(item.total_servings)} 份 · {participants.map((member) => member.name).join("、") || "全家"}</small></button><div className="week-slot-actions">{locked && <i><Lock size={11} />锁定</i>}<button aria-label={locked ? `解锁${String(item.title)}` : `锁定${String(item.title)}`} disabled={busy || cooked} onClick={() => onToggleLock(String(item.id))}><Lock size={13} /></button><button aria-label={`编辑${String(item.title)}`} disabled={busy || locked || cooked} onClick={() => onEdit(item)}><Pencil size={13} /></button><button aria-label={`移除${String(item.title)}`} disabled={busy || locked || cooked} onClick={() => onRemove(String(item.id))}><Trash2 size={13} /></button></div></article>; })}</div>)}</section>
  </div>;
}

function InventoryView({ data, onAdd }: { data: AppState; onAdd: () => void }) {
  const [query, setQuery] = useState("");
  const filtered = data.inventory.filter((item) => String(item.ingredient_name).includes(query) && Number(item.current_quantity_g) > 0);
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">先吃什么，心里有数</p><h1>我的冰箱</h1><p>{filtered.length} 批可用食材，按到期时间自动排序。</p></div><button className="primary-button" onClick={onAdd}><PackagePlus size={17} />快速入库</button></div><div className="toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索食材" /></label><div className="filter-chips"><button className="active">全部</button><button>临期</button><button>已开封</button><button>冷冻</button></div></div><section className="inventory-grid">{filtered.map((item) => { const days = daysUntil(String(item.use_by_at ?? item.best_before_at ?? "")); const available = Number(item.current_quantity_g) - Number(item.reserved_quantity_g); return <article className="inventory-card" key={String(item.id)}><div className="inventory-top"><span className="food-icon large">{String(item.emoji)}</span><span className={`freshness ${days <= 3 ? "soon" : "good"}`}>{days <= 3 ? `${Math.max(days, 0)}天后到期` : "状态良好"}</span></div><h3>{String(item.ingredient_name)}</h3><p>{String(item.location)} · {String(item.category)}</p><div className="quantity-row"><strong>{available}g</strong><span>可用</span></div><div className="quantity-track"><i style={{ width: `${Math.min(100, available / Math.max(1, Number(item.initial_quantity_g)) * 100)}%` }} /></div>{Number(item.reserved_quantity_g) > 0 && <small>其中 {String(item.reserved_quantity_g)}g 已为计划预留</small>}</article>; })}</section></div>;
}

function RecipesView({ data, busy, onAdd, onView, onOpenCatalog, onImportLocalOcr }: { data: AppState; busy: boolean; onAdd: () => void; onView: (recipe: Record<string, unknown>) => void; onOpenCatalog: (path: string) => void; onImportLocalOcr: () => void }) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"mine" | "library">("mine");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState("全部");
  const [visible, setVisible] = useState(48);
  useEffect(() => { fetch("/api/howtocook?type=recipes").then((response) => response.json()).then((result) => setCatalog(result.items ?? [])).catch(() => setCatalog([])); }, []);
  const mine = data.recipes.filter((recipe) => `${String(recipe.title)} ${(recipe.ingredients as { name?: string }[]).map((item) => item.name).join(" ")}`.includes(query));
  const categories = ["全部", ...Array.from(new Set(catalog.map((item) => item.category)))];
  const library = catalog.filter((item) => (category === "全部" || item.category === category) && `${item.title} ${item.summary}`.includes(query));
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">越做越懂你</p><h1>家庭菜谱</h1><p>自己录入的菜谱与完整开源菜谱库都在这里。</p></div><button className="primary-button" onClick={onAdd}><Plus size={17} />新建菜谱</button></div><div className="source-callout"><LibraryBig size={20} /><div><strong>《程序员做饭指南》368 份菜谱已全部接入</strong><span>开源目录和详情随应用提供；打开任意菜谱即可查看步骤，也可加入“我的菜谱”参与计划与采购计算。</span></div></div><div className="source-callout"><Download size={20} /><div><strong>导入本地图片识别菜谱</strong><span>将私有的 `sui-one-recipes.json` 放入 NAS 数据目录的 `imports` 文件夹后导入。OCR 识别不确定的菜谱会标为“待核对”，不会参与自动推荐和周计划。</span></div><button className="secondary-button" disabled={busy} onClick={onImportLocalOcr}><Download size={16} />导入本地菜谱</button></div><div className="catalog-tabs"><button className={mode === "mine" ? "active" : ""} onClick={() => { setMode("mine"); setVisible(48); }}>我的菜谱 <span>{data.recipes.length}</span></button><button className={mode === "library" ? "active" : ""} onClick={() => { setMode("library"); setVisible(48); }}>开源菜谱库 <span>{catalog.length || 368}</span></button></div><div className="toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(e) => { setQuery(e.target.value); setVisible(48); }} placeholder="搜索菜名或食材" /></label>{mode === "library" && <div className="filter-chips">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => { setCategory(item); setVisible(48); }}>{item}</button>)}</div>}</div>{mode === "mine" ? <section className="recipe-grid">{mine.map((recipe) => <article className="recipe-card recipe-card-clickable" key={String(recipe.id)} onClick={() => onView(recipe)}><div className="recipe-visual"><span>{String(recipe.emoji)}</span><button aria-label="收藏" onClick={(event) => event.stopPropagation()}><Heart size={18} /></button><i className={String(recipe.completeness_status) === "COMPLETE" ? "verified" : "partial"}>{String(recipe.completeness_status) === "COMPLETE" ? "数据完整" : "数据待补"}</i></div><div className="recipe-body"><div className="recipe-title-row"><h3>{String(recipe.title)}</h3><span>v{String(recipe.version_no)}</span></div><p>{String(recipe.description)}</p><div className="tag-row">{(recipe.tags as string[]).map((tag) => <span key={tag}>{tag}</span>)}</div><div className="recipe-footer"><span><Clock3 size={15} /> {String(recipe.cook_minutes)} 分钟</span><span><ShoppingBasket size={15} /> {coverageForRecipe(recipe, data.inventory)}% 已有</span></div><button className="text-button recipe-view-button">查看或补充步骤 <ArrowRight size={15} /></button></div></article>)}</section> : <><section className="catalog-grid">{library.slice(0, visible).map((recipe) => <button className="catalog-card" key={recipe.id} disabled={busy} onClick={() => onOpenCatalog(recipe.path)}><span>{recipe.emoji}</span><div><i>{recipe.category}</i><strong>{recipe.title}</strong><p>{recipe.summary}</p><small>查看食材与完整步骤 <ArrowRight size={13} /></small></div></button>)}</section>{visible < library.length && <button className="secondary-button load-more" onClick={() => setVisible(visible + 48)}>继续加载（还有 {library.length - visible} 份）</button>}</>}</div>;
}

function RecipeDetail({ recipe, busy, onEdit, onImport }: { recipe: Record<string, unknown>; busy: boolean; onEdit?: () => void; onImport?: () => void }) {
  const ingredients = (recipe.ingredientsDetailed ?? []) as Record<string, unknown>[];
  const steps = (recipe.steps ?? []) as Record<string, unknown>[];
  const source = recipe.source as Record<string, unknown> | null;
  return <div className="recipe-detail">
    <div className="recipe-detail-hero"><span>{String(recipe.emoji)}</span><div><h3>{String(recipe.title)}</h3><p>{String(recipe.description)}</p><div className="recipe-footer"><span><Clock3 size={15} /> {String(recipe.cook_minutes)} 分钟</span><span><UsersRound size={15} /> {String(recipe.servings)} 份</span></div></div></div>
    {source && <div className="recipe-source"><BookOpen size={18} /><div><strong>{String(source.source_name)}</strong><span>{String(source.source_license ?? "").trim() ? `许可：${String(source.source_license)}` : "家庭录入"}</span></div>{Boolean(source.source_url) && <a href={String(source.source_url)} target="_blank" rel="noreferrer">查看原文 <ArrowRight size={14} /></a>}</div>}
    <div className="recipe-detail-grid"><section><h4>食材与用量</h4>{ingredients.length ? <div className="ingredient-detail-list">{ingredients.map((item) => <div key={String(item.id)}><span><strong>{String(item.ingredient_name)}</strong>{Boolean(item.optional) && <small>可选</small>}</span><span>{String(item.quantity_value)} {String(item.unit_code)}{item.quantity_g != null && <small>（约 {String(item.quantity_g)}g）</small>}</span></div>)}</div> : <p className="detail-empty">原文没有可结构化的精确用量，加入我的菜谱后可手工补充。</p>}</section><section><h4>操作步骤</h4><ol className="step-list">{steps.map((step) => <li key={String(step.id)}><span>{String(step.step_no)}</span><p>{String(step.instruction)}</p>{Number(step.timer_seconds) > 0 && <small><Clock3 size={13} /> {timerText(Number(step.timer_seconds))}</small>}</li>)}</ol></section></div>
    <div className="recipe-detail-actions">{onEdit && <button className="secondary-button" onClick={onEdit}><ChefHat size={16} />编辑食材与步骤</button>}{onImport && <button className="primary-button" disabled={busy} onClick={onImport}><Download size={16} />加入我的菜谱</button>}</div>
  </div>;
}

function ShoppingView({ data, busy, onAdd, onAction, onPurchase }: { data: AppState; busy: boolean; onAdd: () => void; onAction: (payload: Record<string, unknown>, success: string) => Promise<unknown>; onPurchase: (item: Record<string, unknown>) => void }) {
  const open = data.shopping.filter((item) => item.status !== "CHECKED");
  const checked = data.shopping.filter((item) => item.status === "CHECKED");
  const system = open.filter((item) => item.source_type === "SYSTEM");
  const total = system.reduce((sum, item) => sum + Number(item.quantity_g || 0), 0);
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">计划减库存，缺什么一目了然</p><h1>采购清单</h1><p>缺口用于计算，购买时按常见规格取整；实际多买的数量会完整进入冰箱库存。</p></div><div className="heading-actions"><button className="secondary-button" disabled={busy} onClick={() => onAction({ action: "RECALCULATE_SHOPPING" }, "采购清单已重新计算")}><RefreshCw size={17} />重新计算</button><button className="primary-button" onClick={onAdd}><Plus size={17} />手动添加</button></div></div><div className="shopping-summary"><div><ShoppingBasket size={22} /><span><strong>{open.length} 项</strong><small>待采购</small></span></div><div><ListChecks size={22} /><span><strong>{Math.round(total)}g</strong><small>精确食材缺口</small></span></div><div><CheckCircle2 size={22} /><span><strong>{checked.length} 项</strong><small>已完成</small></span></div></div><section className="shopping-list">{open.length === 0 && <div className="shopping-empty"><CheckCircle2 size={34} /><strong>本周食材已经齐全</strong><span>改变周计划或库存后，清单会自动更新。</span></div>}{open.map((item) => { const suggested = suggestPurchaseQuantity(Number(item.quantity_g)); return <article className="shopping-row" key={String(item.id)}><button className="shopping-check" aria-label="标记已购买" onClick={() => onAction({ action: "TOGGLE_SHOPPING_ITEM", id: item.id, checked: true }, "已标记为购买完成")}><span /></button><div className="shopping-name"><strong>{String(item.ingredient_name)}</strong><span>{item.source_type === "SYSTEM" ? "周计划自动计算" : "手动添加"}{Boolean(item.needs_review) && <i>用量待确认</i>}</span></div><div className="shopping-math">{item.source_type === "SYSTEM" && <small>需要 {Number(item.required_quantity_g)}g − 库存 {Number(item.inventory_quantity_g)}g = 缺 {Number(item.quantity_g)}g</small>}<strong>建议买 {suggested}g</strong>{suggested > Number(item.quantity_g) && <em>预计余量 {Math.round(suggested - Number(item.quantity_g))}g</em>}</div><button className="secondary-button compact-button" disabled={busy || Boolean(item.needs_review)} onClick={() => onPurchase(item)}>填写实际购入量</button></article>; })}</section>{checked.length > 0 && <section className="checked-shopping"><h3>已完成</h3>{checked.map((item) => <button key={String(item.id)} onClick={() => onAction({ action: "TOGGLE_SHOPPING_ITEM", id: item.id, checked: false }, "已恢复为待采购")}><Check size={15} /><span>{String(item.ingredient_name)}</span><small>{String(item.quantity_g)} {String(item.unit_code)}</small></button>)}</section>}</div>;
}

function LearningView({ busy, onOpen }: { busy: boolean; onOpen: (path: string) => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [category, setCategory] = useState("全部");
  const [query, setQuery] = useState("");
  useEffect(() => { fetch("/api/howtocook?type=learning").then((response) => response.json()).then((result) => setItems(result.items ?? [])).catch(() => setItems([])); }, []);
  const categories = ["全部", ...Array.from(new Set(items.map((item) => item.category)))];
  const filtered = items.filter((item) => (category === "全部" || item.category === category) && `${item.title} ${item.summary}`.includes(query));
  const featured = items.length ? items[new Date().getDate() % items.length] : null;
  function randomArticle() { if (!items.length) return; const index = Math.floor(Math.random() * items.length); onOpen(items[index].path); }
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">每天学会一个关键动作</p><h1>厨艺学习与提高</h1><p>从厨房准备、食品安全到火候、去腥、焯水和进阶技巧，逐步建立做饭的基本功。</p></div><button className="primary-button" disabled={busy || !items.length} onClick={randomArticle}><Sparkles size={17} />随机推荐知识</button></div>{featured && <button className="learning-hero" onClick={() => onOpen(featured.path)}><span><Lightbulb size={28} /></span><div><i>今日推荐 · {featured.category}</i><h2>{featured.title}</h2><p>{featured.summary}</p><small>开始学习 <ArrowRight size={15} /></small></div></button>}<div className="learning-toolbar"><label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索火候、刀工、去腥等知识" /></label><div className="filter-chips">{categories.map((item) => <button key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div></div><section className="learning-grid">{filtered.map((item, index) => <button key={item.id} onClick={() => onOpen(item.path)} disabled={busy}><span className={`learning-icon learning-${index % 4}`}><GraduationCap size={21} /></span><div><i>{item.category}</i><strong>{item.title}</strong><p>{item.summary}</p><small>阅读知识卡 <ArrowRight size={13} /></small></div></button>)}</section></div>;
}

function LearningArticleView({ article }: { article: LearningArticle }) {
  return <article className="learning-article"><header><span><Lightbulb size={25} /></span><div><p className="eyebrow">{article.category}</p><h3>{article.title}</h3><p>{article.intro || article.summary}</p></div></header><div className="article-sections">{article.sections.map((section, index) => <section key={`${section.heading}-${index}`}><h4><span>{index + 1}</span>{section.heading}</h4>{section.paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}</section>)}</div><footer><BookOpen size={16} /><span>来源：程序员做饭指南 · {article.sourceLicense}</span><a href={article.sourceUrl} target="_blank" rel="noreferrer">查看原文 <ArrowRight size={13} /></a></footer></article>;
}

function FamilyView({ data, onAdd, onEdit, onAddRule, onDeleteRule, onCreateInvite, onRemoveAccount }: { data: AppState; onAdd: () => void; onEdit: (member: Record<string, unknown>) => void; onAddRule: (member: Record<string, unknown>) => void; onDeleteRule: (id: string) => void; onCreateInvite: () => Promise<Record<string, unknown> | undefined>; onRemoveAccount: (userId: string) => void }) {
  const [invite, setInvite] = useState<Record<string, unknown> | null>(null);
  const isOwner = data.access.role === "OWNER";
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">每个人，都刚刚好</p><h1>家庭成员</h1><p>每位成员都有独立的营养目标、参与餐次和饮食限制；过敏与忌口会直接排除不适合的推荐。</p></div><div className="heading-actions">{isOwner && <button className="secondary-button" onClick={() => onCreateInvite().then((value) => value && setInvite(value))}><UsersRound size={17} />邀请账号</button>}<button className="primary-button" onClick={onAdd}><Plus size={17} />添加成员</button></div></div>{isOwner && <section className="source-callout"><ShieldCheck size={20} /><div><strong>账号访问</strong><span>成人使用自己的账号登录后，可共享本家庭的库存、采购清单、菜谱与周食谱；儿童和老人可只作为受管理成员。</span>{invite && <p className="invite-code">邀请码：<code>{String(invite.code)}</code> · 72 小时内有效，仅可使用一次。</p>}</div></section>}<section className="family-grid">{data.members.map((member, index) => { const profile = data.profiles.find((item) => item.member_id === member.id); const targets = (profile?.targets ?? {}) as Record<string, number>; const rules = data.rules.filter((rule) => rule.member_id === member.id); const participation = parseParticipation(member.meal_participation_json); return <article className="member-card member-card-expanded" key={String(member.id)}><div className="member-head"><Avatar name={String(member.name)} large /><div><h3>{String(member.name)}</h3><p>{member.member_type === "CHILD" ? "受管儿童成员" : index === 0 ? "家庭所有者" : "家庭成员"}</p></div><span className="source-badge">{profile?.source_type === "MANUAL" ? "人工目标" : "系统估算"}</span></div><div className="target-list"><div><span>每日能量</span><strong>{targets.energy ?? "—"} kcal</strong></div><div><span>蛋白质</span><strong>{targets.protein ?? "—"} g</strong></div><div><span>膳食纤维</span><strong>{targets.fiber ?? "—"} g</strong></div></div><div className="member-participation"><small>参与餐次</small><span>{participation.breakfast && "早"} {participation.lunch && "午"} {participation.dinner && "晚"} {participation.snack && "加餐"}</span></div><div className="dietary-rule-list"><div><small>饮食规则</small><button className="text-button" onClick={() => onAddRule(member)}><Plus size={14} />添加</button></div>{rules.length ? <div className="rule-chips">{rules.map((rule) => <span key={String(rule.id)} className={`rule-chip ${String(rule.rule_type).toLowerCase()}`}><b>{ruleTypeLabel(String(rule.rule_type))}</b>{String(rule.ingredient_name)}<button aria-label={`删除${String(rule.ingredient_name)}规则`} onClick={() => onDeleteRule(String(rule.id))}><X size={12} /></button></span>)}</div> : <p>暂未设置，推荐不会排除特定食材。</p>}</div><div className="member-card-actions"><button className="secondary-button compact-button" onClick={() => onEdit(member)}><Pencil size={15} />编辑档案</button><button className="text-button" onClick={() => onAddRule(member)}><ShieldCheck size={15} />设置限制</button></div></article>; })}</section>{isOwner && <section className="admin-table-card"><div className="admin-table-head"><div><p className="eyebrow">登录账号</p><h2>家庭访问权限</h2></div><span>所有者可移除成员账号</span></div><div className="admin-table-wrap"><table><thead><tr><th>账号</th><th>家庭角色</th><th>操作</th></tr></thead><tbody>{data.accountMembers.map((member) => <tr key={String(member.user_id)}><td>{String(member.display_name)}<small> · {String(member.username)}</small></td><td>{String(member.role) === "OWNER" ? "家庭所有者" : "家庭成员"}</td><td>{String(member.user_id) === data.access.userId ? "当前账号" : <button className="text-button" onClick={() => window.confirm(`移除 ${String(member.display_name)} 的家庭访问权限？`) && onRemoveAccount(String(member.user_id))}>移除</button>}</td></tr>)}</tbody></table></div></section>}<section className="safety-note"><ShieldCheck size={22} /><div><strong>营养安全边界</strong><p>儿童、孕妇、老人及特殊疾病人群的目标必须由用户或专业人员手工录入。饮食限制用于家庭计划筛选，不能替代医疗建议。</p></div></section></div>;
}

function RecommendationPanel({ candidates, busy, onRefresh }: { candidates: Candidate[]; busy: boolean; onRefresh: () => void }) {
  return <div className="recommend-list"><div className="recommend-intro"><Sparkles size={20} /><p>根据当前营养缺口、冰箱库存、临期食材与家庭口味确定性计算。</p></div>{candidates.map((candidate, index) => <article className="candidate" key={candidate.id}><span className="candidate-rank">{index + 1}</span><span className="food-icon large">{candidate.emoji}</span><div><h3>{candidate.title}</h3><p>{candidate.reasons.join(" · ")}</p><div className="candidate-meta"><span>{candidate.cookMinutes} 分钟</span><span>{candidate.inventory}% 食材已有</span></div></div><strong className="candidate-score">{Math.round(candidate.score * 100)}</strong></article>)}<button className="secondary-button full-button" onClick={onRefresh} disabled={busy}><RefreshCw className={busy ? "spin" : ""} size={16} />重新计算</button><p className="deterministic-note"><ShieldCheck size={14} /> 过敏、硬禁忌和安全过期永不因评分而放宽</p></div>;
}

function InventoryForm({ busy, onSubmit }: { busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) { return <form className="form-stack" onSubmit={(event) => formPayload(event, onSubmit)}><label>食材名称<input name="name" placeholder="例如：西兰花" required /></label><div className="form-row"><label>重量（克）<input name="quantity" type="number" min="1" placeholder="500" required /></label><label>到期日期<input name="expiry" type="date" /></label></div><div className="form-row"><label>分类<select name="category"><option>蔬菜</option><option>肉类</option><option>蛋奶</option><option>主食</option><option>其他</option></select></label><label>位置<select name="location"><option>冷藏室</option><option>冷冻室</option><option>食品柜</option></select></label></div><button className="primary-button full-button" disabled={busy}>{busy ? "正在保存…" : "确认入库"}</button></form>; }
function RecipeForm({ busy, onSubmit, initial }: { busy: boolean; onSubmit: (data: Record<string, unknown>) => void; initial?: Record<string, unknown> }) {
  const initialIngredients = (initial?.ingredientsDetailed as Record<string, unknown>[] | undefined)?.map((item) => ({ name: String(item.ingredient_name ?? ""), quantity: String(item.quantity_value ?? ""), unit: String(item.unit_code ?? "g"), grams: item.quantity_g == null ? "" : String(item.quantity_g), optional: Boolean(item.optional) }));
  const initialSteps = (initial?.steps as Record<string, unknown>[] | undefined)?.map((item) => ({ instruction: String(item.instruction ?? ""), timerMinutes: item.timer_seconds ? String(Number(item.timer_seconds) / 60) : "" }));
  const [ingredients, setIngredients] = useState(initialIngredients?.length ? initialIngredients : [{ name: "", quantity: "", unit: "g", grams: "", optional: false }]);
  const [steps, setSteps] = useState(initialSteps?.length ? initialSteps : [{ instruction: "", timerMinutes: "" }]);
  const [bulk, setBulk] = useState("");
  const [bulkSteps, setBulkSteps] = useState("");
  function parseBulk() {
    const rows = bulk.split(/\n|、|，/).map((row) => row.trim()).filter(Boolean).map((row) => {
      const match = row.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*(g|克|kg|千克|ml|毫升|个|勺|适量)?$/i);
      if (!match) return { name: row, quantity: "1", unit: "份", grams: "", optional: false };
      const unit = (match[3] || "g").replace("克", "g").replace("毫升", "ml");
      const quantity = match[2];
      const grams = unit === "g" ? quantity : unit === "kg" || unit === "千克" ? String(Number(quantity) * 1000) : "";
      return { name: match[1], quantity, unit, grams, optional: false };
    });
    if (rows.length) setIngredients(rows);
  }
  function parseBulkSteps() {
    const rows = bulkSteps.split("\n").map((row) => row.replace(/^\s*\d+[.、]\s*/, "").trim()).filter(Boolean).map((instruction) => ({ instruction, timerMinutes: String(Number(instruction.match(/(\d+)\s*分钟/)?.[1] ?? "")) }));
    if (rows.length) setSteps(rows);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    onSubmit({ ...values, ingredients: ingredients.filter((item) => item.name && Number(item.quantity) > 0), steps: steps.filter((item) => item.instruction).map((item) => ({ instruction: item.instruction, timerMinutes: item.timerMinutes })) });
  }
  return <form className="form-stack recipe-editor" onSubmit={submit}><label>菜谱名称<input name="title" defaultValue={String(initial?.title ?? "")} placeholder="例如：青椒牛肉丝" required /></label><label>一句话描述<textarea name="description" defaultValue={String(initial?.description ?? "")} placeholder="口味、特点或适合的场景" /></label><div className="form-row"><label>烹饪时间（分钟）<input name="cookMinutes" type="number" min="1" defaultValue={Number(initial?.cook_minutes ?? 30)} /></label><label>标准份数<input name="servings" type="number" step="0.25" min="0.25" defaultValue={Number(initial?.servings ?? 2)} /></label></div><section className="editor-section"><div className="editor-title"><div><strong>食材与用量</strong><small>克重用于库存匹配和采购计算</small></div><button type="button" className="text-button" onClick={() => setIngredients([...ingredients, { name: "", quantity: "", unit: "g", grams: "", optional: false }])}><Plus size={15} />添加食材</button></div><div className="bulk-entry"><textarea value={bulk} onChange={(event) => setBulk(event.target.value)} placeholder={'也可批量粘贴，例如：\n鸡蛋 3个，番茄 400g，食用油 15g'} /><button type="button" className="secondary-button" onClick={parseBulk}>解析到下方</button></div><div className="ingredient-editor-list">{ingredients.map((item, index) => <div className="ingredient-editor-row" key={index}><input aria-label="食材名称" value={item.name} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, name: event.target.value } : row))} placeholder="食材" required /><input aria-label="数量" type="number" step="0.1" min="0.1" value={item.quantity} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, quantity: event.target.value } : row))} placeholder="数量" required /><select aria-label="单位" value={item.unit} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, unit: event.target.value } : row))}><option>g</option><option>kg</option><option>ml</option><option>个</option><option>勺</option><option>份</option><option>适量</option></select><input aria-label="折算克重" type="number" step="0.1" min="0" value={item.grams} onChange={(event) => setIngredients(ingredients.map((row, i) => i === index ? { ...row, grams: event.target.value } : row))} placeholder="约合克重" /><button type="button" aria-label="删除食材" disabled={ingredients.length === 1} onClick={() => setIngredients(ingredients.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div></section><section className="editor-section"><div className="editor-title"><div><strong>具体操作步骤</strong><small>可继续手工添加、删除或修改，每一步还能设置计时</small></div><button type="button" className="text-button" onClick={() => setSteps([...steps, { instruction: "", timerMinutes: "" }])}><Plus size={15} />添加步骤</button></div><div className="bulk-entry"><textarea value={bulkSteps} onChange={(event) => setBulkSteps(event.target.value)} placeholder={'也可批量粘贴步骤，每行一步：\n1. 青菜洗净沥干\n2. 热锅翻炒 2 分钟'} /><button type="button" className="secondary-button" onClick={parseBulkSteps}>解析步骤</button></div><div className="step-editor-list">{steps.map((step, index) => <div key={index}><span>{index + 1}</span><textarea value={step.instruction} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, instruction: event.target.value } : row))} placeholder={index === 0 ? "例如：番茄切块，鸡蛋打散并加少许盐。" : "继续填写下一步"} required /><label className="step-timer"><Clock3 size={13} /><input aria-label="计时分钟" type="number" min="0" step="0.5" value={step.timerMinutes} onChange={(event) => setSteps(steps.map((row, i) => i === index ? { ...row, timerMinutes: event.target.value } : row))} placeholder="分钟" /></label><button type="button" aria-label="删除步骤" disabled={steps.length === 1} onClick={() => setSteps(steps.filter((_, i) => i !== index))}><X size={16} /></button></div>)}</div></section><button className="primary-button full-button" disabled={busy}>{busy ? "正在保存…" : initial ? "保存修改和步骤" : "保存详细菜谱"}</button></form>;
}

function ShoppingItemForm({ busy, onSubmit }: { busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) { return <form className="form-stack" onSubmit={(event) => formPayload(event, onSubmit)}><label>采购食材<input name="name" placeholder="例如：生姜" required /></label><div className="form-row"><label>数量<input name="quantity" type="number" min="0.1" step="0.1" required /></label><label>单位<select name="unit"><option>g</option><option>kg</option><option>ml</option><option>个</option><option>盒</option><option>袋</option></select></label></div><label>备注<input name="note" placeholder="品牌、规格或购买地点" /></label><button className="primary-button full-button" disabled={busy}>{busy ? "正在添加…" : "加入采购清单"}</button></form>; }

function PurchaseForm({ item, busy, onSubmit }: { item: Record<string, unknown>; busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) {
  const shortage = Number(item.quantity_g);
  const suggested = suggestPurchaseQuantity(shortage);
  const [actual, setActual] = useState(String(suggested));
  const surplus = Math.max(0, Number(actual || 0) - shortage);
  const remaining = Math.max(0, shortage - Number(actual || 0));
  return <form className="form-stack purchase-form" onSubmit={(event) => formPayload(event, onSubmit)}><div className="purchase-equation"><Scale size={22} /><div><strong>{String(item.ingredient_name)}</strong><span>本周精确缺口 {shortage}g，系统建议按常见规格购买 {suggested}g。</span></div></div><label>实际购入重量（克）<input name="actualQuantity" type="number" min="0.1" step="0.1" value={actual} onChange={(event) => setActual(event.target.value)} required /></label>{surplus > 0 && <p className="purchase-result surplus"><CheckCircle2 size={16} />做饭计划用掉 {shortage}g 后，预计多出 {Math.round(surplus * 10) / 10}g；这些会完整保留在冰箱库存中。</p>}{remaining > 0 && <p className="purchase-result remaining"><ListChecks size={16} />还差 {Math.round(remaining * 10) / 10}g，采购清单会保留剩余缺口。</p>}<div className="form-row"><label>存放位置<select name="location"><option>冷藏室</option><option>冷冻室</option><option>食品柜</option></select></label><label>预计到期日<input name="expiry" type="date" /></label></div><button className="primary-button full-button" disabled={busy}>{busy ? "正在入库…" : `确认购入 ${actual || 0}g 并入库`}</button></form>;
}
function MemberForm({ busy, onSubmit, initial }: { busy: boolean; onSubmit: (data: Record<string, unknown>) => void; initial?: Record<string, unknown> }) {
  const targets = (initial?.targets ?? {}) as Record<string, unknown>;
  const participation = parseParticipation(initial?.meal_participation_json);
  const [meals, setMeals] = useState(participation);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget).entries()), mealParticipation: meals });
  }
  return <form className="form-stack" onSubmit={submit}><label>成员姓名<input name="name" defaultValue={String(initial?.name ?? "")} placeholder="怎么称呼 TA" required /></label><label>成员类型<select name="memberType" defaultValue={String(initial?.member_type ?? "ADULT")}><option value="ADULT">健康成年人</option><option value="CHILD">儿童（仅人工目标）</option><option value="DEPENDENT">其他受管成员</option></select></label><div className="form-row"><label>每日能量目标<input name="energyTarget" type="number" min="500" max="10000" defaultValue={String(targets.energy ?? 1800)} /></label><label>蛋白质目标（克）<input name="proteinTarget" type="number" min="10" max="500" defaultValue={String(targets.protein ?? 70)} /></label></div><label>膳食纤维目标（克）<input name="fiberTarget" type="number" min="5" max="100" defaultValue={String(targets.fiber ?? 25)} /></label><fieldset className="meal-checkboxes"><legend>参与餐次</legend>{([['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['snack', '加餐']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={meals[key]} onChange={(event) => setMeals({ ...meals, [key]: event.target.checked })} />{label}</label>)}</fieldset><p className="form-note"><ShieldCheck size={15} />儿童、孕妇、老人及特殊疾病人群请以专业人员建议为准。</p><button className="primary-button full-button" disabled={busy}>{busy ? "正在保存…" : initial ? "保存成员档案" : "添加成员"}</button></form>;
}

function DietaryRuleForm({ member, busy, onSubmit }: { member: Record<string, unknown>; busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) {
  return <form className="form-stack" onSubmit={(event) => formPayload(event, onSubmit)}><div className="form-context"><ShieldCheck size={20} /><span>为 <strong>{String(member.name)}</strong> 设置规则。过敏和忌口会直接排除相关菜谱。</span></div><label>规则类型<select name="ruleType"><option value="ALLERGY">过敏（硬性排除）</option><option value="AVOID">忌口（硬性排除）</option><option value="DISLIKE">不喜欢（降低推荐）</option><option value="PREFER">喜欢（提高推荐）</option></select></label><label>食材名称<input name="ingredientName" placeholder="例如：花生、牛奶、香菜" required /></label><label>备注（可选）<input name="note" placeholder="例如：接触也不适合、只是不喜欢味道" /></label><p className="form-note"><ShieldCheck size={15} />规则按食材名称标准化匹配；特殊加工食品请在菜谱中确认配料后再安排。</p><button className="primary-button full-button" disabled={busy}>{busy ? "正在保存…" : "保存饮食规则"}</button></form>;
}

function PlanItemForm({ initial, recipes, members, busy, onSubmit }: { initial?: Record<string, unknown>; recipes: Record<string, unknown>[]; members: Record<string, unknown>[]; busy: boolean; onSubmit: (data: Record<string, unknown>) => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const initialParticipants = (initial?.participants as { memberId?: string }[] | undefined)?.map((item) => String(item.memberId)).filter(Boolean) ?? members.map((member) => String(member.id));
  const [participantIds, setParticipantIds] = useState(initialParticipants);
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onSubmit({ ...Object.fromEntries(new FormData(event.currentTarget).entries()), participantIds }); }
  return <form className="form-stack" onSubmit={submit}><p className="form-note"><ShieldCheck size={15} />保存前会按所选成员的过敏、忌口和营养目标校验；计划和采购清单会同步更新。</p><div className="form-row"><label>日期<input name="mealDate" type="date" defaultValue={String(initial?.meal_date ?? today)} required /></label><label>餐次<select name="mealType" defaultValue={String(initial?.meal_type ?? "DINNER")}><option value="BREAKFAST">早餐</option><option value="LUNCH">午餐</option><option value="DINNER">晚餐</option><option value="SNACK">加餐</option></select></label></div><label>菜谱<select name="recipeId" defaultValue={String(initial?.recipe_id ?? "")} required><option value="" disabled>选择一道完整菜谱</option>{recipes.filter((recipe) => recipe.completeness_status === "COMPLETE").map((recipe) => <option key={String(recipe.id)} value={String(recipe.id)}>{String(recipe.emoji)} {String(recipe.title)} · {String(recipe.cook_minutes)} 分钟</option>)}</select></label><label>总份数<input name="totalServings" type="number" step="0.25" min="0.25" max="24" defaultValue={String(initial?.total_servings ?? 3)} required /></label><fieldset className="meal-checkboxes"><legend>这餐由谁吃</legend>{members.map((member) => { const id = String(member.id); const checked = participantIds.includes(id); return <label key={id}><input type="checkbox" checked={checked} onChange={() => setParticipantIds(checked ? participantIds.filter((memberId) => memberId !== id) : [...participantIds, id])} />{String(member.name)}</label>; })}</fieldset><button className="primary-button full-button" disabled={busy || !participantIds.length}>{busy ? "正在保存…" : initial?.id ? "保存本餐安排" : "加入周计划"}</button></form>;
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) { return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><p className="eyebrow">快乐厨房</p><h2>{title}</h2></div><button onClick={onClose} aria-label="关闭"><X size={20} /></button></div>{children}</section></div>; }
function NutritionCard({ label, value, target, unit, color }: { label: string; value: number; target: number; unit: string; color: string }) { const progress = Math.min(100, Math.round(value / target * 100)); return <article className="nutrition-card"><div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg`, "--ring-color": color } as React.CSSProperties}><span>{progress}<small>%</small></span></div><div><strong>{label}</strong><p>{value.toLocaleString()} <span>/ {target.toLocaleString()} {unit}</span></p><small>还差 {(target - value).toLocaleString()} {unit}</small></div></article>; }
function SectionHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) { return <div className="section-heading"><div><p className="eyebrow">{eyebrow}</p><h2>{title}</h2></div>{action}</div>; }
function NavButton({ id, label, icon: Icon, active, onClick }: { id: Tab; label: string; icon: typeof Home; active: boolean; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined} data-tab={id}><Icon size={20} /><span>{label}</span></button>; }
function Avatar({ name, large = false }: { name: string; large?: boolean }) { return <span className={`avatar ${large ? "large" : ""}`}>{name.slice(0, 1)}</span>; }
function LoadingView() { return <div className="loading-view"><span className="brand-mark pulse"><Leaf size={28} /></span><h2>正在看看冰箱里有什么…</h2><p>同步全家营养、库存和本周计划</p></div>; }
function EmptyError({ onRetry }: { onRetry: () => void }) { return <div className="loading-view"><span className="brand-mark"><Utensils size={28} /></span><h2>厨房暂时没有回应</h2><p>数据没有丢失，请稍后再试。</p><button className="primary-button" onClick={onRetry}>重新加载</button></div>; }

function formPayload(event: FormEvent<HTMLFormElement>, submit: (value: Record<string, unknown>) => void) { event.preventDefault(); const form = new FormData(event.currentTarget); submit(Object.fromEntries(form.entries())); }
function modalTitle(modal: string) { return ({ inventory: "快速入库", recipe: "新建详细菜谱", recipeEdit: "补充和编辑菜谱", recipeDetail: "菜谱详情", shoppingItem: "添加采购项", purchase: "填写实际购入量", article: "厨艺知识", member: "添加家庭成员", memberEdit: "编辑成员档案", rule: "设置饮食规则", plan: "安排一餐", recommend: "今晚的推荐候选" } as Record<string, string>)[modal]; }
function greeting() { const h = new Date().getHours(); return h < 11 ? "早上好" : h < 18 ? "下午好" : "晚上好"; }
function formatFullDate(date: Date) { return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" }).format(date); }
function daysUntil(date: string) { if (!date) return 999; const today = new Date(); today.setHours(0, 0, 0, 0); return Math.ceil((new Date(`${date}T00:00:00`).getTime() - today.getTime()) / 86400000); }
function expiryText(date: string) { const d = daysUntil(date); return d <= 0 ? "今天到期" : `${d} 天后到期`; }
function isToday(date: string) { return date === new Date().toISOString().slice(0, 10); }
function weekday(date: string) { return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(new Date(`${date}T12:00:00`)); }
function monthDay(date: string) { return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(`${date}T12:00:00`)); }
function weekDates(startDate: string) { const start = new Date(`${startDate}T12:00:00`); return Array.from({ length: 7 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return date.toISOString().slice(0, 10); }); }
function timerText(seconds: number) { return seconds < 60 ? `${seconds} 秒` : `${Math.round(seconds / 60 * 10) / 10} 分钟`; }
function mealTypeLabel(type: string) { return ({ BREAKFAST: "早餐", LUNCH: "午餐", DINNER: "晚餐", SNACK: "加餐" } as Record<string, string>)[type] ?? type; }
function ruleTypeLabel(type: string) { return ({ ALLERGY: "过敏", AVOID: "忌口", DISLIKE: "不喜欢", PREFER: "喜欢" } as Record<string, string>)[type] ?? type; }
function parseParticipation(value: unknown) { try { const parsed = typeof value === "string" ? JSON.parse(value) : value; const row = parsed as Record<string, unknown> | null; return { breakfast: row?.breakfast !== false, lunch: row?.lunch !== false, dinner: row?.dinner !== false, snack: row?.snack === true }; } catch { return { breakfast: true, lunch: true, dinner: true, snack: false }; } }
function suggestPurchaseQuantity(shortage: number) { if (!Number.isFinite(shortage) || shortage <= 0) return 0; if (shortage <= 100) return 100; if (shortage <= 250) return 250; if (shortage <= 500) return 500; if (shortage <= 1000) return Math.ceil(shortage / 500) * 500; return Math.ceil(shortage / 1000) * 1000; }
function coverageForRecipe(recipe: Record<string, unknown>, inventory: Record<string, unknown>[]) { const ingredients = recipe.ingredients as { code: string; grams: number }[]; if (!ingredients.length) return 0; const required = ingredients.reduce((sum, ingredient) => sum + ingredient.grams, 0); const covered = ingredients.reduce((sum, ingredient) => { const available = inventory.filter((item) => item.ingredient_code === ingredient.code).reduce((n, item) => n + Number(item.current_quantity_g), 0); return sum + Math.min(available, ingredient.grams); }, 0); return Math.round(covered / required * 100); }
