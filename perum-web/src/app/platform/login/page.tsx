"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getTokenPayload, papi, setPlatformToken } from "@/lib/platformApi";
import styles from "../platform.module.css";

export default function PlatformLogin() {
  const router = useRouter();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const data = await papi("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });
      setPlatformToken(data.access_token);
      const role = getTokenPayload()?.role;
      router.push(role === "org_admin" ? "/platform/org" : "/platform");
    } catch (e: any) {
      setErr(e.message || "Ошибка входа");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.loginWrap}>
      <div className={styles.card}>
        <div className={styles.brandBig}>ПЭРУМ</div>
        <p className={styles.brandSub}>
          Платформа Экономико-Аналитического Развития Учащейся Молодёжи
        </p>
        <h1 className={styles.h1}>Панель платформы — вход</h1>
        <form onSubmit={submit} className={styles.form}>
          <label className={styles.label}>
            Логин
            <input className={styles.input} value={login} onChange={(e) => setLogin(e.target.value)} />
          </label>
          <label className={styles.label}>
            Пароль
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {err && <p className={styles.err}>{err}</p>}
          <button className={styles.btn} disabled={busy}>
            {busy ? "…" : "Войти"}
          </button>
        </form>
      </div>
    </div>
  );
}
