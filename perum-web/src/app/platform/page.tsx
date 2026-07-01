"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import ConsoleShell, { Icon, NavItem } from "@/components/platform/ConsoleShell";
import Modal from "@/components/platform/Modal";
import { CreateNodeWizard, EditNodeModal, NodeRow, NodeSchoolsModal } from "@/components/platform/InfraNodes";
import NewsManager from "@/components/platform/NewsManager";
import SupportInbox from "@/components/platform/SupportInbox";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";
import infra from "@/app/platform/infra.module.css";
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
  const [supportBadge, setSupportBadge] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  // create org
  const [form, setForm] = useState({ domain: "", node_id: "" as string | number, name: "", email: "", plan: "trial" });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  // org DNS guide modal
  const [orgDnsFor, setOrgDnsFor] = useState<any>(null);
  const [orgDns, setOrgDns] = useState<any>(null);

  // release
  const [rel, setRel] = useState({ version_tag: "", image: "", changelog: "" });
  const [publishing, setPublishing] = useState(false);

  // OTA source config (источник обновлений)
  const [ota, setOta] = useState<any>(null);
  const [otaForm, setOtaForm] = useState({ image_registry: "ghcr.io", image_repository: "", registry_username: "", private: false, source_repo: "", tenant_path: "perum-tenant" });
  const [otaToken, setOtaToken] = useState("");
  const [otaBusy, setOtaBusy] = useState(false);
  const [otaHelp, setOtaHelp] = useState(false);
  const [showOtaConfig, setShowOtaConfig] = useState(false); // настройки источника скрыты по умолчанию
  const [relLinks, setRelLinks] = useState<{ commit_url?: string; tree_url?: string; source_commit?: string } | null>(null);

  // modals
  const [editOrg, setEditOrg] = useState<any>(null);
  const [orgInfra, setOrgInfra] = useState<any>(null);
  const [orgInfraData, setOrgInfraData] = useState<any>(null);
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
  const [showWizard, setShowWizard] = useState(false);
  const [editNode, setEditNode] = useState<any>(null);
  const [schoolsNode, setSchoolsNode] = useState<any>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showCapacity, setShowCapacity] = useState(false);

  async function load() {
    try {
      setOrgs(await papi("/api/organizations"));
      try { setStats(await papi("/api/platform/stats")); } catch { /* non-fatal */ }
      try { setReceivables(await papi("/api/billing/receivables")); } catch { /* non-fatal */ }
      try { setSupportBadge((await papi("/api/support/admin/badge")).count || 0); } catch { /* non-fatal */ }
      try { const nd = await papi("/api/platform/nodes"); setNodes(nd.nodes || []); } catch { /* non-fatal */ }
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

  // Реал-тайм для раздела «Инфраструктура»: пока он открыт, обновляем список нод и
  // их метрики каждые 10с (тихо, без сброса UI). Монитор ядра пишет свежие метрики
  // ~раз в минуту, но во время рестарта ноды связь меняется быстрее — поллинг ловит
  // переход online→offline→online.
  useEffect(() => {
    if (section !== "infrastructure") return;
    const t = setInterval(() => { loadInfra(); }, 2_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  async function createOrg(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setCreated(null); setCreating(true);
    try {
      const r = await papi("/api/organizations", { method: "POST", body: JSON.stringify({ domain: form.domain, node_id: Number(form.node_id), name: form.name, admin_email: form.email || null, plan: form.plan }) });
      setCreated(r); setForm({ domain: "", node_id: "", name: "", email: "", plan: "trial" }); load();
    } catch (e: any) { setErr(e.message); } finally { setCreating(false); }
  }

  async function orgAction(o: any, path: string, method = "POST", confirmMsg?: string) {
    if (confirmMsg && !confirm(confirmMsg)) return;
    setBusy(String(o.id)); setErr("");
    try { await papi(`/api/organizations/${o.id}${path}`, { method }); load(); if (billOrg === String(o.id)) reloadBilling(String(o.id)); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function removeOrg(o: any) {
    const typed = prompt(
      `БЕЗВОЗВРАТНОЕ удаление организации «${o.name}» (${o.domain || o.slug}) вместе со ВСЕМИ её школами и данными. Перед удалением снимается бэкап БД школ.\n\nДля подтверждения введите slug организации:`,
    );
    if (typed == null) return;
    if (typed.trim() !== o.slug) { alert("slug не совпал — удаление отменено"); return; }
    setBusy(String(o.id)); setErr("");
    try { await papi(`/api/organizations/${o.id}?purge=true&confirm=${encodeURIComponent(o.slug)}`, { method: "DELETE" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function saveEdit() {
    if (!editOrg) return;
    setBusy(String(editOrg.id)); setErr("");
    try {
      await papi(`/api/organizations/${editOrg.id}`, { method: "PATCH", body: JSON.stringify({ name: editOrg.name, admin_email: editOrg.admin_email || null, notes: editOrg.notes || null, deployment_mode: editOrg.deployment_mode }) });
      setEditOrg(null); load();
    } catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function openAdmins(o: any) {
    setAdminsOrg(o); setOrgAdmins(null); setCred(null); setNewAdmin({ login: "", password: "", full_name: "", email: "" });
    try { setOrgAdmins((await papi(`/api/organizations/${o.id}/org-admins`)).org_admins || []); } catch (e: any) { setErr(e.message); }
  }
  async function openOrgInfra(o: any) {
    setOrgInfra(o); setOrgInfraData(null);
    try { setOrgInfraData(await papi(`/api/platform/nodes/org-overview/${o.id}`)); } catch (e: any) { toast.showError(e.message); }
  }
  async function openOrgDns(o: any) {
    setOrgDnsFor(o); setOrgDns(null);
    try { setOrgDns(await papi(`/api/organizations/${o.id}/dns`)); } catch (e: any) { toast.showError(e.message); }
  }
  async function reloadAdmins() { if (adminsOrg) setOrgAdmins((await papi(`/api/organizations/${adminsOrg.id}/org-admins`)).org_admins || []); }
  async function addAdmin(e: React.FormEvent) {
    e.preventDefault(); if (!adminsOrg) return; setBusy("adm"); setErr("");
    try { await papi(`/api/organizations/${adminsOrg.id}/org-admins`, { method: "POST", body: JSON.stringify(newAdmin) }); setNewAdmin({ login: "", password: "", full_name: "", email: "" }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function resetAdmin(id: number) {
    if (!adminsOrg) return; setBusy("adm");
    try { const r = await papi(`/api/organizations/${adminsOrg.id}/org-admins/${id}/reset-password`, { method: "POST" }); setCred(r); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function toggleAdmin(a: any) {
    if (!adminsOrg) return; setBusy("adm");
    try { await papi(`/api/organizations/${adminsOrg.id}/org-admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !a.is_active }) }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function delAdmin(id: number, login: string) {
    if (!adminsOrg || !confirm(`Удалить org_admin «${login}»?`)) return; setBusy("adm");
    try { await papi(`/api/organizations/${adminsOrg.id}/org-admins/${id}`, { method: "DELETE" }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  async function openBilling(id: string) {
    setBillOrg(id); setBilling(null); setInvoices([]); setMonths(1); setSection("billing");
    reloadBilling(id);
  }
  async function reloadBilling(id: string) {
    try {
      setBilling(await papi(`/api/organizations/${id}/billing`));
      setInvoices((await papi(`/api/organizations/${id}/billing/invoices`)).invoices || []);
    } catch (e: any) { setErr(e.message); }
  }
  async function changePlan(id: string, plan: string, force = false) {
    setBusy("bill"); setErr("");
    try {
      const r = await papi(`/api/organizations/${id}/billing${force ? "?force=true" : ""}`, { method: "PUT", body: JSON.stringify({ plan }) });
      if (r?.warning) setErr(r.warning);
      await reloadBilling(id); load();
    } catch (e: any) {
      if (e.status === 400 && !force && confirm(`${e.message}\n\nПонизить план ПРИНУДИТЕЛЬНО?`)) {
        setBusy(null);
        return changePlan(id, plan, true);
      }
      setErr(e.message);
    } finally { setBusy(null); }
  }
  async function charge(id: string) {
    setBusy("bill"); setErr("");
    try { await papi(`/api/organizations/${id}/billing/charge`, { method: "POST", body: JSON.stringify({ months }) }); await reloadBilling(id); load(); }
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
    try { await papi("/api/releases", { method: "POST", body: JSON.stringify({ version_tag: rel.version_tag, image: rel.image || null, changelog: rel.changelog || null, source_commit: relLinks?.source_commit || null }) }); setRel({ version_tag: "", image: "", changelog: "" }); setRelLinks(null); load(); }
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
  async function drainNode(id: number) { if (!confirm("Перевести ноду в draining? Новые школы не будут на неё назначаться.")) return; try { await papi(`/api/platform/nodes/${id}/drain`, { method: "POST" }); loadInfra(); toast.showInfo("Нода переведена в draining"); } catch (e: any) { toast.showError(e.message); } }
  async function deleteNode(id: number, name: string) { if (!confirm(`Удалить ноду «${name}»? Это нельзя отменить.`)) return; try { await papi(`/api/platform/nodes/${id}`, { method: "DELETE" }); loadInfra(); toast.showInfo(`Нода «${name}» удалена`); } catch (e: any) { toast.showError(e.message); } }
  async function restartNode(id: number, name: string) { if (!confirm(`Перезагрузить стек ноды «${name}»? Контейнеры школ перезапустятся (сервер не трогаем).`)) return; try { const r = await papi(`/api/platform/nodes/${id}/restart`, { method: "POST" }); toast.showSuccess(`Нода «${name}»: ${r.message || "перезагружена"}`); loadInfra(); } catch (e: any) { toast.showError("Перезагрузка не удалась: " + (e.message || "нода недоступна")); } }
  async function toggleNodeEnabled(n: any) { const turnOff = n.enabled !== false; try { await papi(`/api/platform/nodes/${n.id}/${turnOff ? "disable" : "enable"}`, { method: "POST" }); toast.showInfo(`Нода «${n.name}» ${turnOff ? "выключена" : "включена"}`); loadInfra(); } catch (e: any) { toast.showError(e.message); } }
  async function bulkNodeAction(action: string, scope: string, orgId?: number) {
    setBulkOpen(false);
    const labels: Record<string, string> = { enable: "Включить", disable: "Выключить", restart: "Перезагрузить" };
    const scopes: Record<string, string> = { all: "все ноды", pool: "ноды общего пула", org: "ноды организации" };
    if (!confirm(`${labels[action]} — ${scopes[scope]}?`)) return;
    try {
      const r = await papi("/api/platform/nodes/bulk", { method: "POST", body: JSON.stringify({ action, scope, org_id: orgId ?? null }) });
      toast.showSuccess(`${labels[action]}: успешно ${r.succeeded}/${r.total}`);
      loadInfra();
    } catch (e: any) { toast.showError("Массовая операция не удалась: " + (e.message || "")); }
  }
  async function getBootstrap(id: number, name: string) {
    try {
      toast.showInfo(`Генерирую скрипт для ${name}...`);
      const s = await papi(`/api/platform/nodes/${id}/bootstrap-script`, { method: "POST" });
      const blob = new Blob([s.content], { type: "application/x-sh" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = url;
      a.download = s.filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); window.URL.revokeObjectURL(url); }, 200);
      toast.showSuccess(`Скрипт ${s.filename} скачан. Запустите на сервере: bash ${s.filename}`);
    } catch (e: any) { toast.showError("Ошибка скачивания: " + (e.message || "неизвестная")); }
  }
  async function getRecommendation() { try { setCapacityRec(await papi(`/api/platform/capacity/recommendation?school_count=${capacityCount}`)); setShowCapacity(true); } catch (e: any) { toast.showError(e.message); } }

  async function loadOta() {
    try {
      const cfg = await papi("/api/platform/ota-config");
      setOta(cfg);
      setOtaForm({
        image_registry: cfg.image_registry || "ghcr.io",
        image_repository: cfg.image_repository || "",
        registry_username: cfg.registry_username || "",
        private: !!cfg.private,
        source_repo: cfg.source_repo || "",
        tenant_path: cfg.tenant_path || "perum-tenant",
      });
    } catch (e: any) { /* non-fatal */ }
  }
  async function fetchLatestVersion() {
    setOtaBusy(true); setErr("");
    try {
      const v = await papi("/api/platform/ota-config/fetch-latest", { method: "POST" });
      // Дедуп: уже актуальная версия — не предлагаем публиковать дубликат.
      if (v.up_to_date) {
        toast.showInfo(`Уже актуальная версия (${v.current_version || v.version_tag}) — публиковать нечего. Бампните perum-tenant/VERSION для нового релиза.`);
        return;
      }
      setRel({ version_tag: v.version_tag, image: v.image, changelog: v.changelog || "" });
      setRelLinks({ commit_url: v.commit_url, tree_url: v.tree_url, source_commit: v.source_commit });
      if (v.version_warning) toast.showWarning(v.version_warning);
      toast.showSuccess(`Подтянута версия ${v.version_tag}`);
    } catch (e: any) { toast.showError("Не удалось подтянуть: " + (e.message || "проверьте source_repo/токен")); } finally { setOtaBusy(false); }
  }
  async function saveOta(e: React.FormEvent) {
    e.preventDefault(); setOtaBusy(true); setErr("");
    try {
      const body: any = { ...otaForm };
      if (otaToken) body.registry_token = otaToken;
      const cfg = await papi("/api/platform/ota-config", { method: "PUT", body: JSON.stringify(body) });
      setOta(cfg); setOtaToken("");
      toast.showSuccess("Источник обновлений сохранён");
    } catch (e: any) { toast.showError(e.message || "Ошибка сохранения"); } finally { setOtaBusy(false); }
  }
  async function clearOtaToken() {
    if (!confirm("Удалить сохранённый токен реестра?")) return;
    setOtaBusy(true);
    try { const cfg = await papi("/api/platform/ota-config", { method: "PUT", body: JSON.stringify({ clear_token: true }) }); setOta(cfg); toast.showInfo("Токен удалён"); }
    catch (e: any) { toast.showError(e.message); } finally { setOtaBusy(false); }
  }

  function go(id: string) { setSection(id); if (id === "leads" && leads === null) loadLeads(); if (id === "infrastructure" && nodes === null) loadInfra(); if (id === "releases" && ota === null) loadOta(); }

  const nav: NavItem[] = [
    { id: "dashboard", label: "Дашборд", icon: <Icon.Dashboard /> },
    { id: "orgs", label: "Организации", icon: <Icon.Org /> },
    { id: "infrastructure", label: "Инфраструктура", icon: <Icon.Server /> },
    { id: "billing", label: "Биллинг", icon: <Icon.Billing /> },
    { id: "releases", label: "Релизы", icon: <Icon.Release /> },
    { id: "news", label: "Новости", icon: <Icon.News /> },
    { id: "support", label: "Поддержка", icon: <Icon.Support />, badge: supportBadge || undefined },
    { id: "leads", label: "Заявки", icon: <Icon.Mail />, badge: leads ? leads.filter((l) => l.status === "new").length : undefined },
  ];
  const titles: Record<string, string> = { dashboard: "Дашборд платформы", orgs: "Организации", infrastructure: "Инфраструктура (ноды)", billing: "Биллинг", releases: "Релизы (обновления)", news: "Новости", support: "Поддержка", leads: "Заявки с лендинга" };

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
              <b>Организация создана: {created.organization.domain || created.organization.slug}</b>
              <p className={c.muted}>Лендинг: <span className={statusBadge(created.organization.landing_status || "pending")}>{created.organization.landing_status || "pending"}</span></p>
              {created.org_admin ? <p>Организатор: <code className={styles.code}>{created.org_admin.login}</code> · временный пароль: <code className={styles.code}>{created.org_admin.temporary_password}</code></p>
                : <p className={c.muted}>org_admin не создан (не указан email).</p>}
            </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Создать организацию</h2>
            <p className={c.muted} style={{ marginTop: 0 }}>Организация идентифицируется доменом (он же её лендинг). Заранее укажите на ноду A-записи: <code className={styles.code}>@</code> и <code className={styles.code}>*</code> → IP ноды.</p>
            <form onSubmit={createOrg} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Домен организации</label><input className={styles.input} value={String(form.domain)} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="acme.ru" required /></div>
                <div className={styles.formGroup}><label className={styles.label}>Название</label><input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Acme Education" required /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Нода (лендинг + школы)</label>
                  <select className={styles.input} value={String(form.node_id)} onChange={(e) => setForm({ ...form, node_id: e.target.value })} required>
                    <option value="">— выберите ноду —</option>
                    {nodes?.filter((n) => n.status === "active").map((n) => <option key={n.id} value={n.id}>{n.name} ({n.hostname})</option>)}
                  </select>
                </div>
                <div className={styles.formGroup}><label className={styles.label}>Email организатора</label><input className={styles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="admin@acme.ru" /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>План</label><select className={styles.input} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
              </div>
              <div className={styles.formActions}><button className={styles.submitBtn} disabled={creating || !form.node_id}>{creating ? "Создаётся (поднимается лендинг)…" : "Создать организацию"}</button></div>
            </form>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Все организации</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Домен</th><th>Название</th><th>Лендинг</th><th>План</th><th>Статус</th><th>Создана</th><th>Действия</th></tr></thead>
                <tbody>
                  {orgs?.map((o) => (
                    <tr key={o.id}>
                      <td><b>{o.domain || o.slug}</b><br /><span className={c.muted} style={{ fontSize: "0.75rem" }}>{o.slug}</span></td>
                      <td>{o.name}</td>
                      <td><span className={statusBadge(o.landing_status || "pending")}>{o.landing_status || "pending"}</span></td>
                      <td>{o.plan}</td>
                      <td><span className={statusBadge(o.status)}>{o.status}</span></td>
                      <td>{new Date(o.created_at).toLocaleDateString()}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className={styles.actionBtn} onClick={() => setEditOrg({ ...o })}>Изм.</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openAdmins(o)}>Орг-админы</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openOrgInfra(o)}>Инфраструктура</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openOrgDns(o)}>DNS</button>{" "}
                        <button className={styles.actionBtn} onClick={() => openBilling(String(o.id))}>Биллинг</button>{" "}
                        <button className={styles.actionBtn} disabled={busy === String(o.id) || !["active", "suspended"].includes(o.status)} onClick={() => orgAction(o, o.status === "suspended" ? "/unsuspend" : "/suspend", "POST", o.status === "suspended" ? undefined : `Заморозить «${o.name}»? Школы будут остановлены.`)}>{o.status === "suspended" ? "Разморозить" : "Заморозить"}</button>{" "}
                        <button className={`${styles.actionBtn} ${styles.danger}`} disabled={busy === String(o.id) || o.status === "provisioning"} onClick={() => removeOrg(o)}>Удал.</button>
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
        <div className={infra.wrap}>
          <div className={infra.toolbar}>
            <h2 className={infra.title}>Ноды <span className={infra.titleCount}>{nodes ? nodes.length : 0}</span></h2>
            <span className={infra.spacer} />
            <div className={infra.capacityInline}>
              <span>Школ:</span>
              <input className={infra.capacityInput} type="number" min={1} max={1000} value={capacityCount} onChange={(e) => setCapacityCount(Number(e.target.value) || 10)} />
              <button className={infra.ghostBtn} type="button" onClick={getRecommendation}>Рекомендация</button>
            </div>
            <button className={infra.ghostBtn} type="button" onClick={() => setShowFaq(true)}>FAQ</button>
            <div style={{ position: "relative" }}>
              <button className={infra.ghostBtn} type="button" onClick={() => setBulkOpen((v) => !v)}>Действия ▾</button>
              {bulkOpen && (
                <>
                  <div onClick={() => setBulkOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50, minWidth: 270, background: "#0f1217", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: 6, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
                    {[
                      { a: "restart", l: "Перезагрузить" },
                      { a: "disable", l: "Выключить" },
                      { a: "enable", l: "Включить" },
                    ].map((act) => (
                      <div key={act.a} style={{ padding: "4px 0" }}>
                        <div style={{ fontSize: "0.7rem", color: "#6e7681", textTransform: "uppercase", letterSpacing: "0.04em", padding: "2px 10px" }}>{act.l}</div>
                        <button style={menuItemStyle} onClick={() => bulkNodeAction(act.a, "all")}>· все ноды</button>
                        <button style={menuItemStyle} onClick={() => bulkNodeAction(act.a, "pool")}>· общий пул (без орг)</button>
                        <BulkOrgSubmenu orgs={orgs} onPick={(oid) => bulkNodeAction(act.a, "org", oid)} />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
            <button className={infra.addBtn} type="button" onClick={() => setShowWizard(true)}>+ Создать ноду</button>
          </div>

          <div className={infra.list}>
            {nodes?.map((n) => (
              <NodeRow
                key={n.id}
                node={n}
                util={nodeUtil[n.id]}
                onInstall={() => getBootstrap(n.id, n.name)}
                onDrain={() => drainNode(n.id)}
                onDelete={() => deleteNode(n.id, n.name)}
                onEdit={() => setEditNode(n)}
                onRestart={() => restartNode(n.id, n.name)}
                onToggleEnabled={() => toggleNodeEnabled(n)}
                onViewSchools={() => setSchoolsNode(n)}
              />
            ))}
            {nodes && nodes.length === 0 && <p className={infra.empty}>Нод нет. Нажмите «+ Создать ноду», чтобы развернуть первый сервер.</p>}
            {nodes === null && <p className={infra.loadHint} onClick={() => loadInfra()}>Нажмите для загрузки списка нод…</p>}
          </div>

          {showWizard && (
            <CreateNodeWizard
              orgs={orgs}
              onClose={() => setShowWizard(false)}
              onCreated={() => loadInfra()}
            />
          )}

          {editNode && (
            <EditNodeModal
              node={editNode}
              onClose={() => setEditNode(null)}
              onSaved={() => loadInfra()}
            />
          )}

          {schoolsNode && (
            <NodeSchoolsModal node={schoolsNode} onClose={() => setSchoolsNode(null)} />
          )}

          {showFaq && (
            <Modal title="FAQ — управление серверами (нодами)" onClose={() => setShowFaq(false)} width={700}>
              <p className={c.muted}><b>Нода</b> — физический или виртуальный сервер, на котором крутятся школы. Каждая школа — изолированный Docker-стек (контейнер + БД). Система сама распределяет школы по наиболее свободным включённым нодам.</p>
              <p className={c.muted} style={{marginTop:12}}><b>Как добавить новую ноду:</b></p>
              <ol className={c.muted} style={{paddingLeft:20}}>
                <li>Нажмите «+ Создать ноду» — укажите имя, страну, организацию, домен/IP и Node Port. Железо (CPU/RAM/диск) вводить не нужно — воркер определит его сам и пришлёт ядру.</li>
                <li>Нажмите «Скачать скрипт установки» — это <code className={styles.code}>.sh</code> с вшитым токеном подключения (вводить ничего вручную не надо).</li>
                <li>На целевом сервере выполните под root: <code className={styles.code}>bash perum-node-*.sh</code>. Скрипт сам поставит Docker, поднимет воркера ноды (<code className={styles.code}>ROLE=org_agent</code>) и выполнит enroll-подключение к ядру.</li>
                <li>Через 1-2 минуты нода подключится, ядро снимет с неё реальное железо и статус сам сменится на <span className={statusBadge("active")}>active</span>.</li>
              </ol>
              <p className={c.muted} style={{marginTop:12}}><b>Статусы нод (ставятся автоматически — вручную не задаются):</b></p>
              <ul className={c.muted} style={{paddingLeft:20}}>
                <li><span className={statusBadge("pending_bootstrap")}>не установлена</span> — нода создана, ждёт запуска скрипта установки на сервере</li>
                <li><span className={statusBadge("active")}>active</span> — воркер на связи (heartbeat), принимает школы</li>
                <li><span className={statusBadge("draining")}>вывод</span> — новые школы не назначаются (нода выводится из эксплуатации)</li>
                <li><span className={c.badgeMuted} style={{padding:"2px 8px", borderRadius:10, fontSize:"0.75rem", border:"1px solid"}}>offline</span> — воркер не отвечает (ядро пингует каждую ~минуту)</li>
              </ul>
              <p className={c.muted} style={{marginTop:12}}><b>Что можно делать со строкой ноды:</b></p>
              <ul className={c.muted} style={{paddingLeft:20}}>
                <li><b>Питание (вкл/выкл).</b> Выключенная нода (<span className={c.badgeMuted} style={{padding:"1px 7px", borderRadius:10, fontSize:"0.72rem", border:"1px solid"}}>выключена</span>) физически работает, но новые школы на неё не назначаются.</li>
                <li><b>Перезагрузка</b> (только для online-нод) — перезапускает Docker-контейнеры школ на ноде; сам сервер не трогается.</li>
                <li><b>Скрипт установки</b> — доступен для не установленных и offline-нод (повторно скачать и запустить).</li>
                <li><b>Редактирование</b> (карандаш) — имя, страна, домен/IP, порт, лимит школ. Статус правкой не меняется.</li>
                <li><b>Школы на ноде</b> (глаз) — какие школы крутятся: поддомен, домены, версия, организация, статус.</li>
              </ul>
              <p className={c.muted} style={{marginTop:12}}><b>Массовые действия</b> (кнопка «Действия ▾») — включить / выключить / перезагрузить сразу: все ноды, только общий пул (без организации) или по конкретной организации.</p>
              <p className={c.muted} style={{marginTop:12}}><b>Подбор сервера (на одну школу ~200MB RAM, ~0.15 CPU).</b> Кнопка «Рекомендация» в тулбаре посчитает, сколько нод нужного размера нужно под N школ. Ориентир по конфигурации (CPU/RAM ГБ/диск ГБ):</p>
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
        </div>
      )}
      {section === "billing" && (
        <>
          <div className={c.toolbar}>
            <select className={styles.input} style={{ maxWidth: 280 }} value={billOrg} onChange={(e) => e.target.value && openBilling(e.target.value)}>
              <option value="">— выберите организацию —</option>
              {orgs?.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.domain || o.slug})</option>)}
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
                      <select className={styles.input} value={billing.plan} disabled={busy === "bill"} onChange={(e) => changePlan(String(billOrg), e.target.value)}>{PLANS.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                    </div>
                    <div className={styles.formGroup}><label className={styles.label}>Оплата (месяцев)</label>
                      <input className={styles.input} type="number" min={1} value={months} disabled={busy === "bill"} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} />
                    </div>
                  </div>
                  <div className={styles.formActions}><button className={styles.submitBtn} disabled={busy === "bill"} onClick={() => charge(String(billOrg))}>Отметить оплату</button></div>
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
          <div className={c.toolbar}>
            <span className={c.spacer} />
            <button className={styles.btnSecondary} onClick={() => setShowOtaConfig((v) => !v)}>{showOtaConfig ? "Скрыть настройки источника" : "⚙ Настройки источника обновлений"}</button>
          </div>
          {showOtaConfig && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Источник обновлений (OTA)</h2>
            <p className={c.muted}>Откуда берутся образы тенанта для обновления школ. Обычно это GHCR-репозиторий, куда CI пушит образ при изменении кода. Если репозиторий/реестр <b>приватный</b> — укажите логин и токен (GitHub PAT с правом <code className={styles.code}>read:packages</code>), чтобы хосты могли тянуть образ.</p>
            <form onSubmit={saveOta} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Реестр</label><input className={styles.input} value={otaForm.image_registry} onChange={(e) => setOtaForm({ ...otaForm, image_registry: e.target.value })} placeholder="ghcr.io" /></div>
                <div className={styles.formGroup}><label className={styles.label}>Репозиторий/образ</label><input className={styles.input} value={otaForm.image_repository} onChange={(e) => setOtaForm({ ...otaForm, image_repository: e.target.value })} placeholder="syb1v/perum-tenant" /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>GitHub-репозиторий <span className={c.muted}>— для автоподтягивания версии</span></label><input className={styles.input} value={otaForm.source_repo} onChange={(e) => setOtaForm({ ...otaForm, source_repo: e.target.value })} placeholder="syb1v/perum" /></div>
                <div className={styles.formGroup}><label className={styles.label}>Папка тенанта</label><input className={styles.input} value={otaForm.tenant_path} onChange={(e) => setOtaForm({ ...otaForm, tenant_path: e.target.value })} placeholder="perum-tenant" /></div>
              </div>
              <div className={styles.formRow} style={{ alignItems: "center" }}>
                <div className={styles.formGroup}>
                  <label className={styles.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={otaForm.private} onChange={(e) => setOtaForm({ ...otaForm, private: e.target.checked })} style={{ width: "auto" }} />
                    Приватный реестр
                  </label>
                </div>
                {otaForm.private && (
                  <div className={styles.formGroup}><label className={styles.label}>Логин реестра</label><input className={styles.input} value={otaForm.registry_username} onChange={(e) => setOtaForm({ ...otaForm, registry_username: e.target.value })} placeholder="github-username" /></div>
                )}
              </div>
              {otaForm.private && (
                <div className={styles.formGroup}>
                  <label className={styles.label}>GitHub-токен (PAT, <code className={styles.code}>read:packages</code>) {ota?.token_set && <span className={c.muted}>— токен сохранён, оставьте пустым чтобы не менять</span>}</label>
                  <input className={styles.input} type="password" value={otaToken} onChange={(e) => setOtaToken(e.target.value)} placeholder={ota?.token_set ? "•••••••• (сохранён)" : "ghp_…"} autoComplete="off" />
                </div>
              )}
              <div className={styles.formActions}>
                <button className={styles.submitBtn} disabled={otaBusy}>{otaBusy ? "…" : "Сохранить источник"}</button>{" "}
                <button type="button" className={styles.btnSecondary} onClick={() => setOtaHelp(true)}>Инструкция</button>{" "}
                {ota?.token_set && <button type="button" className={styles.btnSecondary} disabled={otaBusy} onClick={clearOtaToken}>Удалить токен</button>}
              </div>
            </form>
          </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Опубликовать релиз</h2>
            <p className={c.muted}>Релиз становится доступен организациям — они обновляют свои школы по кнопке (OTA, opt-in, volume-preserving). Обычно релиз тенанта публикует CI автоматически при реальном изменении кода (тег <code className={styles.code}>git-&lt;sha&gt;</code>, образ из GHCR). Ручная публикация ниже — резерв; ядро отклонит релиз, если образ совпадает с текущим (нет реального обновления).</p>
            <form onSubmit={publishRelease} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Версия (тег)</label><input className={styles.input} value={rel.version_tag} onChange={(e) => setRel({ ...rel, version_tag: e.target.value })} placeholder="1.1.0" required /></div>
                <div className={styles.formGroup}><label className={styles.label}>Docker-образ</label><input className={styles.input} value={rel.image} onChange={(e) => setRel({ ...rel, image: e.target.value })} placeholder="ghcr.io/syb1v/perum-tenant:1.1.0" /></div>
              </div>
              <div className={styles.formGroup}><label className={styles.label}>Что нового</label><input className={styles.input} value={rel.changelog} onChange={(e) => setRel({ ...rel, changelog: e.target.value })} placeholder="Описание изменений" /></div>
              {relLinks && (relLinks.commit_url || relLinks.tree_url) && (
                <p className={c.muted} style={{ fontSize: "0.85rem", margin: "0 0 8px" }}>
                  Источник:{" "}
                  {relLinks.commit_url && <a href={relLinks.commit_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>коммит ↗</a>}
                  {relLinks.commit_url && relLinks.tree_url && " · "}
                  {relLinks.tree_url && <a href={relLinks.tree_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)" }}>папка тенанта в репозитории ↗</a>}
                </p>
              )}
              <div className={styles.formActions}>
                <button className={styles.submitBtn} disabled={publishing}>{publishing ? "…" : "Опубликовать (сделать текущим)"}</button>{" "}
                <button type="button" className={styles.btnSecondary} disabled={otaBusy} onClick={fetchLatestVersion} title="Спросить у GitHub последний коммит по папке тенанта и заполнить поля">{otaBusy ? "…" : "⟳ Подтянуть последнюю версию"}</button>
              </div>
            </form>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Релизы</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Версия</th><th>Образ</th><th>Коммит</th><th>Что нового</th><th>Текущий</th><th>Опубликован</th></tr></thead>
                <tbody>{releases?.map((r) => {
                  const repo = ota?.source_repo;
                  const commitUrl = repo && r.source_commit ? `https://github.com/${repo}/commit/${r.source_commit}` : null;
                  const treeUrl = repo && r.source_commit ? `https://github.com/${repo}/tree/${r.source_commit}/${ota?.tenant_path || "perum-tenant"}` : null;
                  return (
                    <tr key={r.id}>
                      <td>{r.version_tag}{treeUrl && <> · <a href={treeUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", fontSize: "0.8rem" }}>код ↗</a></>}</td>
                      <td><code className={styles.code}>{r.image}</code></td>
                      <td>{r.source_commit ? (commitUrl ? <a href={commitUrl} target="_blank" rel="noreferrer"><code className={styles.code}>{String(r.source_commit).slice(0, 12)}</code></a> : <code className={styles.code}>{String(r.source_commit).slice(0, 12)}</code>) : "—"}</td>
                      <td style={{ maxWidth: 360, whiteSpace: "pre-wrap" }}>{r.changelog || "—"}</td>
                      <td>{r.is_current ? <span className={`${styles.statusBadge} ${styles.success}`}>текущий</span> : ""}</td>
                      <td>{new Date(r.published_at).toLocaleString()}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              {releases && releases.length === 0 && <p className={styles.emptyState}>Релизов пока нет.</p>}
            </div>
          </div>
        </>
      )}

      {/* ===================== NEWS ===================== */}
      {section === "news" && <NewsManager orgs={orgs} />}

      {/* ===================== SUPPORT ===================== */}
      {section === "support" && <SupportInbox onChanged={() => { papi("/api/support/admin/badge").then((r) => setSupportBadge(r.count || 0)).catch(() => {}); }} />}

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
      {orgInfra && (
        <Modal title={`Инфраструктура — ${orgInfra.name}`} onClose={() => { setOrgInfra(null); setOrgInfraData(null); }} width={820}>
          {!orgInfraData ? <p className={c.muted}>Загрузка…</p> : (
            <>
              <h3 className={styles.cardTitle} style={{ marginBottom: 6 }}>Ноды организации ({orgInfraData.total_nodes})</h3>
              {orgInfraData.nodes.length === 0 ? (
                <p className={c.muted}>Своих нод нет — школы размещаются на нодах общего пула.</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead><tr><th>Нода</th><th>Адрес/IP</th><th>Статус</th><th>Использование</th></tr></thead>
                    <tbody>{orgInfraData.nodes.map((n: any) => (
                      <tr key={n.id}>
                        <td><b>{n.name}</b>{n.enabled === false && <span className={c.muted}> · выключена</span>}</td>
                        <td><code className={styles.code}>{n.hostname}</code></td>
                        <td><span className={statusBadge(n.status)}>{n.status}</span></td>
                        <td>{n.cpu_cores} CPU · {n.ram_gb} ГБ · до {n.max_schools} школ</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}

              <h3 className={styles.cardTitle} style={{ margin: "16px 0 6px" }}>Школы на нодах ({orgInfraData.total_schools})</h3>
              {orgInfraData.schools.length === 0 ? (
                <p className={styles.emptyState}>У организации пока нет школ.</p>
              ) : (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead><tr><th>Школа</th><th>Поддомен</th><th>Версия</th><th>Статус</th><th>Нода</th></tr></thead>
                    <tbody>{orgInfraData.schools.map((s: any) => (
                      <tr key={s.school_id}>
                        <td><b>{s.school_name}</b><br /><span className={c.muted}>{s.school_slug}</span></td>
                        <td><code className={styles.code}>{s.subdomain}</code></td>
                        <td><code className={styles.code}>{s.version || "—"}</code></td>
                        <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                        <td>{s.node_name ? <span><code className={styles.code}>{s.node_name}</code>{s.node_pool && <span className={c.muted} style={{ fontSize: "0.72rem" }}> (пул)</span>}<br /><span className={c.muted} style={{ fontSize: "0.72rem" }}>{s.node_ip}</span></span> : <span className={c.muted}>не назначена</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </Modal>
      )}
      {otaHelp && (
        <Modal title="Как настроить источник обновлений" onClose={() => setOtaHelp(false)} width={680}>
          <p className={c.muted} style={{ marginTop: 0 }}><b>Как это работает:</b> CI (<code className={styles.code}>release.yml</code>) при изменении кода в папке тенанта сам собирает образ, пушит в GHCR и регистрирует релиз в ядре. Организации видят обновление и ставят его по кнопке у школы. Здесь вы задаёте, ОТКУДА брать образ и версию.</p>
          <ol className={c.muted} style={{ paddingLeft: 20, lineHeight: 1.7 }}>
            <li><b>Реестр и образ.</b> Обычно <code className={styles.code}>ghcr.io</code> и <code className={styles.code}>owner/perum-tenant</code> — куда CI пушит образ тенанта.</li>
            <li><b>GitHub-репозиторий + папка тенанта.</b> Нужны для кнопки «⟳ Подтянуть последнюю версию» — ядро спросит у GitHub последний коммит, затронувший эту папку, и заполнит поля релиза + даст ссылки на коммит и код.</li>
            <li><b>Приватный реестр.</b> Если образ/репо приватные — отметьте «Приватный», создайте в GitHub токен (PAT) с правом <code className={styles.code}>read:packages</code> (а для приватного репо ещё <code className={styles.code}>repo</code>), впишите логин и токен. Токен хранится в ядре <b>зашифрованным</b> и наружу не отдаётся.</li>
            <li><b>На хостах школ</b> для приватного образа выполните <code className={styles.code}>docker login ghcr.io -u &lt;логин&gt; -p &lt;токен&gt;</code>, чтобы стек школы мог тянуть образ при обновлении.</li>
          </ol>
        </Modal>
      )}
      {editOrg && (
        <Modal title={`Редактирование — ${editOrg.domain || editOrg.name}`} onClose={() => setEditOrg(null)} footer={<><button className={styles.cancelBtn} onClick={() => setEditOrg(null)}>Отмена</button><button className={styles.submitBtn} disabled={busy === String(editOrg.id)} onClick={saveEdit}>Сохранить</button></>}>
          <div className={styles.formGroup}><label className={styles.label}>Название</label><input className={styles.input} value={editOrg.name || ""} onChange={(e) => setEditOrg({ ...editOrg, name: e.target.value })} /></div>
          <div className={styles.formGroup}><label className={styles.label}>Email организатора</label><input className={styles.input} value={editOrg.admin_email || ""} onChange={(e) => setEditOrg({ ...editOrg, admin_email: e.target.value })} /></div>
          <div className={styles.formGroup}><label className={styles.label}>Режим</label><select className={styles.input} value={editOrg.deployment_mode || "shared_host"} onChange={(e) => setEditOrg({ ...editOrg, deployment_mode: e.target.value })}><option value="shared_host">shared_host</option><option value="dedicated_vm">dedicated_vm</option></select></div>
          <div className={styles.formGroup}><label className={styles.label}>Заметки</label><textarea className={styles.input} rows={3} value={editOrg.notes || ""} onChange={(e) => setEditOrg({ ...editOrg, notes: e.target.value })} /></div>
        </Modal>
      )}

      {adminsOrg && (
        <Modal title={`Организаторы — ${adminsOrg.name} (${adminsOrg.domain || adminsOrg.slug})`} onClose={() => setAdminsOrg(null)} width={680}>
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

      {/* DNS GUIDE MODAL */}
      {orgDnsFor && (
        <Modal title={`DNS — ${orgDnsFor.domain || orgDnsFor.name}`} onClose={() => { setOrgDnsFor(null); setOrgDns(null); }} width={720}>
          {!orgDns ? <p className={c.muted}>Загрузка…</p> : (
            <>
              <p className={c.muted} style={{ marginTop: 0 }}>
                Укажите у регистратора домена <b>{orgDns.domain}</b> следующие записи на ноду{orgDns.node_name ? <> <b>{orgDns.node_name}</b></> : null}. TLS-сертификат выпустится автоматически после распространения DNS (5–60 мин).
              </p>
              {orgDns.dns_target ? (
                <div className={styles.tableContainer}>
                  <table className={styles.table}>
                    <thead><tr><th>Тип</th><th>Имя (host)</th><th>Значение</th><th>Назначение</th></tr></thead>
                    <tbody>
                      {orgDns.records?.map((r: any, i: number) => (
                        <tr key={i}>
                          <td><code className={styles.code}>{r.type}</code></td>
                          <td><code className={styles.code}>{r.name}</code></td>
                          <td><code className={styles.code}>{r.value}</code></td>
                          <td className={c.muted}>{r.purpose}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className={c.muted}>Нода не назначена — DNS-цель неизвестна.</p>}
              <p className={c.muted} style={{ fontSize: "0.82rem", marginTop: 10, marginBottom: 0 }}>
                {orgDns.record_type === "A"
                  ? <>IP ноды: <code className={styles.code}>{orgDns.dns_target}</code> — используйте записи типа <b>A</b>.</>
                  : <>Адрес ноды: <code className={styles.code}>{orgDns.dns_target}</code> — используйте <b>CNAME</b> (для корня <code className={styles.code}>@</code> у некоторых регистраторов нужен ALIAS/ANAME).</>}
              </p>
            </>
          )}
        </Modal>
      )}
    </ConsoleShell>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block", width: "100%", textAlign: "left", padding: "5px 10px",
  fontSize: "0.82rem", color: "#c9d1d9", background: "transparent", border: "none",
  borderRadius: 6, cursor: "pointer",
};

// Подменю «по организации» для массовых действий над нодами.
function BulkOrgSubmenu({ orgs, onPick }: { orgs: any[] | null; onPick: (orgId: number) => void }) {
  const [open, setOpen] = useState(false);
  if (!orgs || orgs.length === 0) return null;
  return (
    <div>
      <button style={menuItemStyle} onClick={() => setOpen((v) => !v)}>· по организации {open ? "▴" : "▾"}</button>
      {open && (
        <div style={{ maxHeight: 180, overflowY: "auto", margin: "0 0 0 8px", borderLeft: "1px solid rgba(255,255,255,0.08)" }}>
          {orgs.map((o) => (
            <button key={o.id} style={{ ...menuItemStyle, fontSize: "0.78rem" }} onClick={() => onPick(o.id)}>{o.name}</button>
          ))}
        </div>
      )}
    </div>
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
