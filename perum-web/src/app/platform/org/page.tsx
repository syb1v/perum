"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import ConsoleShell, { Icon, NavItem } from "@/components/platform/ConsoleShell";
import Modal from "@/components/platform/Modal";
import styles from "@/app/admin/page.module.css";
import c from "@/components/platform/console.module.css";

function statusBadge(s: string): string {
  const map: Record<string, string> = {
    active: styles.success, failed: styles.error,
    suspended: c.badgeWarn, provisioning: c.badgeWarn, updating: c.badgeWarn, archived: c.badgeMuted,
  };
  return `${styles.statusBadge} ${map[s] || c.badgeMuted}`;
}

export default function OrgConsole() {
  const router = useRouter();
  const [section, setSection] = useState("dashboard");
  const [err, setErr] = useState("");
  const [schools, setSchools] = useState<any[] | null>(null);
  const [statuses, setStatuses] = useState<Record<number, any>>({});
  const [stats, setStats] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  // Орг приостановлена за неоплату: управление заблокировано (403), но биллинг
  // read-only доступен через /api/org/billing — показываем «оплатите» экран.
  const [suspended, setSuspended] = useState(false);
  const [selfBilling, setSelfBilling] = useState<any>(null);

  // create school
  const [form, setForm] = useState({ slug: "", name: "", email: "" });
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  // admins modal
  const [adminsFor, setAdminsFor] = useState<any>(null);
  const [admins, setAdmins] = useState<any[] | null>(null);
  const [newAdmin, setNewAdmin] = useState({ email: "", name: "" });
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminCred, setAdminCred] = useState<any>(null);

  // domains modal
  const [domainsFor, setDomainsFor] = useState<any>(null);
  const [domains, setDomains] = useState<any[] | null>(null);
  const [newDomain, setNewDomain] = useState("");

  // infrastructure
  const [orgNodes, setOrgNodes] = useState<any[] | null>(null);
  const [orgNodeUtil, setOrgNodeUtil] = useState<Record<number, any>>({});
  const [availUpdates, setAvailUpdates] = useState<any>(null);

  async function load() {
    try {
      const r = await papi("/api/schools");
      const list = r.schools || [];
      setSchools(list);
      const entries = await Promise.all(list.map(async (s: any) => {
        try { return [s.id, await papi(`/api/schools/${s.id}/update-status`)] as const; } catch { return [s.id, null] as const; }
      }));
      setStatuses(Object.fromEntries(entries));
      try { setStats(await papi("/api/schools/stats/overview")); } catch { /* non-fatal */ }
      try { setBilling(await papi("/api/schools/billing")); } catch { /* non-fatal */ }
    } catch (e: any) {
      if (e.status === 401) { router.push("/platform/login"); return; }
      if (e.status === 403) {
        // Орг приостановлена: управление недоступно, но счёт показать можно.
        setSuspended(true);
        try { setSelfBilling(await papi("/api/org/billing")); } catch { /* non-fatal */ }
        return;
      }
      setErr(e.message);
    }
  }

  async function loadOrgInfra() {
    try {
      const nodesR = await papi("/api/org/nodes");
      setOrgNodes(nodesR.nodes || []);
      const utils: Record<number, any> = {};
      for (const n of nodesR.nodes || []) {
        try { utils[n.id] = await papi(`/api/org/nodes/${n.id}/utilization`); } catch { /* skip */ }
      }
      setOrgNodeUtil(utils);
    } catch { /* non-fatal */ }
    try {
      setAvailUpdates(await papi("/api/schools/releases/available"));
    } catch { /* non-fatal */ }
  }

  useEffect(() => {
    if (!getPlatformToken()) { router.push("/platform/login"); return; }
    if (getTokenPayload()?.role !== "org_admin") { router.push("/platform"); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (section === "infrastructure" && orgNodes === null) loadOrgInfra();
  }, [section, orgNodes]);

  // Поллинг статуса (#1): провижининг/обновление идут в фоне — пока есть школы в
  // переходном статусе, обновляем список каждые 4с, чтобы статус «доехал» до active.
  const hasTransitional = (schools || []).some((s) => ["provisioning", "updating"].includes(s.status));
  useEffect(() => {
    if (!hasTransitional) return;
    const t = setInterval(() => { load(); }, 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTransitional]);

  const delinquent = billing?.subscription?.delinquent;

  async function createSchool(e: React.FormEvent) {
    e.preventDefault(); setErr(""); setCreated(null); setCreating(true);
    try { const r = await papi("/api/schools", { method: "POST", body: JSON.stringify({ slug: form.slug, name: form.name, admin_email: form.email || null }) }); setCreated(r); setForm({ slug: "", name: "", email: "" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setCreating(false); }
  }
  async function updateSchool(id: number) {
    setBusyId(id); setErr("");
    try { await papi(`/api/schools/${id}/update`, { method: "POST" }); load(); }  // 202: статус 'updating' → поллинг
    catch (e: any) { setErr(e.message); } finally { setBusyId(null); }
  }
  async function toggleSuspend(s: any) {
    const action = s.status === "suspended" ? "unsuspend" : "suspend";
    if (action === "suspend" && !confirm(`Заморозить «${s.name}»? Стек остановится, данные сохранятся.`)) return;
    setBusyId(s.id); setErr("");
    try { await papi(`/api/schools/${s.id}/${action}`, { method: "POST" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusyId(null); }
  }
  async function removeSchool(id: number, slug: string) {
    // Необратимое удаление: требуем ввести slug (бэкап БД и вложений снимается).
    const typed = prompt(
      `БЕЗВОЗВРАТНОЕ удаление школы «${slug}»: все данные стека будут стёрты (перед удалением снимается бэкап БД и вложений).\n\nДля подтверждения введите slug школы:`,
    );
    if (typed == null) return;
    if (typed.trim() !== slug) { alert("slug не совпал — удаление отменено"); return; }
    setBusyId(id);
    try { await papi(`/api/schools/${id}?purge=true&confirm=${encodeURIComponent(slug)}`, { method: "DELETE" }); load(); }
    catch (e: any) { setErr(e.message); } finally { setBusyId(null); }
  }

  // --- admins ---
  async function openAdmins(s: any) {
    setAdminsFor(s); setAdmins(null); setAdminCred(null); setNewAdmin({ email: "", name: "" });
    try { setAdmins((await papi(`/api/schools/${s.id}/admins`)).admins || []); } catch (e: any) { setErr(e.message); }
  }
  async function reloadAdmins() { if (adminsFor) try { setAdmins((await papi(`/api/schools/${adminsFor.id}/admins`)).admins || []); } catch (e: any) { setErr(e.message); } }
  async function addAdmin(e: React.FormEvent) {
    e.preventDefault(); if (!adminsFor) return; setAdminBusy(true); setAdminCred(null);
    try { const r = await papi(`/api/schools/${adminsFor.id}/admins`, { method: "POST", body: JSON.stringify({ email: newAdmin.email, full_name: newAdmin.name || null }) }); setAdminCred(r); setNewAdmin({ email: "", name: "" }); reloadAdmins(); }
    catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); }
  }
  async function resetAdmin(uid: number) { if (!adminsFor) return; setAdminBusy(true); try { setAdminCred(await papi(`/api/schools/${adminsFor.id}/admins/${uid}/reset-password`, { method: "POST" })); } catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); } }
  async function toggleAdmin(a: any) { if (!adminsFor) return; setAdminBusy(true); try { await papi(`/api/schools/${adminsFor.id}/admins/${a.id}`, { method: "PATCH", body: JSON.stringify({ is_active: !a.is_active }) }); reloadAdmins(); } catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); } }
  async function removeAdmin(uid: number, login: string) { if (!adminsFor || !confirm(`Удалить администратора «${login}»?`)) return; setAdminBusy(true); try { await papi(`/api/schools/${adminsFor.id}/admins/${uid}`, { method: "DELETE" }); reloadAdmins(); } catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); } }

  // --- domains ---
  async function openDomains(s: any) { setDomainsFor(s); setDomains(null); setNewDomain(""); try { setDomains((await papi(`/api/schools/${s.id}/domains`)).domains || []); } catch (e: any) { setErr(e.message); } }
  async function addDomain(e: React.FormEvent) { e.preventDefault(); if (!domainsFor) return; setAdminBusy(true); try { await papi(`/api/schools/${domainsFor.id}/domains`, { method: "POST", body: JSON.stringify({ domain: newDomain }) }); setNewDomain(""); setDomains((await papi(`/api/schools/${domainsFor.id}/domains`)).domains || []); } catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); } }
  async function delDomain(did: number) { if (!domainsFor) return; setAdminBusy(true); try { await papi(`/api/schools/${domainsFor.id}/domains/${did}`, { method: "DELETE" }); setDomains((await papi(`/api/schools/${domainsFor.id}/domains`)).domains || []); } catch (e: any) { setErr(e.message); } finally { setAdminBusy(false); } }

  const statById: Record<number, any> = Object.fromEntries((stats?.schools || []).map((s: any) => [s.id, s]));

  const nav: NavItem[] = [
    { id: "dashboard", label: "Дашборд", icon: <Icon.Dashboard /> },
    { id: "schools", label: "Школы", icon: <Icon.School /> },
    { id: "infrastructure", label: "Инфраструктура", icon: <Icon.Server /> },
    { id: "billing", label: "Биллинг", icon: <Icon.Billing /> },
  ];
  const titles: Record<string, string> = { dashboard: "Дашборд организации", schools: "Школы организации", infrastructure: "Моя инфраструктура", billing: "Биллинг" };

  return (
    <ConsoleShell
      nav={nav} active={section} onChange={setSection} title={titles[section]}
      subtitle="Кабинет организатора — управление своими школами"
      userLabel={getTokenPayload()?.login || "org"}
      onLogout={() => { clearPlatformToken(); router.push("/platform/login"); }}
    >
      {err && <p className={styles.errorBanner}>{err}</p>}
      {delinquent && !suspended && <p className={styles.errorBanner}>Подписка просрочена — создание и изменение школ заблокировано. Обратитесь в поддержку платформы для оплаты.</p>}

      {/* SUSPENDED: орг приостановлена за неоплату — только просмотр счёта */}
      {suspended && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Организация приостановлена</h2>
          <p className={styles.errorBanner} style={{ marginTop: 0 }}>
            Доступ к управлению школами заблокирован из-за неоплаты. Школы остановлены, данные сохранены.
          </p>
          {selfBilling ? (
            <>
              <div className={c.kpiGrid}>
                <Kpi v={selfBilling.plan} l={`План (${selfBilling.price_rub_month} ₽/мес)`} />
                <Kpi v={`${selfBilling.outstanding_rub} ₽`} l="К оплате" />
                <Kpi v={selfBilling.subscription?.status} l="Подписка" />
                <Kpi v={`${selfBilling.schools_used} / ${selfBilling.school_limit}`} l="Школ" />
              </div>
              <p className={c.muted} style={{ marginTop: 12 }}>
                Чтобы возобновить работу — оплатите подписку через администрацию платформы. После оплаты школы поднимутся автоматически.
              </p>
            </>
          ) : <p className={c.muted}>Загрузка счёта…</p>}
        </div>
      )}

      {!suspended && (<>

      {/* DASHBOARD */}
      {section === "dashboard" && (
        <>
          {stats ? (
            <div className={c.kpiGrid}>
              <Kpi v={`${stats.schools_online} / ${stats.schools_total}`} l="Школ онлайн" online={stats.schools_online > 0} />
              <Kpi v={stats.students} l="Учеников" />
              <Kpi v={stats.teachers} l="Учителей" />
              <Kpi v={stats.parents} l="Родителей" />
              <Kpi v={stats.users_total} l="Всего пользователей" />
              <Kpi v={stats.grades_total} l="Оценок" />
              <Kpi v={stats.active_24h} l="Активны за 24ч" />
            </div>
          ) : <p className={c.muted}>Загрузка статистики…</p>}
          {billing && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Подписка</h2>
              <p className={c.muted}>План <b style={{ color: "var(--text-primary)" }}>{billing.plan}</b> · школы <b style={{ color: "var(--text-primary)" }}>{billing.schools_used} / {billing.school_limit}</b> · подписка <b style={{ color: "var(--text-primary)" }}>{billing.subscription?.status}</b>{billing.subscription?.days_left != null && <> · осталось дней <b style={{ color: "var(--text-primary)" }}>{billing.subscription.days_left}</b></>}</p>
            </div>
          )}
          {stats && (
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>По школам</h2>
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead><tr><th>Школа</th><th>Онлайн</th><th>Ученики</th><th>Учителя</th><th>Ср. балл</th><th>Активны 24ч</th></tr></thead>
                  <tbody>{stats.schools?.map((s: any) => (<tr key={s.id}><td><b>{s.name}</b><br /><span className={c.muted}>{s.slug}</span></td><td><span className={s.online ? c.dotOnline : c.dotOffline}>●</span></td><td>{s.students}</td><td>{s.teachers}</td><td>{s.avg_grade ?? "—"}</td><td>{s.active_24h}</td></tr>))}</tbody>
                </table>
                {stats.schools?.length === 0 && <p className={styles.emptyState}>Нет школ.</p>}
              </div>
            </div>
          )}
        </>
      )}

      {/* SCHOOLS */}
      {section === "schools" && (() => {
        // Все школы обновляются на один текущий релиз → ченджлог общий. Берём его
        // из первой школы, где доступно обновление, и показываем баннером.
        const upd = (schools || []).find((s) => statuses[s.id]?.update_available && s.status === "active");
        const updInfo = upd ? statuses[upd.id] : null;
        const updCount = (schools || []).filter((s) => statuses[s.id]?.update_available && s.status === "active").length;
        return (
        <>
          <p className={c.muted} style={{ marginBottom: 14 }}>Вы управляете школами и их администраторами. Каждая школа — изолированный стек (свой контейнер и база). Внутреннюю работу школы (журнал, оценки) ведёт администратор школы.</p>
          {updInfo && (
            <div className={`${styles.card}`} style={{ borderColor: "var(--accent-primary)" }}>
              <h2 className={styles.cardTitle}>Доступно обновление → {updInfo.latest_version || "новая версия"}</h2>
              <p className={c.muted}>Готово к установке для {updCount} школ(ы). Обновление volume-preserving (данные сохраняются), при сбое — авто-откат. Жмите «Обновить» у нужной школы.</p>
              {updInfo.changelog && (
                <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: "0.85rem", color: "var(--text-secondary)" }}>{updInfo.changelog}</pre>
              )}
            </div>
          )}
          {created && (
            <div className={`${styles.card} ${c.okCard}`}>
              <b>Школа «{created.school?.slug}» создаётся…</b>
              <p className={c.muted}>{created.message || "Идёт провижининг стека (поднимается контейнер, БД, миграции). Статус обновится автоматически."} После активации откройте «Админы» и задайте пароль администратора кнопкой «Сбросить пароль».</p>
            </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Создать школу</h2>
            <form onSubmit={createSchool} className={styles.form}>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.label}>Slug (поддомен)</label><input className={styles.input} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="gimnazia5" required /></div>
                <div className={styles.formGroup}><label className={styles.label}>Название</label><input className={styles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Гимназия №5" required /></div>
              </div>
              <div className={styles.formGroup}><label className={styles.label}>Email администратора школы</label><input className={styles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="director@gimnazia5.ru" /></div>
              <div className={styles.formActions}><button className={styles.submitBtn} disabled={creating || delinquent}>{creating ? "Создаётся (поднимается стек)…" : "Создать школу"}</button></div>
            </form>
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Школы</h2>
            <div className={styles.tableContainer}>
              <table className={styles.table}>
                <thead><tr><th>Школа</th><th>Статус</th><th>Ученики</th><th>Онлайн</th><th>Версия</th><th>Действия</th></tr></thead>
                <tbody>
                  {schools?.map((s) => {
                    const st = statuses[s.id];
                    const canUpdate = st?.update_available && s.status === "active";
                    return (
                      <tr key={s.id}>
                        <td><b>{s.name}</b><br /><span className={c.muted}>{s.slug}</span></td>
                        <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                        <td>{statById[s.id]?.students ?? "—"}</td>
                        <td><span className={statById[s.id]?.online ? c.dotOnline : c.dotOffline}>●</span></td>
                        <td><code className={styles.code}>{s.release_tag || "—"}</code></td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <button className={styles.actionBtn} disabled={busyId === s.id} onClick={() => openAdmins(s)}>Админы</button>{" "}
                          <button className={styles.actionBtn} disabled={busyId === s.id} onClick={() => openDomains(s)}>Домены</button>{" "}
                          {canUpdate && <><button className={styles.actionBtn} disabled={busyId === s.id || delinquent} title={st?.changelog || ""} onClick={() => updateSchool(s.id)}>{busyId === s.id ? "…" : `Обновить → ${st.latest_version}`}</button>{" "}</>}
                          <button className={styles.actionBtn} disabled={busyId === s.id || !["active", "suspended"].includes(s.status)} onClick={() => toggleSuspend(s)}>{s.status === "suspended" ? "Разморозить" : "Заморозить"}</button>{" "}
                          <button className={`${styles.actionBtn} ${styles.danger}`} disabled={busyId === s.id} onClick={() => removeSchool(s.id, s.slug)}>Удал.</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {schools && schools.length === 0 && <p className={styles.emptyState}>Пока нет школ — создайте первую.</p>}
            </div>
          </div>
        </>
        );
      })()}

      {/* BILLING */}
      {section === "billing" && (
        billing ? (
          <>
            <div className={c.kpiGrid}>
              <Kpi v={billing.plan} l={`План (${billing.price_rub_month} ₽/мес)`} />
              <Kpi v={`${billing.schools_used} / ${billing.school_limit}`} l="Школ (исп./лимит)" />
              <Kpi v={billing.subscription?.status} l="Подписка" />
              <Kpi v={billing.subscription?.days_left ?? "—"} l="Дней до конца" />
            </div>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Подписка</h2>
              <p className={c.muted}>Тариф и оплата управляются на стороне платформы. {billing.subscription?.paid_until ? <>Оплачено до: <b style={{ color: "var(--text-primary)" }}>{new Date(billing.subscription.paid_until).toLocaleDateString()}</b>.</> : billing.subscription?.trial_ends_at ? <>Пробный период до: <b style={{ color: "var(--text-primary)" }}>{new Date(billing.subscription.trial_ends_at).toLocaleDateString()}</b>.</> : null} Чтобы сменить план или продлить — обратитесь к администрации платформы.</p>
            </div>
          </>
        ) : <p className={c.muted}>Загрузка…</p>
      )}

      {/* INFRASTRUCTURE */}
      {section === "infrastructure" && (
        <>
          {availUpdates?.available && (
            <div className={`${styles.card}`} style={{ borderColor: "var(--accent-primary)" }}>
              <h2 className={styles.cardTitle}>Доступно обновление → {availUpdates.current_version}</h2>
              <p className={c.muted}>Готово к установке для {availUpdates.total_updatable} школ(ы). Обновляйте школы в разделе «Школы».</p>
            </div>
          )}
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Мои серверы (ноды) ({orgNodes ? orgNodes.length : 0})</h2>
            {orgNodes && orgNodes.length > 0 && (
              <div className={styles.tableContainer}>
                <table className={styles.table}>
                  <thead><tr><th>Нода</th><th>IP</th><th>Ресурсы</th><th>Статус</th><th>Школ</th><th>Загрузка</th><th>Агент</th></tr></thead>
                  <tbody>
                    {orgNodes.map((n) => {
                      const u = orgNodeUtil[n.id];
                      const pct = u ? u.capacity_percent : 0;
                      const barColor = pct > 80 ? "#dc3545" : pct > 60 ? "#ffc107" : "#28a745";
                      return (
                        <tr key={n.id}>
                          <td><b>{n.name}</b></td>
                          <td><code className={styles.code}>{n.hostname}</code></td>
                          <td>{n.cpu_cores} CPU / {n.ram_gb} GB RAM</td>
                          <td><span className={statusBadge(n.status)}>{n.status}</span></td>
                          <td>{u ? `${u.schools_count}/${u.max_schools}` : "—"}</td>
                          <td style={{minWidth:120}}><div style={{height:6, background:"#eee", borderRadius:3, overflow:"hidden"}}><div style={{height:6, width:`${Math.min(pct,100)}%`, background:barColor, borderRadius:3}} /></div><small style={{color:"var(--text-secondary)"}}>{u ? `${Math.round(pct)}%` : "?"}</small></td>
                          <td>{n.agent_version || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {orgNodes && orgNodes.length === 0 && <p className={styles.emptyState}>Нет привязанных серверов (нод). Все ваши школы пока на сервере платформы.</p>}
            {orgNodes === null && <p className={c.muted} onClick={() => { loadOrgInfra(); }} style={{cursor:"pointer", textDecoration:"underline"}}>Нажмите чтобы загрузить информацию о серверах…</p>}
          </div>
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Где крутятся ваши школы</h2>
            <p className={c.muted}>Каждая школа — изолированный Docker-стек (свой контейнер + БД). Школы размещаются на нодах — физических или виртуальных серверах. Система автоматически распределяет школы по наиболее свободным нодам.</p>
            {orgNodes && orgNodes.length > 0 && (
              <div className={styles.tableContainer} style={{ marginTop: 10 }}>
                <table className={styles.table}>
                  <thead><tr><th>Школа</th><th>Домен</th><th>Статус</th><th>Нода (IP)</th></tr></thead>
                  <tbody>
                    {schools?.map((s) => (
                      <tr key={s.id}>
                        <td><b>{s.name}</b></td>
                        <td><code className={styles.code}>{s.slug}.avari-land.ru</code></td>
                        <td><span className={statusBadge(s.status)}>{s.status}</span></td>
                        <td><code className={styles.code}>{orgNodes[0]?.hostname || "—"}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      </>)}

      {/* ADMINS MODAL */}
      {adminsFor && (
        <Modal title={`Администраторы школы «${adminsFor.name}»`} onClose={() => setAdminsFor(null)} width={700}>
          <p className={c.muted}>Вы управляете учётками администраторов школы. Внутреннюю работу школы они ведут сами.</p>
          {adminCred && <div className={`${styles.card} ${c.okCard}`}><b>Пароль выдан для {adminCred.login}</b><p>Временный пароль: <code className={styles.code}>{adminCred.temporary_password}</code> — передайте администратору.</p></div>}
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead><tr><th>Логин</th><th>Имя</th><th>Активен</th><th>Действия</th></tr></thead>
              <tbody>{admins?.map((a) => (<tr key={a.id}><td>{a.login}</td><td>{a.full_name || "—"}</td><td>{a.is_active ? "да" : "нет"}</td>
                <td style={{ whiteSpace: "nowrap" }}><button className={styles.actionBtn} disabled={adminBusy} onClick={() => resetAdmin(a.id)}>Сбросить пароль</button>{" "}<button className={styles.actionBtn} disabled={adminBusy} onClick={() => toggleAdmin(a)}>{a.is_active ? "Деактив." : "Актив."}</button>{" "}<button className={`${styles.actionBtn} ${styles.danger}`} disabled={adminBusy} onClick={() => removeAdmin(a.id, a.login)}>Удал.</button></td></tr>))}</tbody>
            </table>
            {admins && admins.length === 0 && <p className={styles.emptyState}>Пока нет администраторов.</p>}
            {!admins && <p className={c.muted}>Загрузка…</p>}
          </div>
          <form onSubmit={addAdmin} className={styles.form} style={{ marginTop: 14 }}>
            <h3 className={styles.cardTitle}>Добавить администратора</h3>
            <div className={styles.formRow}>
              <div className={styles.formGroup}><label className={styles.label}>Email</label><input className={styles.input} value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} placeholder="zavuch@school.ru" required /></div>
              <div className={styles.formGroup}><label className={styles.label}>Имя</label><input className={styles.input} value={newAdmin.name} onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} placeholder="Иван Петров" /></div>
            </div>
            <div className={styles.formActions}><button className={styles.submitBtn} disabled={adminBusy}>Добавить администратора</button></div>
          </form>
        </Modal>
      )}

      {/* DOMAINS MODAL */}
      {domainsFor && (
        <Modal title={`Домены школы «${domainsFor.name}»`} onClose={() => setDomainsFor(null)}>
          <p className={c.muted}>Кастомные домены школы. После привязки направьте DNS этого домена на сервер — TLS выпустится автоматически.</p>
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead><tr><th>Домен</th><th>Тип</th><th>Статус</th><th></th></tr></thead>
              <tbody>{domains?.map((d) => (<tr key={d.id}><td>{d.domain}</td><td>{d.type}</td><td><span className={statusBadge(d.status)}>{d.status}</span></td><td>{d.type === "custom" && <button className={`${styles.actionBtn} ${styles.danger}`} disabled={adminBusy} onClick={() => delDomain(d.id)}>Отвязать</button>}</td></tr>))}</tbody>
            </table>
            {domains && domains.length === 0 && <p className={styles.emptyState}>Доменов пока нет.</p>}
          </div>
          <form onSubmit={addDomain} className={styles.form} style={{ marginTop: 14 }}>
            <div className={styles.formGroup}><label className={styles.label}>Новый домен</label><input className={styles.input} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} placeholder="school.example.ru" required /></div>
            <div className={styles.formActions}><button className={styles.submitBtn} disabled={adminBusy}>Привязать домен</button></div>
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
