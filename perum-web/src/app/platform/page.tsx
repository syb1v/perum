"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import ConsoleShell, { Icon, NavItem } from "@/components/platform/ConsoleShell";
import Modal from "@/components/platform/Modal";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";

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

  function go(id: string) { setSection(id); if (id === "leads" && leads === null) loadLeads(); }

  const nav: NavItem[] = [
    { id: "dashboard", label: "Дашборд", icon: <Icon.Dashboard /> },
    { id: "orgs", label: "Организации", icon: <Icon.Org /> },
    { id: "billing", label: "Биллинг", icon: <Icon.Billing /> },
    { id: "releases", label: "Релизы", icon: <Icon.Release /> },
    { id: "leads", label: "Заявки", icon: <Icon.Mail />, badge: leads ? leads.filter((l) => l.status === "new").length : undefined },
  ];
  const titles: Record<string, string> = { dashboard: "Дашборд платформы", orgs: "Организации", billing: "Биллинг", releases: "Релизы (обновления)", leads: "Заявки с лендинга" };

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

      {/* ===================== BILLING ===================== */}
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
