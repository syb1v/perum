import styles from "./platform.module.css";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <span
          className={styles.brand}
          title="Платформа Экономико-Аналитического Развития Учащейся Молодёжи"
        >
          ПЭРУМ
        </span>
        <span className={styles.sub}>— панель платформы</span>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
