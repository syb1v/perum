"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import styles from "./platform.module.css";

export default function PlatformDashboard() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [err, setErr] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("trial");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [busySlug, setBusySlug] = useState<string | null>(null);

  // Биллинг выбранной организации.
  const [billingFor, setBillingFor] = useState<string | null>(null);
  const [billing, setBilling] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [billingBusy, setBillingBusy] = useState(false);
  const [chargeMonths, setChargeMonths] = useState(1);
  const [planWarning, setPlanWarning] = useState("");

  // Релизы (OTA): публикация + список.
  const [releases, setReleases] = useState<any[] | null>(null);
  const [relTag, setRelTag] = useState("");
  const [relImage, setRelImage] = useState("");
  const [relLog, setRelLog] = useState("");
  const [publishing, setPublishing] = useState(false);

  async function load() {
    try {
      setOrgs(await papi("/api/organizations"));
      try {
        setStats(await papi("/api/platform/stats"));
      } catch {
        /* статистика не критична для остального экрана */
      }
      const r = await papi("/api/releases");
      setReleases(r.releases || []);
    } catch (e: any) {
      if (e.status === 401) {
        router.push("/platform/login");
        return;
      }
      setErr(e.message);
    }
  }

  useEffect(() => {
    if (!getPlatformToken()) {
      router.push("/platform/login");
      return;
    }
    if (getTokenPayload()?.role === "org_admin") {
      router.push("/platform/org");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function publishRelease(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setPublishing(true);
    try {
      await papi("/api/releases", {
        method: "POST",
        body: JSON.stringify({ version_tag: relTag, image: relImage || null, changelog: relLog || null }),
      });
      setRelTag("");
      setRelImage("");
      setRelLog("");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setPublishing(false);
    }
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setCreated(null);
    setCreating(true);
    try {
      const r = await papi("/api/organizations", {
        method: "POST",
        body: JSON.stringify({ slug, name, admin_email: email || null, plan }),
      });
      setCreated(r);
      setSlug("");
      setName("");
      setEmail("");
      setPlan("trial");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleSuspendOrg(o: any) {
    const action = o.status === "suspended" ? "unsuspend" : "suspend";
    if (action === "suspend" && !confirm(`Заморозить организацию «${o.name}»? Все её школы будут остановлены, org_admin потеряет доступ. Данные сохранятся.`)) return;
    setBusySlug(o.slug);
    setErr("");
    try {
      await papi(`/api/organizations/${o.slug}/${action}`, { method: "POST" });
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusySlug(null);
    }
  }

  async function openBilling(o: any) {
    setBillingFor(o.slug);
    setBilling(null);
    setInvoices([]);
    setChargeMonths(1);
    setPlanWarning("");
    try {
      setBilling(await papi(`/api/organizations/${o.slug}/billing`));
      setInvoices((await papi(`/api/organizations/${o.slug}/billing/invoices`)).invoices || []);
    } catch (e: any) {
      setErr(e.message);
      setBillingFor(null); // не оставляем панель в вечной «Загрузке…»
    }
  }

  async function reloadBilling() {
    if (!billingFor) return;
    setBilling(await papi(`/api/organizations/${billingFor}/billing`));
    setInvoices((await papi(`/api/organizations/${billingFor}/billing/invoices`)).invoices || []);
  }

  async function changePlan(p: string) {
    if (!billingFor) return;
    setBillingBusy(true);
    setErr("");
    setPlanWarning("");
    try {
      // warning о понижении плана ниже числа используемых школ есть ТОЛЬКО в ответе PUT.
      const res = await papi(`/api/organizations/${billingFor}/billing`, { method: "PUT", body: JSON.stringify({ plan: p }) });
      if (res?.warning) setPlanWarning(res.warning);
      await reloadBilling();
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBillingBusy(false);
    }
  }

  async function chargeOrg() {
    if (!billingFor) return;
    setBillingBusy(true);
    setErr("");
    try {
      await papi(`/api/organizations/${billingFor}/billing/charge`, { method: "POST", body: JSON.stringify({ months: chargeMonths }) });
      await reloadBilling();
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBillingBusy(false);
    }
  }

  async function runEnforce() {
    if (!confirm("Приостановить организации с просроченной подпиской (их школы остановятся)?")) return;
    setErr("");
    try {
      const r = await papi("/api/billing/enforce", { method: "POST" });
      alert(`Проверено: ${r.checked}. Приостановлено: ${r.suspended.length ? r.suspended.join(", ") : "нет"}.`);
      load();
      if (billingFor) await reloadBilling();
    } catch (e: any) {
      setErr(e.message);
    }
  }

  async function deleteOrg(o: any) {
    if (!confirm(`Удалить организацию «${o.name}» вместе со всеми её школами и данными? Перед удалением будет снят бэкап БД школ. Действие необратимо.`)) return;
    setBusySlug(o.slug);
    setErr("");
    try {
      await papi(`/api/organizations/${o.slug}?purge=true`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusySlug(null);
    }
  }

  function logout() {
    clearPlatformToken();
    router.push("/platform/login");
  }

  return (
    <div>
      <div className={styles.rowBetween}>
        <h1 className={styles.h1}>Организации</h1>
        <div>
          <button className={styles.btnGhost} onClick={runEnforce}>
            Проверить просрочки
          </button>{" "}
          <button className={styles.btnGhost} onClick={logout}>
            Выйти
          </button>
        </div>
      </div>

      {err && <p className={styles.err}>{err}</p>}

      {stats && (
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.organizations_total}</div><div className={styles.kpiLabel}>Организаций</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.schools_total}</div><div className={styles.kpiLabel}>Школ</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}><span className={stats.schools_online > 0 ? styles.dotOnline : styles.dotOffline}>{stats.schools_online}</span> / {stats.schools_total}</div><div className={styles.kpiLabel}>Школ онлайн</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.users_total}</div><div className={styles.kpiLabel}>Пользователей</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.students}</div><div className={styles.kpiLabel}>Учеников</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.teachers}</div><div className={styles.kpiLabel}>Учителей</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.grades_total}</div><div className={styles.kpiLabel}>Оценок</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.active_24h}</div><div className={styles.kpiLabel}>Активны за 24ч</div></div>
        </div>
      )}

      {created && (
        <div className={`${styles.card} ${styles.cardOk}`}>
          <b>Организация создана: {created.organization.slug}</b>
          {created.org_admin ? (
            <p>
              org_admin: <code>{created.org_admin.login}</code> &nbsp;временный пароль:{" "}
              <code>{created.org_admin.temporary_password}</code>
            </p>
          ) : (
            <p className={styles.muted}>org_admin не создан (не указан email).</p>
          )}
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.h2}>Создать организацию</h2>
        <form onSubmit={createOrg} className={styles.form}>
          <label className={styles.label}>
            Slug
            <input className={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" required />
          </label>
          <label className={styles.label}>
            Название
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Education" required />
          </label>
          <label className={styles.label}>
            Email администратора
            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@acme.ru" />
          </label>
          <label className={styles.label}>
            План
            <select className={styles.input} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="trial">trial (1 школа)</option>
              <option value="basic">basic (5 школ)</option>
              <option value="pro">pro (50 школ)</option>
              <option value="enterprise">enterprise (1000 школ)</option>
            </select>
          </label>
          <button className={styles.btn} disabled={creating}>
            {creating ? "Создаётся (поднимается стек)…" : "Создать"}
          </button>
        </form>
      </div>

      <table className={styles.tbl}>
        <thead>
          <tr>
            <th>Slug</th>
            <th>Название</th>
            <th>План</th>
            <th>Статус</th>
            <th>Создана</th>
            <th>Действия</th>
          </tr>
        </thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o.id}>
              <td>{o.slug}</td>
              <td>{o.name}</td>
              <td>{o.plan || "—"}</td>
              <td>
                <span className={`${styles.badge} ${styles["s_" + o.status] || ""}`}>{o.status}</span>
              </td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>
                <button className={styles.btnGhost} onClick={() => openBilling(o)}>
                  Биллинг
                </button>{" "}
                <button
                  className={styles.btnGhost}
                  disabled={busySlug === o.slug || !["active", "suspended"].includes(o.status)}
                  onClick={() => toggleSuspendOrg(o)}
                >
                  {o.status === "suspended" ? "Разморозить" : "Заморозить"}
                </button>{" "}
                <button
                  className={styles.btnGhost}
                  disabled={busySlug === o.slug || o.status === "provisioning"}
                  onClick={() => deleteOrg(o)}
                >
                  Удалить
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orgs && orgs.length === 0 && <p className={styles.muted}>Пока нет организаций.</p>}

      {billingFor && (
        <div className={styles.card} style={{ marginTop: 16 }}>
          <div className={styles.rowBetween}>
            <h2 className={styles.h2}>Биллинг — {billingFor}</h2>
            <button className={styles.btnGhost} onClick={() => setBillingFor(null)}>
              Закрыть
            </button>
          </div>
          {!billing ? (
            <p className={styles.muted}>Загрузка…</p>
          ) : (
            <>
              <div className={styles.kpiGrid}>
                <div className={styles.kpiCard}><div className={styles.kpiVal}>{billing.plan}</div><div className={styles.kpiLabel}>План ({billing.price_rub_month} ₽/мес)</div></div>
                <div className={styles.kpiCard}><div className={styles.kpiVal}>{billing.schools_used} / {billing.school_limit}</div><div className={styles.kpiLabel}>Школ (исп./лимит)</div></div>
                <div className={styles.kpiCard}><div className={styles.kpiVal}>{billing.subscription?.status}</div><div className={styles.kpiLabel}>Подписка</div></div>
                <div className={styles.kpiCard}><div className={styles.kpiVal}>{billing.subscription?.days_left ?? "—"}</div><div className={styles.kpiLabel}>Дней до конца</div></div>
              </div>
              {billing.subscription?.delinquent && (
                <p className={styles.err}>Подписка просрочена — управление школами заблокировано до оплаты.</p>
              )}
              {planWarning && <p className={styles.err}>{planWarning}</p>}
              <div className={styles.form}>
                <label className={styles.label}>
                  Сменить план
                  <select className={styles.input} value={billing.plan} disabled={billingBusy} onChange={(e) => changePlan(e.target.value)}>
                    <option value="trial">trial</option>
                    <option value="basic">basic</option>
                    <option value="pro">pro</option>
                    <option value="enterprise">enterprise</option>
                  </select>
                </label>
                <label className={styles.label}>
                  Оплата (месяцев)
                  <input className={styles.input} type="number" min={1} value={chargeMonths} disabled={billingBusy}
                    onChange={(e) => setChargeMonths(Math.max(1, Number(e.target.value) || 1))} />
                </label>
                <button className={styles.btn} disabled={billingBusy} onClick={chargeOrg}>
                  Отметить оплату
                </button>
              </div>
              <table className={styles.tbl}>
                <thead>
                  <tr><th>Счёт</th><th>План</th><th>Сумма</th><th>Статус</th><th>Период до</th><th>Оплачен</th></tr>
                </thead>
                <tbody>
                  {invoices.map((iv) => (
                    <tr key={iv.id}>
                      <td>#{iv.id}</td>
                      <td>{iv.plan}</td>
                      <td>{iv.amount_rub} ₽</td>
                      <td>{iv.status}</td>
                      <td>{iv.period_end ? new Date(iv.period_end).toLocaleDateString() : "—"}</td>
                      <td>{iv.paid_at ? new Date(iv.paid_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {invoices.length === 0 && <p className={styles.muted}>Счетов пока нет.</p>}
            </>
          )}
        </div>
      )}

      <div className={styles.rowBetween} style={{ marginTop: 32 }}>
        <h1 className={styles.h1}>Релизы (обновления)</h1>
      </div>
      <p className={styles.muted}>
        Опубликованный релиз становится доступен организациям — они обновляют свои школы по кнопке (OTA).
      </p>

      <div className={styles.card}>
        <h2 className={styles.h2}>Опубликовать релиз</h2>
        <form onSubmit={publishRelease} className={styles.form}>
          <label className={styles.label}>
            Версия (тег)
            <input className={styles.input} value={relTag} onChange={(e) => setRelTag(e.target.value)} placeholder="2.1.0" required />
          </label>
          <label className={styles.label}>
            Docker-образ (необязательно — по умолчанию = версия)
            <input className={styles.input} value={relImage} onChange={(e) => setRelImage(e.target.value)} placeholder="perum-tenant:v3" />
          </label>
          <label className={styles.label}>
            Что нового (changelog)
            <input className={styles.input} value={relLog} onChange={(e) => setRelLog(e.target.value)} placeholder="Описание изменений" />
          </label>
          <button className={styles.btn} disabled={publishing}>
            {publishing ? "…" : "Опубликовать (сделать текущим)"}
          </button>
        </form>
      </div>

      <table className={styles.tbl}>
        <thead>
          <tr>
            <th>Версия</th>
            <th>Образ</th>
            <th>Что нового</th>
            <th>Текущий</th>
            <th>Опубликован</th>
          </tr>
        </thead>
        <tbody>
          {releases?.map((r) => (
            <tr key={r.id}>
              <td>{r.version_tag}</td>
              <td><code>{r.image}</code></td>
              <td>{r.changelog || "—"}</td>
              <td>{r.is_current ? <span className={`${styles.badge} ${styles.s_active || ""}`}>текущий</span> : ""}</td>
              <td>{new Date(r.published_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {releases && releases.length === 0 && <p className={styles.muted}>Релизов пока нет.</p>}
    </div>
  );
}
