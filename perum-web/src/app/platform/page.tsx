"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearPlatformToken, getPlatformToken, papi } from "@/lib/platformApi";
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

  async function load() {
    try {
      setOrgs(await papi("/api/organizations"));
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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    </div>
  );
}
