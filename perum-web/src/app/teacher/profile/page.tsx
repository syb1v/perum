'use client';

import { useState } from 'react';
import { useTeacherProfile } from '@/hooks/useTeacherProfile';
import HelpModal from '@/components/modals/HelpModal';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal';
import styles from './page.module.css';
/* ════════════════════════════════════════
   Main Profile Page Component
   ════════════════════════════════════════ */
export default function TeacherProfile() {
    const { user, stats, activity, loading, displayName, formatDate, comingSoon } = useTeacherProfile();

    /* ── Modals ── */
    const [helpOpen, setHelpOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);

    /* ════════════════════════════════════════
       Render
       ════════════════════════════════════════ */
    return (
        <div className={styles.profileMain}>
            {/* ── Profile Card ── */}
            <section className={styles.profileCard}>
                <div className={styles.profileHeader}>
                    <div className={styles.avatarContainer}>
                        <div className={styles.avatar}>
                            {user?.avatar_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={user.avatar_url} alt="Аватар" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            )}
                        </div>
                        <button className={styles.avatarEdit} onClick={comingSoon}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                    </div>
                    <div className={styles.profileInfo}>
                        <h1 className={styles.profileName}>{displayName}</h1>
                        <p className={styles.profileRole}>Учитель</p>

                        <div className={styles.profileStats}>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.classesCount}</span>
                                <span className={styles.statLabel}>Классов</span>
                            </div>
                            <div className={styles.statItem}>
                                <span className={styles.statValue}>{stats.studentsCount}</span>
                                <span className={styles.statLabel}>Учеников</span>
                            </div>
                        </div>
                    </div>
                    <button
                        className={styles.helpFloatingBtn}
                        onClick={() => setHelpOpen(true)}
                        title="Помощь и поддержка"
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                            <line x1="12" y1="17" x2="12.01" y2="17" />
                        </svg>
                    </button>
                </div>
            </section>

            {/* ── Recent Activity (Homework) ── */}
            <section className={styles.activitySection}>
                <div className={styles.sectionHeader}>
                    <h2>Недавняя активность</h2>
                </div>
                <div className={styles.activityList}>
                    {loading ? (
                        <div className={styles.emptyState}>
                            <div className={styles.spinner} />
                            <p>Загрузка...</p>
                        </div>
                    ) : activity.length === 0 ? (
                        <div className={styles.emptyState}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.5, marginBottom: 16 }}>
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <span>Нет недавней активности</span>
                        </div>
                    ) : (
                        activity.map((item) => (
                            <div key={item.id} className={styles.activityItem}>
                                <div className={styles.activityIcon}>
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                        <polyline points="14 2 14 8 20 8" />
                                        <line x1="16" y1="13" x2="8" y2="13" />
                                        <line x1="16" y1="17" x2="8" y2="17" />
                                        <polyline points="10 9 9 9 8 9" />
                                    </svg>
                                </div>
                                <div className={styles.activityInfo}>
                                    <div className={styles.activityTitle}>{item.title}</div>
                                    <div className={styles.activityMeta}>
                                        {item.subject_name} • {item.class_name} • {formatDate(item.created_at)}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </section>

            {/* ── Help Modal ── */}
            {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

            {/* ── Change Password Modal ── */}
            <ChangePasswordModal
                isOpen={changePasswordOpen}
                onClose={() => setChangePasswordOpen(false)}
            />
        </div>
    );
}
