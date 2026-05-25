"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, getTokenPayload, papi } from "@/lib/platformApi";
import styles from "./platform.module.css";

export default function PlatformDashboard() {
  const router = useRouter();
  const [orgs, setOrgs] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<any>(null);

  // Релизы (OTA): публикация + список.
  const [releases, setReleases] = useState<any[] | null>(null);
  const [relTag, setRelTag] = useState("");
  const [relImage, setRelImage] = useState("");
  const [relLog, setRelLog] = useState("");
  const [publishing, setPublishing] = useState(false);

  async function load() {
    try {
      setOrgs(await papi("/api/organizations"));
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

  function logout() {
    clearPlatformToken();
    router.push("/platform/login");
  }

  return (
    <div>
      <div className={styles.rowBetween}>
        <h1 className={styles.h1}>Организации</h1>
        <button className={styles.btnGhost} onClick={logout}>
          Выйти
        </button>
      </div>

      {err && <p className={styles.err}>{err}</p>}

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
            <th>Статус</th>
            <th>Создана</th>
          </tr>
        </thead>
        <tbody>
          {orgs?.map((o) => (
            <tr key={o.id}>
              <td>{o.slug}</td>
              <td>{o.name}</td>
              <td>
                <span className={`${styles.badge} ${styles["s_" + o.status] || ""}`}>{o.status}</span>
              </td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {orgs && orgs.length === 0 && <p className={styles.muted}>Пока нет организаций.</p>}

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
