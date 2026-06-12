"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import styles from "../platform.module.css";

/**
 * Кабинет организации (org_admin). Управляющий слой над школами: список школ,
 * создание (провижининг изолированного стека), обновление «по кнопке» (OTA),
 * удаление. Внутрь школы org_admin не заходит — это дело school_admin.
 */
export default function OrgConsole() {
  const router = useRouter();
  const [schools, setSchools] = useState<any[] | null>(null);
  const [statuses, setStatuses] = useState<Record<number, any>>({});
  const [stats, setStats] = useState<any>(null);
  const [billing, setBilling] = useState<any>(null);
  const [err, setErr] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Управление администраторами выбранной школы (R5).
  const [adminsFor, setAdminsFor] = useState<any | null>(null);
  const [admins, setAdmins] = useState<any[] | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminCred, setAdminCred] = useState<any>(null);
  const [adminErr, setAdminErr] = useState("");

  async function load() {
    try {
      const r = await papi("/api/schools");
      const list = r.schools || [];
      setSchools(list);
      const entries = await Promise.all(
        list.map(async (s: any) => {
          try {
            return [s.id, await papi(`/api/schools/${s.id}/update-status`)] as const;
          } catch {
            return [s.id, null] as const;
          }
        }),
      );
      setStatuses(Object.fromEntries(entries));
      try {
        setStats(await papi("/api/schools/stats/overview"));
      } catch {
        /* статистика не критична */
      }
      try {
        setBilling(await papi("/api/schools/billing"));
      } catch {
        /* биллинг не критичен для остального экрана */
      }
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
    if (getTokenPayload()?.role !== "org_admin") {
      router.push("/platform");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSchool(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setCreated(null);
    setCreating(true);
    try {
      const r = await papi("/api/schools", {
        method: "POST",
        body: JSON.stringify({ slug, name, admin_email: email || null }),
      });
      setCreated(r);
      setSlug("");
      setName("");
      setEmail("");
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function updateSchool(id: number) {
    setBusyId(id);
    setErr("");
    try {
      const r = await papi(`/api/schools/${id}/update`, { method: "POST" });
      alert(r.message + (r.rolled_back ? "" : ` (→ ${r.to_image})`));
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function removeSchool(id: number, sslug: string) {
    if (!confirm(`Удалить школу «${sslug}» вместе с её стеком и данными?`)) return;
    setBusyId(id);
    try {
      await papi(`/api/schools/${id}?purge=true`, { method: "DELETE" });
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleSuspendSchool(s: any) {
    const action = s.status === "suspended" ? "unsuspend" : "suspend";
    if (action === "suspend" && !confirm(`Заморозить школу «${s.name}»? Стек остановится, данные сохранятся.`)) return;
    setBusyId(s.id);
    setErr("");
    try {
      await papi(`/api/schools/${s.id}/${action}`, { method: "POST" });
      load();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function openAdmins(s: any) {
    setAdminsFor(s);
    setAdmins(null);
    setAdminCred(null);
    setAdminErr("");
    setNewAdminEmail("");
    setNewAdminName("");
    try {
      const r = await papi(`/api/schools/${s.id}/admins`);
      setAdmins(r.admins || []);
    } catch (e: any) {
      setAdminErr(e.message);
    }
  }

  async function reloadAdmins() {
    if (!adminsFor) return;
    try {
      const r = await papi(`/api/schools/${adminsFor.id}/admins`);
      setAdmins(r.admins || []);
    } catch (e: any) {
      setAdminErr(e.message);
    }
  }

  async function addAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminsFor) return;
    setAdminBusy(true);
    setAdminErr("");
    setAdminCred(null);
    try {
      const r = await papi(`/api/schools/${adminsFor.id}/admins`, {
        method: "POST",
        body: JSON.stringify({ email: newAdminEmail, full_name: newAdminName || null }),
      });
      setAdminCred(r);
      setNewAdminEmail("");
      setNewAdminName("");
      reloadAdmins();
    } catch (e: any) {
      setAdminErr(e.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function resetAdmin(uid: number) {
    if (!adminsFor) return;
    setAdminBusy(true);
    setAdminErr("");
    try {
      const r = await papi(`/api/schools/${adminsFor.id}/admins/${uid}/reset-password`, { method: "POST" });
      setAdminCred(r);
    } catch (e: any) {
      setAdminErr(e.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function toggleAdminActive(a: any) {
    if (!adminsFor) return;
    setAdminBusy(true);
    setAdminErr("");
    try {
      await papi(`/api/schools/${adminsFor.id}/admins/${a.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !a.is_active }),
      });
      reloadAdmins();
    } catch (e: any) {
      setAdminErr(e.message);
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeAdmin(uid: number, login: string) {
    if (!adminsFor) return;
    if (!confirm(`Удалить администратора «${login}»?`)) return;
    setAdminBusy(true);
    setAdminErr("");
    try {
      await papi(`/api/schools/${adminsFor.id}/admins/${uid}`, { method: "DELETE" });
      reloadAdmins();
    } catch (e: any) {
      setAdminErr(e.message);
    } finally {
      setAdminBusy(false);
    }
  }

  function logout() {
    clearPlatformToken();
    router.push("/platform/login");
  }

  const statById: Record<number, any> = Object.fromEntries(
    (stats?.schools || []).map((s: any) => [s.id, s]),
  );

  return (
    <div>
      <div className={styles.rowBetween}>
        <h1 className={styles.h1}>Школы организации</h1>
        <button className={styles.btnGhost} onClick={logout}>
          Выйти
        </button>
      </div>
      <p className={styles.muted}>
        Вы управляете школами и их обновлениями. Каждая школа — изолированный стек (свой контейнер и база).
        Внутреннюю работу школы (журнал, оценки, пользователи) ведёт администратор школы.
      </p>

      {err && <p className={styles.err}>{err}</p>}

      {billing && (
        <div className={styles.card}>
          <div className={styles.rowBetween}>
            <span>
              План: <b>{billing.plan}</b> · школы: <b>{billing.schools_used} / {billing.school_limit}</b> · подписка:{" "}
              <b>{billing.subscription?.status}</b>
              {billing.subscription?.days_left != null && <> · осталось дней: <b>{billing.subscription.days_left}</b></>}
            </span>
          </div>
          {billing.subscription?.delinquent && (
            <p className={styles.err}>Подписка просрочена — создание и изменение школ заблокировано. Обратитесь в поддержку платформы для оплаты.</p>
          )}
        </div>
      )}

      {stats && (
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}><div className={styles.kpiVal}><span className={stats.schools_online > 0 ? styles.dotOnline : styles.dotOffline}>{stats.schools_online}</span> / {stats.schools_total}</div><div className={styles.kpiLabel}>Школ онлайн</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.students}</div><div className={styles.kpiLabel}>Учеников</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.teachers}</div><div className={styles.kpiLabel}>Учителей</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.users_total}</div><div className={styles.kpiLabel}>Пользователей</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.grades_total}</div><div className={styles.kpiLabel}>Оценок</div></div>
          <div className={styles.kpiCard}><div className={styles.kpiVal}>{stats.active_24h}</div><div className={styles.kpiLabel}>Активны за 24ч</div></div>
        </div>
      )}

      {created && (
        <div className={`${styles.card} ${styles.cardOk}`}>
          <b>Школа создана: {created.school?.slug}</b>
          {created.school_admin ? (
            <p>
              Администратор школы: <code>{created.school_admin.login}</code> &nbsp;временный пароль:{" "}
              <code>{created.school_admin.temporary_password}</code>
              <br />
              <span className={styles.muted}>Адрес школы: {created.host}</span>
            </p>
          ) : (
            <p className={styles.muted}>Админ школы не создан (не указан email).</p>
          )}
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.h2}>Создать школу</h2>
        <form onSubmit={createSchool} className={styles.form}>
          <label className={styles.label}>
            Slug (поддомен)
            <input className={styles.input} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="gimnazia5" required />
          </label>
          <label className={styles.label}>
            Название
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Гимназия №5" required />
          </label>
          <label className={styles.label}>
            Email администратора школы
            <input className={styles.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="director@gimnazia5.ru" />
          </label>
          <button className={styles.btn} disabled={creating}>
            {creating ? "Создаётся (поднимается стек)…" : "Создать школу"}
          </button>
        </form>
      </div>

      <table className={styles.tbl}>
        <thead>
          <tr>
            <th>Школа</th>
            <th>Статус</th>
            <th>Ученики</th>
            <th>Онлайн</th>
            <th>Версия</th>
            <th>Обновление</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {schools?.map((s) => {
            const st = statuses[s.id];
            const canUpdate = st?.update_available && s.status === "active";
            return (
              <tr key={s.id}>
                <td>
                  <b>{s.name}</b>
                  <br />
                  <span className={styles.muted}>{s.slug}</span>
                </td>
                <td>
                  <span className={`${styles.badge} ${styles["s_" + s.status] || ""}`}>{s.status}</span>
                </td>
                <td>{statById[s.id]?.students ?? "—"}</td>
                <td>
                  <span className={statById[s.id]?.online ? styles.dotOnline : styles.dotOffline}>●</span>
                </td>
                <td>
                  <code>{st?.latest_version && s.release_tag ? s.release_tag : s.release_tag || "—"}</code>
                </td>
                <td>
                  {canUpdate ? (
                    <button
                      className={styles.btn}
                      disabled={busyId === s.id}
                      onClick={() => updateSchool(s.id)}
                      title={st?.changelog || ""}
                    >
                      {busyId === s.id ? "Обновляется…" : `Обновить до ${st.latest_version}`}
                    </button>
                  ) : (
                    <span className={styles.muted}>актуальна</span>
                  )}
                </td>
                <td>
                  <button className={styles.btnGhost} disabled={busyId === s.id} onClick={() => openAdmins(s)}>
                    Админы
                  </button>{" "}
                  <button
                    className={styles.btnGhost}
                    disabled={busyId === s.id || !["active", "suspended"].includes(s.status)}
                    onClick={() => toggleSuspendSchool(s)}
                  >
                    {s.status === "suspended" ? "Разморозить" : "Заморозить"}
                  </button>{" "}
                  <button className={styles.btnGhost} disabled={busyId === s.id} onClick={() => removeSchool(s.id, s.slug)}>
                    Удалить
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {schools && schools.length === 0 && <p className={styles.muted}>Пока нет школ — создайте первую.</p>}

      {adminsFor && (
        <div className={styles.card} style={{ marginTop: 24 }}>
          <div className={styles.rowBetween}>
            <h2 className={styles.h2}>Администраторы школы «{adminsFor.name}»</h2>
            <button className={styles.btnGhost} onClick={() => setAdminsFor(null)}>
              Закрыть
            </button>
          </div>
          <p className={styles.muted}>
            Вы управляете учётками администраторов школы. Внутреннюю работу школы (журнал, оценки, пользователи) ведут они сами.
          </p>

          {adminErr && <p className={styles.err}>{adminErr}</p>}

          {adminCred && (
            <div className={`${styles.card} ${styles.cardOk}`}>
              <b>Пароль выдан для {adminCred.login}</b>
              <p>
                Временный пароль: <code>{adminCred.temporary_password}</code> — передайте администратору, он сменит его при входе.
              </p>
            </div>
          )}

          <table className={styles.tbl}>
            <thead>
              <tr>
                <th>Логин</th>
                <th>Имя</th>
                <th>Активен</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {admins?.map((a) => (
                <tr key={a.id}>
                  <td>{a.login}</td>
                  <td>{a.full_name || "—"}</td>
                  <td>{a.is_active ? "да" : "нет"}</td>
                  <td>
                    <button className={styles.btnGhost} disabled={adminBusy} onClick={() => resetAdmin(a.id)}>
                      Сбросить пароль
                    </button>{" "}
                    <button className={styles.btnGhost} disabled={adminBusy} onClick={() => toggleAdminActive(a)}>
                      {a.is_active ? "Деактивировать" : "Активировать"}
                    </button>{" "}
                    <button className={styles.btnGhost} disabled={adminBusy} onClick={() => removeAdmin(a.id, a.login)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {admins && admins.length === 0 && <p className={styles.muted}>Пока нет администраторов.</p>}
          {!admins && !adminErr && <p className={styles.muted}>Загрузка…</p>}

          <form onSubmit={addAdmin} className={styles.form} style={{ marginTop: 16 }}>
            <h3 className={styles.h2}>Добавить администратора</h3>
            <label className={styles.label}>
              Email
              <input className={styles.input} value={newAdminEmail} onChange={(e) => setNewAdminEmail(e.target.value)} placeholder="zavuch@school.ru" required />
            </label>
            <label className={styles.label}>
              Имя (необязательно)
              <input className={styles.input} value={newAdminName} onChange={(e) => setNewAdminName(e.target.value)} placeholder="Иван Петров" />
            </label>
            <button className={styles.btn} disabled={adminBusy}>
              {adminBusy ? "…" : "Добавить администратора"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
