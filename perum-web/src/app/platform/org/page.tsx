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
  const [err, setErr] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

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

  function logout() {
    clearPlatformToken();
    router.push("/platform/login");
  }

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
            <th>Версия</th>
            <th>Обновление</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {schools?.map((s) => {
            const st = statuses[s.id];
            const canUpdate = st?.update_available;
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
    </div>
  );
}
