"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import ConsoleShell, { Icon, NavItem } from "@/components/platform/ConsoleShell";
import Modal from "@/components/platform/Modal";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";
import { useToast } from "@/context/ToastContext";

const PLANS = ["trial", "basic", "pro", "enterprise"];

function statusBadge(s: string): string {
  const map: Record<string, string> = {
    active: styles.success, failed: styles.error,
    suspended: c.badgeWarn, provisioning: c.badgeWarn,
    updating: c.badgeWarn, archived: c.badgeMuted,
  };
  return `${styles.statusBadge} ${map[s] || c.badgeMuted}`;
}

export default function PlatformConsole() {
  const router = useRouter();
  const toast = useToast();
  const [section, setSection] = useState("dashboard");
  const [err, setErr] = useState("");
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [releases, setReleases] = useState<any[] | null>(null);
  const [leads, setLeads] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // create org
  const [form, setForm] = useState({ slug: "", name: "", email: "", plan: "trial" });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  // release
  const [rel, setRel] = useState({ version_tag: "", image: "", changelog: "" });
  const [publishing, setPublishing] = useState(false);

  // modals
  const [editOrg, setEditOrg] = useState<any>(null);
  const [adminsOrg, setAdminsOrg] = useState<any>(null);
  const [orgAdmins, setOrgAdmins] = useState<any[] | null>(null);
  const [newAdmin, setNewAdmin] = useState({ login: "", password: "", full_name: "", email: "" });
  const [cred, setCred] = useState<any>(null);

  // billing (selected org)
  const [billOrg, setBillOrg] = useState<string>("");
  const [billing, setBilling] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [months, setMonths] = useState(1);
  const [receivables, setReceivables] = useState<any>(null); // дебиторка: кто и сколько должен

  // infrastructure
  const [nodes, setNodes] = useState<any[] | null>(null);
  const [nodeUtil, setNodeUtil] = useState<Record<number, any>>({});
  const [capacityRec, setCapacityRec] = useState<any>(null);
  const [capacityCount, setCapacityCount] = useState(10);
  const [showNodeForm, setShowNodeForm] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);
  const [nodeCreated, setNodeCreated] = useState<any>(null);
  const [nodeForm, setNodeForm] = useState({ name: "", hostname: "", cpu_cores: 2, ram_gb: 2, disk_gb: 20, max_schools: 5, org_id: 0 });

  async function load() {
    try {
      setOrgs(await papi("/api/organizations"));
      try { setStats(await papi("/api/platform/stats")); } catch { /* non-fatal */ }
      try { setReceivables(await papi("/api/billing/receivables")); } catch { /* non-fatal */ }
      const r = await papi("/api/releases");
      setReleases(r.releases || []);
    } catch (e: any) {
      if (e.status === 401) { router.push("/platform/login"); return; }
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (!getPlatformToken()) { router.push("/platform/login"); return; }
    if (getTokenPayload()?.role === "org_admin") { router.push("/platform/org"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setCreated(null); setCreating(true);
    try {
      const r = await papi("/api/organizations", { method: "POST", body: JSON.stringify({ slug: form.slug, name: form.name, admin_email: form.email || null, plan: form.plan }) });
      setCreated(r); setForm({ slug: "", name: "", email: "", plan: "trial" }); load();
    } catch (e: any) { setErr(e.message); } finally { setCreating(false); }
  }

  async function orgAction(o: any, path: string, method = "POST", confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(o.slug); setErr("");
    try { await papi(`/api/organizations/${o.slug}${path}`, { method }); load(); if (billOrg === o.slug) reloadBilling(o.slug); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function removeOrg(o: any) {
    // Необратимое удаление орг со всеми школами: требуем ввести slug (бэкап снимается).
    const typed = prompt(
      `БЕЗВОЗВРАТНОЕ удаление организации «${o.name}» (${o.slug}) вместе со ВСЕМИ её школами и данными. Перед удалением снимается бэкап БД школ.\n\nДля подтверждения введите slug организации:`,
    );
    if (typed == null) return;
    if (typed.trim() !== o.slug) { alert("slug не совпал — удаление отменено"); return; }
    setBusy(o.slug); setErr("");
    try { await papi(`/api/organizations/${o.slug}?purge=true&confirm=${encodeURIComponent(o.slug)}`, { method: "DELETE" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function saveEdit() {
    if (!editOrg) return;
    setBusy(editOrg.slug); setErr("");
    try {
      await papi(`/api/organizations/${editOrg.slug}`, { method: "PATCH", body: JSON.stringify({ name: editOrg.name, admin_email: editOrg.admin_email || null, notes: editOrg.notes || null, deployment_mode: editOrg.deployment_mode }) });
      setEditOrg(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function openAdmins(o: any) {
    setAdminsOrg(o); setOrgAdmins(null); setCred(null); setNewAdmin({ login: "", password: "", full_name: "", email: "" });
    try { setOrgAdmins((await papi(`/api/organizations/${o.slug}/org-admins`)).org_admins || []); } catch (e: any) { setErr(e.message); }
  }
  async function reloadAdmins() { if (adminsOrg) setOrgAdmins((await papi(`/api/organizations/${adminsOrg.slug}/org-admins`)).org_admins || []); }
  async function addAdmin(e: React.FormEvent) {
    e.preventDefault(); if (!adminsOrg) return; setBusy("adm"); setErr("");
    try { await papi(`/api/organizations/${adminsOrg.slug}/org-admins`, { method: "POST", body: JSON.stringify(newAdmin) }); setNewAdmin({ login: "", password: "", full_name: "", email: "" }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function resetAdmin(id: number) {
    if (!adminsOrg) return; setBusy("adm");
    try { const r = await papi(`/api/organizations/${adminsOrg.slug}/org-admins/${id}/reset-password`, { method: "POST" }); setCred(r); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function toggleAdmin(a: any) {
    if (!adminsOrg) return; setBusy("adm");
    try { await papi(`/api/organizations/${adminsOrg.slug}/org-admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !a.is_active }) }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function delAdmin(id: number, login: string) {
    if (!adminsOrg || !confirm(`Удалить org_admin «${login}»?`)) return; setBusy("adm");
    try { await papi(`/api/organizations/${adminsOrg.slug}/org-admins/${id}`, { method: "DELETE" }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function openBilling(slug: string) {
    setBillOrg(slug); setBilling(null); setInvoices([]); setMonths(1); setSection("billing");
    reloadBilling(slug);
  }
  async function reloadBilling(slug: string) {
    try {
      setBilling(await papi(`/api/organizations/${slug}/billing`));
      setInvoices((await papi(`/api/organizations/${slug}/billing/invoices`)).invoices || []);
    } catch (e: any) { setErr(e.message); }
  }
  async function changePlan(slug: string, plan: string, force = false) {
    setBusy("bill"); setErr("");
    try {
      const r = await papi(`/api/organizations/${slug}/billing${force ? "?force=true" : ""}`, { method: "PUT", body: JSON.stringify({ plan }) });
      if (r?.warning) setErr(r.warning);
      await reloadBilling(slug); load();
    } catch (e: any) {
      // Понижение ниже текущего использования бэкенд блокирует (400). Даём оператору
      // явный выбор продавить через force (сверхлимитные школы остаются работать).
      if (e.status === 400 && !force && confirm(`${e.message}\n\nПонизить план ПРИНУДИТЕЛЬНО?`)) {
        setBusy(null);
        return changePlan(slug, plan, true);
      }
      setErr(e.message);
    } finally { setBusy(null); }
  }
  async function charge(slug: string) {
    setBusy("bill"); setErr("");
    try { await papi(`/api/organizations/${slug}/billing/charge`, { method: "POST", body: JSON.stringify({ months }) }); await reloadBilling(slug); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function enforce() {
    if (!confirm("Приостановить организации с просроченной подпиской (их школы остановятся)?")) return;
    setErr("");
    try { const r = await papi("/api/billing/enforce", { method: "POST" }); alert(`Проверено: ${r.checked}. Приостановлено: ${r.suspended.length ? r.suspended.join(", ") : "нет"}.`); load(); }
    catch (e: any) { setErr(e.message); }
  }

  async function publishRelease(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setPublishing(true);
    try { await papi("/api/releases", { method: "POST", body: JSON.stringify({ version_tag: rel.version_tag, image: rel.image || null, changelog: rel.changelog || null }) }); setRel({ version_tag: "", image: "", changelog: "" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setPublishing(false); }
  }

  async function loadLeads() { try { setLeads((await papi("/api/contact")).leads || []); } catch (e: any) { setErr(e.message); } }
  async function toggleLead(id: number) { try { await papi(`/api/contact/${id}/status`, { method: "PATCH" }); loadLeads(); } catch (e: any) { setErr(e.message); } }

  async function loadInfra() {
    try {
      const data = await papi("/api/platform/nodes");
      setNodes(data.nodes || []);
      const utils: Record<number, any> = {};
      for (const n of data.nodes || []) {
        try { utils[n.id] = await papi(`/api/platform/nodes/${n.id}/utilization`); } catch { /* skip */ }
      }
      setNodeUtil(utils);
    } catch (e: any) { 
      if (e.status === 401) return; 
      setErr("Ошибка загрузки нод: " + (e.message || "неизвестная ошибка")); 
    }
  }
  async function createNode(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setBusy("node");
    try {
      const payload: any = { ...nodeForm };
      if (!payload.org_id) delete payload.org_id;
      await papi("/api/platform/nodes", { method: "POST", body: JSON.stringify(payload) });
      setShowNodeForm(false); setNodeForm({ name: "", hostname: "", cpu_cores: 2, ram_gb: 2, disk_gb: 20, max_schools: 5, org_id: 0 });
      toast.showSuccess(`Нода «${nodeForm.name}» зарегистрирована. Скачайте bootstrap-скрипт для развёртывания.`);
      loadInfra();
    } catch (e: any) { toast.showError("Ошибка создания ноды: " + (e.message || "неизвестная")); } finally { setBusy(null); }
  }
  async function drainNode(id: number) { if (!confirm("Перевести ноду в draining? Новые школы не будут на неё назначаться.")) return; try { await papi(`/api/platform/nodes/${id}/drain`, { method: "POST" }); loadInfra(); toast.showInfo("Нода переведена в draining"); } catch (e: any) { toast.showError(e.message); } }
  async function deleteNode(id: number, name: string) { if (!confirm(`Удалить ноду «${name}»? Это нельзя отменить.`)) return; try { await papi(`/api/platform/nodes/${id}`, { method: "DELETE" }); loadInfra(); toast.showInfo(`Нода «${name}» удалена`); } catch (e: any) { toast.showError(e.message); } }
  async function getBootstrap(id: number, name: string) {
    try {
      const s = await papi(`/api/platform/nodes/${id}/bootstrap-script`, { method: "POST" });
      const blob = new Blob([s.content], { type: "text/x-shellscript" });
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = s.filename; a.click();
      URL.revokeObjectURL(url); toast.showSuccess(`Скрипт для ${name} скачан. Запустите: bash ${s.filename}`);
    } catch (e: any) { toast.showError(e.message); }
  }
  async function getRecommendation() { try { setCapacityRec(await papi(`/api/platform/capacity/recommendation?school_count=${capacityCount}`)); setShowCapacity(true); } catch (e: any) { toast.showError(e.message); } }

  function go(id: string) { setSection(id); if (id === "leads" && leads === null) loadLeads(); if (id === "infrastructure" && nodes === null) loadInfra(); }

  const nav: NavItem[] = [
    { id: "dashboard", label: "Дашборд", icon: <Icon.Dashboard /> },
    { id: "orgs", label: "Организации", icon: <Icon.Org /> },
    { id: "infrastructure", label: "Инфраструктура", icon: <Icon.Server /> },
    { id: "billing", label: "Биллинг", icon: <Icon.Billing /> },
    { id: "releases", label: "Релизы", icon: <Icon.Release /> },
    { id: "leads", label: "Заявки", icon: <Icon.Mail />, badge: leads ? leads.filter((l) => l.status === "new").length : undefined },
  ];
  const titles: Record<string, string> = { dashboard: "Дашборд платформы", orgs: "Организации", infrastructure: "Инфраструктура (ноды)", billing: "Биллинг", releases: "Релизы (обновления)", leads: "Заявки с лендинга" };

  return (
    <ConsoleShell
      nav={nav} active={section} onChange={go} title={titles[section]}
      subtitle="Ядро ПЭРУМ — управление организациями"
      userLabel={getTokenPayload()?.login || "admin"}
      onLogout={() => { clearPlatformToken(); router.push("/platform/login"); }}
      headerActions={section === "billing" ? <button className={styles.btnSecondary} onClick={enforce}>Проверить просрочки</button> : undefined}
    >
      {err && <p className={styles.errorBanner}>{err}</p>}

      {/* ===================== DASHBOARD ===================== */}
      {section === "dashboard" && (
        <>
          {stats ? (
            <div className={c.kpiGrid}>
              <Kpi v={stats.organizations_total} l="Организаций" />
              <Kpi v={`${stats.schools_online} / ${stats.schools_total}`} l="Школ онлайн" online={stats.schools_online > 0} />
              <Kpi v={stats.users_total} l="Пользователей" />
              <Kpi v={stats.students} l="Учеников" />
              <Kpi v={stats.teachers} l="Учителей" />
              <Kpi v={stats.grades_total} l="Оценок" />
              <Kpi v={stats.active_24h} l="Активны за 24ч" />
            </div>
          ) : <p className={c.muted}>Загрузка статистики…</p>}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>По организациям</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Организация</th><th>План</th><th>Статус</th><th>Школ</th><th>Онлайн</th><th>Учеников</th><th>Учителей</th></tr></thead>
                <tbody>
                  {stats?.per_org?.map((o: any) => (
                    <tr key={o.slug}>
                      <td><b>{o.name}</b><br /><span className={c.muted}>{o.slug}</span></td>
                      <td>{o.plan}</td>
                      <td><span className={statusBadge(o.status)}>{o.status}</span></td>
                      <td>{o.schools_total}</td>
                      <td><span className={o.schools_online > 0 ? c.dotOnline : c.dotOffline}>{o.schools_online}</span></td>
                      <td>{o.students}</td>
                      <td>{o.teachers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {stats?.per_org?.length === 0 && <p className={styles.emptyState}>Нет организаций.</p>}
            </div>
          </div>
        </>
      )}

      {/* ===================== ORGS ===================== */}
      {section === "orgs" && (
        <>
          {created && (
            <div className={`${styles.card} ${c.okCard}`}>
              <b>Организация создана: {created.organization.slug}</b>
              {created.org_admin ? <p>Организатор: <code className={styles.code}>{created.org_admin.login}</code> · временный пароль: <code className={styles.code}>{created.org_admin.temporary_password}</code></p>
                : <p className={c.muted}>org_admin не создан (не указан email).</p>}
            </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Создать организацию</h2>
            <form onSubmit={createOrg} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Slug</label><input className={styles.input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="acme" required /></div>
                <div className={styles.formGroup}><label className={styles.label}>Название</label><input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Education" required /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Email организатора</label><input className={styles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@acme.ru" /></div>
                <div className={styles.formGroup}><label className={styles.label}>План</label><select className={styles.input} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <div className={styles.formActions}><button className={styles.submitBtn} disabled={creating}>{creating ? "Создаётся (поднимается стек)…" : "Создать организацию"}</button></div>
            </form>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Все организации</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Slug</th><th>Название</th><th>План</th><th>Статус</th><th>Создана</th><th>Действия</th></tr></thead>
                <tbody>
                  {orgs?.map((o) => (
                    <tr key={o.id}>
                      <td>{o.slug}</td><td>{o.name}</td><td>{o.plan}</td>
                      <td><span className={statusBadge(o.status)}>{o.status}</span></td>
                      <td>{new Date(o.created_at).toLocaleDateString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className={styles.actionBtn} onClick={() => setEditOrg({ ...o })}>Изм.</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openAdmins(o)}>Орг-админы</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openBilling(o.slug)}>Биллинг</button>{" "}
                        <button className={styles.actionBtn} disabled={busy === o.slug || !["active", "suspended"].includes(o.status)} onClick={() => orgAction(o, o.status === "suspended" ? "/unsuspend" : "/suspend", "POST", o.status === "suspended" ? undefined : `Заморозить «${o.name}»? Школы будут остановлены.`)}>{o.status === "suspended" ? "Разморозить" : "Заморозить"}</button>{" "}
                        <button className={`${styles.actionBtn} ${styles.danger}`} disabled={busy === o.slug || o.status === "provisioning"} onClick={() => removeOrg(o)}>Удал.</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {orgs && orgs.length === 0 && <p className={styles.emptyState}>Пока нет организаций.</p>}
            </div>
          </div>
        </>
      )}

      {/* ===================== INFRASTRUCTURE ===================== */}
      {section === "infrastructure" && (
        <>
          <div className={c.toolbar}>
            <button className={styles.submitBtn} type="button" onClick={() => setShowNodeForm(!showNodeForm)}>{showNodeForm ? "— Скрыть форму" : "+ Добавить ноду"}</button>
            <button className={styles.btnSecondary} type="button" onClick={() => setShowFaq(true)}>FAQ</button>
            <span className={c.spacer} />
            <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
              <label className={styles.label} style={{ marginBottom: 0 }}>Сколько школ?</label>
              <input className={styles.input} type="number" min={1} max={1000} value={capacityCount} onChange={(e) => setCapacityCount(Number(e.target.value) || 10)} style={{ width: 80 }} />
              <button className={styles.btnSecondary} type="button" onClick={getRecommendation}>Рекомендация</button>
            </div>
          </div>

          {showNodeForm && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Зарегистрировать новую ноду</h2>
              <form onSubmit={createNode} className={styles.form}>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Имя ноды <span className={c.muted}>— например node-01</span></label>
                    <input className={styles.input} value={nodeForm.name} onChange={(e) => setNodeForm({ ...nodeForm, name: e.target.value })} placeholder="node-01" required />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>IP-адрес или хост <span className={c.muted}>— публичный адрес сервера</span></label>
                    <input className={styles.input} value={nodeForm.hostname} onChange={(e) => setNodeForm({ ...nodeForm, hostname: e.target.value })} placeholder="87.232.119.17" required />
                  </div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}><label className={styles.label}>CPU (ядер)</label><input className={styles.input} type="number" min={1} value={nodeForm.cpu_cores} onChange={(e) => setNodeForm({ ...nodeForm, cpu_cores: Number(e.target.value) || 2 })} /></div>
                  <div className={styles.formGroup}><label className={styles.label}>RAM (GB)</label><input className={styles.input} type="number" min={1} step={0.5} value={nodeForm.ram_gb} onChange={(e) => setNodeForm({ ...nodeForm, ram_gb: Number(e.target.value) || 2 })} /></div>
                  <div className={styles.formGroup}><label className={styles.label}>Диск (GB)</label><input className={styles.input} type="number" min={10} value={nodeForm.disk_gb} onChange={(e) => setNodeForm({ ...nodeForm, disk_gb: Number(e.target.value) || 20 })} /></div>
                </div>
                <div className={styles.formRow}>
                  <div className={styles.formGroup}><label className={styles.label}>Макс. школ <span className={c.muted}>— лимит</span></label><input className={styles.input} type="number" min={1} value={nodeForm.max_schools} onChange={(e) => setNodeForm({ ...nodeForm, max_schools: Number(e.target.value) || 5 })} /></div>
                  <div className={styles.formGroup}><label className={styles.label}>Org ID <span className={c.muted}>— 0 = общий пул</span></label><input className={styles.input} type="number" min={0} value={nodeForm.org_id} onChange={(e) => setNodeForm({ ...nodeForm, org_id: Number(e.target.value) || 0 })} /></div>
                </div>
                <div className={styles.formActions}>
                  <button type="submit" className={styles.submitBtn} disabled={busy === "node"}>{busy === "node" ? "Создаётся…" : "Зарегистрировать ноду"}</button>
                </div>
              </form>
            </div>
          )}

          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Зарегистрированные ноды ({nodes ? nodes.length : 0})</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Имя</th><th>Хост</th><th>Ресурсы</th><th>Статус</th><th>Школ</th><th>Загрузка</th><th>Действия</th></tr></thead>
                <tbody>
                  {nodes?.map((n) => {
                    const u = nodeUtil[n.id];
                    const pct = u ? u.capacity_percent : 0;
                    const barColor = pct > 80 ? "#dc3545" : pct > 60 ? "#ffc107" : "#28a745";
                    return (
                      <tr key={n.id}>
                        <td><b>{n.name}</b></td>
                        <td><code className={styles.code}>{n.hostname}</code></td>
                        <td>{n.cpu_cores} CPU / {n.ram_gb} GB RAM / {n.disk_gb} GB Disk</td>
                        <td><span className={statusBadge(n.status)}>{n.status}</span></td>
                        <td>{u ? `${u.schools_count}/${u.max_schools}` : "—"}</td>
                        <td style={{minWidth:120}}><div style={{height:6, background:"#eee", borderRadius:3, overflow:"hidden"}}><div style={{height:6, width:`${Math.min(pct,100)}%`, background:barColor, borderRadius:3}} /></div><small style={{color:"var(--text-secondary)"}}>{u ? `${Math.round(pct)}%` : "?"}</small></td>
                        <td style={{whiteSpace:"nowrap"}}>
                          {n.status === "pending_bootstrap" && <button type="button" className={styles.actionBtn} onClick={() => getBootstrap(n.id, n.name)}>Скачать скрипт</button>}
                          {n.status === "active" && <button type="button" className={styles.actionBtn} onClick={() => drainNode(n.id)}>Drain</button>}
                          <button type="button" className={`${styles.actionBtn} ${styles.danger}`} onClick={() => deleteNode(n.id, n.name)}>Удал.</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {nodes && nodes.length === 0 && <p className={styles.emptyState}>Нет зарегистрированных нод. Нажмите «Добавить ноду» чтобы зарегистрировать сервер.</p>}
              {nodes === null && <p className={c.muted} onClick={() => { loadInfra(); }} style={{cursor:"pointer", textDecoration:"underline"}}>Нажмите для загрузки списка нод…</p>}
            </div>
          </div>

          {showFaq && (
            <Modal title="FAQ — управление серверами (нодами)" onClose={() => setShowFaq(false)} width={700}>
              <p className={c.muted}><b>Нода</b> — это физический или виртуальный сервер, на котором крутятся школы организации. Каждая школа — изолированный Docker-стек (контейнер + БД). Система автоматически распределяет школы по наиболее свободным нодам.</p>
              <p className={c.muted} style={{marginTop:12}}><b>Как добавить новую ноду:</b></p>
              <ol className={c.muted} style={{paddingLeft:20}}>
                <li>Зарегистрируйте ноду — появится статус <span className={statusBadge("pending_bootstrap")}>pending_bootstrap</span></li>
                <li>Нажмите «Скачать скрипт» — получите bash-скрипт для автоматической установки</li>
                <li>Запустите скрипт на целевом сервере: <code className={styles.code}>bash perum-node-*.sh</code></li>
                <li>Через 1-2 минуты нода подключится и статус сменится на <span className={statusBadge("active")}>active</span></li>
              </ol>
              <p className={c.muted} style={{marginTop:12}}><b>Статусы нод:</b></p>
              <ul className={c.muted} style={{paddingLeft:20}}>
                <li><span className={statusBadge("pending_bootstrap")}>pending_bootstrap</span> — нода зарегистрирована, ждёт установки агента</li>
                <li><span className={statusBadge("active")}>active</span> — агент подключён, принимает школы</li>
                <li><span className={statusBadge("draining")}>draining</span> — новые школы не назначаются, существующие мигрируют</li>
                <li><span className="badgeMuted" style={{background:"#e2e3e5", color:"#383d41", padding:"2px 8px", borderRadius:10, fontSize:"0.75rem"}}>offline</span> — агент недоступен</li>
              </ul>
              <p className={c.muted} style={{marginTop:12}}><b>Рекомендации sizing (на одну школу ~200MB RAM, ~0.15 CPU):</b></p>
              <table className={styles.table} style={{marginTop:8}}>
                <thead><tr><th>Конфигурация</th><th>S (2/2/20)</th><th>M (4/4/50)</th><th>L (8/8/100)</th><th>XL (16/16/200)</th></tr></thead>
                <tbody><tr><td>Школ</td><td>5</td><td>15</td><td>35</td><td>75</td></tr></tbody>
              </table>
            </Modal>
          )}

          {showCapacity && capacityRec && (
            <Modal title={`Рекомендации sizing для ${capacityRec.total_schools} школ`} onClose={() => setShowCapacity(false)} width={700}>
              <p className={c.muted}><b>{capacityRec.summary}</b></p>
              <div className={styles.tableContainer} style={{marginTop:12}}>
                <table className={styles.table}>
                  <thead><tr><th>Конфигурация сервера</th><th>Школ на ноду</th><th>Нужно нод</th></tr></thead>
                  <tbody>{capacityRec.recommendations?.map((r: any, i: number) => (
                    <tr key={i}><td><b>{r.cpu_cores} CPU</b> / <b>{r.ram_gb} GB RAM</b> / {r.disk_gb} GB Disk</td><td>{r.schools_per_node}</td><td>{r.nodes_needed}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </Modal>
          )}
        </>
      )}
      {section === "billing" && (
        <>
          <div className={c.toolbar}>
            <select className={styles.input} style={{ maxWidth: 280 }} value={billOrg} onChange={(e) => e.target.value && openBilling(e.target.value)}>
              <option value="">— выберите организацию —</option>
              {orgs?.map((o) => <option key={o.slug} value={o.slug}>{o.name} ({o.slug})</option>)}
            </select>
            <span className={c.spacer} />
            <button className={styles.btnSecondary} onClick={enforce}>Проверить просрочки</button>
          </div>
          {receivables && receivables.organizations?.length > 0 && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Дебиторка — кто и сколько должен ({receivables.total_rub} ₽)</h2>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead><tr><th>Организация</th><th>План</th><th>Сумма</th><th>Статус орг</th><th>Период до</th></tr></thead>
                  <tbody>{receivables.organizations.map((r: any) => (
                    <tr key={r.invoice_id}>
                      <td><b>{r.org_name}</b><br /><span className={c.muted}>{r.org_slug}</span></td>
                      <td>{r.plan}</td><td>{r.amount_rub} ₽</td>
                      <td><span className={statusBadge(r.org_status)}>{r.org_status}</span></td>
                      <td>{r.period_end ? new Date(r.period_end).toLocaleDateString() : "—"}</td>
                    </tr>))}</tbody>
                </table>
              </div>
            </div>
          )}
          {!billOrg ? <p className={c.muted}>Выберите организацию, чтобы управлять её планом, оплатой и счетами.</p>
            : !billing ? <p className={c.muted}>Загрузка…</p> : (
              <>
                <div className={c.kpiGrid}>
                  <Kpi v={billing.plan} l={`План (${billing.price_rub_month} ₽/мес)`} />
                  <Kpi v={`${billing.schools_used} / ${billing.school_limit}`} l="Школ (исп./лимит)" />
                  <Kpi v={billing.subscription?.status} l="Подписка" />
                  <Kpi v={billing.subscription?.days_left ?? "—"} l="Дней до конца" />
                </div>
                {billing.subscription?.delinquent && <p className={styles.errorBanner}>Подписка просрочена — управление школами заблокировано до оплаты.</p>}
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>Управление</h2>
                  <div className={styles.formRow}>
                    <div className={styles.formGroup}><label className={styles.label}>Сменить план</label>
                      <select className={styles.input} value={billing.plan} disabled={busy === "bill"} onChange={(e) => changePlan(billOrg, e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                    </div>
                    <div className={styles.formGroup}><label className={styles.label}>Оплата (месяцев)</label>
                      <input className={styles.input} type="number" min={1} value={months} disabled={busy === "bill"} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                  </div>
                  <div className={styles.formActions}><button className={styles.submitBtn} disabled={busy === "bill"} onClick={() => charge(billOrg)}>Отметить оплату</button></div>
                </div>
                <div className={styles.card}>
                  <h2 className={styles.cardTitle}>Счета</h2>
                  <div className={styles.tableContainer}>
                    <table className={styles.table}>
                      <thead><tr><th>Счёт</th><th>План</th><th>Сумма</th><th>Статус</th><th>Период до</th><th>Оплачен</th></tr></thead>
                      <tbody>{invoices.map((iv) => (<tr key={iv.id}><td>#{iv.id}</td><td>{iv.plan}</td><td>{iv.amount_rub} ₽</td><td>{iv.status}</td><td>{iv.period_end ? new Date(iv.period_end).toLocaleDateString() : "—"}</td><td>{iv.paid_at ? new Date(iv.paid_at).toLocaleString() : "—"}</td></tr>))}</tbody>
                    </table>
                    {invoices.length === 0 && <p className={styles.emptyState}>Счетов пока нет.</p>}
                  </div>
                </div>
              </>
            )}
        </>
      )}

      {/* ===================== RELEASES ===================== */}
      {section === "releases" && (
        <>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Опубликовать релиз</h2>
            <p className={c.muted}>Релиз становится доступен организациям — они обновляют свои школы по кнопке (OTA, opt-in, volume-preserving). Обычно релиз тенанта публикует CI автоматически при реальном изменении кода (тег <code className={styles.code}>git-&lt;sha&gt;</code>, образ из GHCR). Ручная публикация ниже — резерв; ядро отклонит релиз, если образ совпадает с текущим (нет реального обновления).</p>
            <form onSubmit={publishRelease} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Версия (тег)</label><input className={styles.input} value={rel.version_tag} onChange={(e) => setRel({ ...rel, version_tag: e.target.value })} placeholder="1.1.0" required /></div>
                <div className={styles.formGroup}><label className={styles.label}>Docker-образ</label><input className={styles.input} value={rel.image} onChange={(e) => setRel({ ...rel, image: e.target.value })} placeholder="ghcr.io/syb1v/perum-tenant:1.1.0" /></div>
              </div>
              <div className={styles.formGroup}><label className={styles.label}>Что нового</label><input className={styles.input} value={rel.changelog} onChange={(e) => setRel({ ...rel, changelog: e.target.value })} placeholder="Описание изменений" /></div>
              <div className={styles.formActions}><button className={styles.submitBtn} disabled={publishing}>{publishing ? "…" : "Опубликовать (сделать текущим)"}</button></div>
            </form>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Релизы</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Версия</th><th>Образ</th><th>Коммит</th><th>Что нового</th><th>Текущий</th><th>Опубликован</th></tr></thead>
                <tbody>{releases?.map((r) => (<tr key={r.id}><td>{r.version_tag}</td><td><code className={styles.code}>{r.image}</code></td><td>{r.source_commit ? <code className={styles.code}>{String(r.source_commit).slice(0, 12)}</code> : "—"}</td><td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{r.changelog || "—"}</td><td>{r.is_current ? <span className={`${styles.statusBadge} ${styles.success}`}>текущий</span> : ""}</td><td>{new Date(r.published_at).toLocaleString()}</td></tr>))}</tbody>
              </table>
              {releases && releases.length === 0 && <p className={styles.emptyState}>Релизов пока нет.</p>}
            </div>
          </div>
        </>
      )}

      {/* ===================== LEADS ===================== */}
      {section === "leads" && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Заявки с лендинга</h2>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead><tr><th>Дата</th><th>Организация</th><th>Email</th><th>Сообщение</th><th>Статус</th><th></th></tr></thead>
              <tbody>{leads?.map((l) => (
                <tr key={l.id}>
                  <td>{l.created_at ? new Date(l.created_at).toLocaleString() : "—"}</td>
                  <td>{l.org_name || "—"}</td><td>{l.email}</td><td style={{ maxWidth: 320 }}>{l.message || "—"}</td>
                  <td><span className={`${styles.statusBadge} ${l.status === "new" ? c.badgeWarn : styles.success}`}>{l.status === "new" ? "новая" : "обработана"}</span></td>
                  <td><button className={styles.actionBtn} onClick={() => toggleLead(l.id)}>{l.status === "new" ? "Обработана" : "В новые"}</button></td>
                </tr>))}</tbody>
            </table>
            {leads && leads.length === 0 && <p className={styles.emptyState}>Заявок пока нет.</p>}
            {leads === null && <p className={c.muted}>Загрузка…</p>}
          </div>
        </div>
      )}

      {/* ===================== MODALS ===================== */}
      {editOrg && (
        <Modal title={`Редактирование — ${editOrg.slug}`} onClose={() => setEditOrg(null)} footer={<><button className={styles.cancelBtn} onClick={() => setEditOrg(null)}>Отмена</button><button className={styles.submitBtn} disabled={busy === editOrg.slug} onClick={saveEdit}>Сохранить</button></>}>
          <div className={styles.formGroup}><label className={styles.label}>Название</label><input className={styles.input} value={editOrg.name || ""} onChange={(e) => setEditOrg({ ...editOrg, name: e.target.value })} /></div>
          <div className={styles.formGroup}><label className={styles.label}>Email организатора</label><input className={styles.input} value={editOrg.admin_email || ""} onChange={(e) => setEditOrg({ ...editOrg, admin_email: e.target.value })} /></div>
          <div className={styles.formGroup}><label className={styles.label}>Режим</label><select className={styles.input} value={editOrg.deployment_mode || "shared_host"} onChange={(e) => setEditOrg({ ...editOrg, deployment_mode: e.target.value })}><option value="shared_host">shared_host</option><option value="dedicated_vm">dedicated_vm</option></select></div>
          <div className={styles.formGroup}><label className={styles.label}>Заметки</label><textarea className={styles.input} rows={3} value={editOrg.notes || ""} onChange={(e) => setEditOrg({ ...editOrg, notes: e.target.value })} /></div>
        </Modal>
      )}

      {adminsOrg && (
        <Modal title={`Организаторы — ${adminsOrg.name}`} onClose={() => setAdminsOrg(null)} width={680}>
          {cred && <div className={`${styles.card} ${c.okCard}`}><b>Пароль для {cred.login}</b><p>Временный пароль: <code className={styles.code}>{cred.temporary_password}</code></p></div>}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead><tr><th>Логин</th><th>Имя</th><th>Активен</th><th>Действия</th></tr></thead>
              <tbody>{orgAdmins?.map((a) => (<tr key={a.id}><td>{a.login}</td><td>{a.full_name || "—"}</td><td>{a.is_active ? "да" : "нет"}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className={styles.actionBtn} disabled={busy === "adm"} onClick={() => resetAdmin(a.id)}>Сбросить пароль</button>{" "}<button className={styles.actionBtn} disabled={busy === "adm"} onClick={() => toggleAdmin(a)}>{a.is_active ? "Деактив." : "Актив."}</button>{" "}<button className={`${styles.actionBtn} ${styles.danger}`} disabled={busy === "adm"} onClick={() => delAdmin(a.id, a.login)}>Удал.</button></td></tr>))}</tbody>
            </table>
            {orgAdmins && orgAdmins.length === 0 && <p className={styles.emptyState}>Пока нет организаторов.</p>}
          </div>
          <form onSubmit={addAdmin} className={styles.form} style={{ marginTop: 14 }}>
            <h3 className={styles.cardTitle}>Добавить организатора</h3>
            <div className={styles.formRow}>
              <div className={styles.formGroup}><label className={styles.label}>Логин</label><input className={styles.input} value={newAdmin.login} onChange={(e) => setNewAdmin({ ...newAdmin, login: e.target.value })} required /></div>
              <div className={styles.formGroup}><label className={styles.label}>Пароль</label><input className={styles.input} value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} required /></div>
            </div>
            <div className={styles.formRow}>
              <div className={styles.formGroup}><label className={styles.label}>Имя</label><input className={styles.input} value={newAdmin.full_name} onChange={(e) => setNewAdmin({ ...newAdmin, full_name: e.target.value })} /></div>
              <div className={styles.formGroup}><label className={styles.label}>Email</label><input className={styles.input} value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} /></div>
            </div>
            <div className={styles.formActions}><button className={styles.submitBtn} disabled={busy === "adm"}>Добавить</button></div>
          </form>
        </Modal>
      )}
    </ConsoleShell>
  );
}

function Kpi({ v, l, online }: { v: React.ReactNode; l: string; online?: boolean }) {
  return (
    <div className={c.kpiCard}>
      <div className={c.kpiVal}>{online !== undefined ? <span className={online ? c.dotOnline : c.dotOffline}>{v}</span> : v}</div>
      <div className={c.kpiLabel}>{l}</div>
    </div>
  );
}
