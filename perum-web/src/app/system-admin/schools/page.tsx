'use client';

import React, { useState, useEffect, useCallback } from 'react';
import styles from '../page.module.css';

interface SchoolAdmin {
    id: number;
    login: string;
    name: string;
    role: string;
    last_login: string | null;
}

interface School {
    id: number;
    name: string;
    timezone: string;
    domain_alias: string | null;
    is_active: boolean;
    created_at?: string;
    users_count: number;
    students_count: number;
    teachers_count: number;
    admins_count: number;
    classes_count: number;
}

interface ClassPerf {
    class_id: number;
    class_name: string;
    grade_level: number | null;
    avg_grade: number;
    grades_count: number;
}
interface TeacherActivity {
    id: number;
    name: string;
    grades_given: number;
}
interface SchoolDetail {
    school: { id: number; name: string; timezone: string; is_active: boolean };
    stats: {
        users: number; students: number; teachers: number; admins: number;
        classes: number; subjects: number;
        avg_grade?: number; grades_count?: number;
        lvk_distributed?: number; lvk_spent?: number;
    };
    grade_distribution?: { grade_value: number; count: number }[];
    class_performance?: ClassPerf[];
    teacher_activity?: TeacherActivity[];
    admins: SchoolAdmin[];
}

const TIMEZONES = [
    'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara',
    'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Krasnoyarsk',
    'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok',
    'Asia/Magadan', 'Asia/Kamchatka',
];

export default function SchoolsManagement() {
    const [schools, setSchools] = useState<School[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [formName, setFormName] = useState('');
    const [formTz, setFormTz] = useState('Europe/Moscow');

    // Detail panel
    const [selectedSchool, setSelectedSchool] = useState<number | null>(null);
    const [schoolDetail, setSchoolDetail] = useState<SchoolDetail | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    // Admin registration
    const [showRegAdmin, setShowRegAdmin] = useState(false);
    const [regForm, setRegForm] = useState({ login: '', password: '', first_name: '', last_name: '', patronymic: '', role: 'admin' });
    const [registering, setRegistering] = useState(false);

    const getHeaders = () => ({
        'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
        'Content-Type': 'application/json'
    });

    const fetchSchools = useCallback(() => {
        fetch('/api/system/schools', { headers: getHeaders() })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setSchools(data);
                setLoading(false);
            })
            .catch(() => {
                setSchools([]);
                setLoading(false);
            });
    }, []);

    useEffect(() => { fetchSchools(); }, [fetchSchools]);

    const handleCreate = async () => {
        if (!formName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch('/api/system/schools', {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify({ name: formName.trim(), timezone: formTz })
            });
            if (res.ok) {
                setFormName(''); setFormTz('Europe/Moscow'); setShowCreate(false);
                fetchSchools();
            }
        } finally { setCreating(false); }
    };

    const handleToggle = async (id: number, currentStatus: boolean) => {
        const action = currentStatus ? 'приостановить' : 'активировать';
        if (!confirm(`Вы уверены, что хотите ${action} эту школу?`)) return;
        await fetch(`/api/system/schools/${id}/toggle?is_active=${!currentStatus}`, {
            method: 'PUT', headers: getHeaders()
        });
        fetchSchools();
        if (selectedSchool === id) loadSchoolDetail(id);
    };

    const loadSchoolDetail = async (id: number) => {
        setSelectedSchool(id);
        setDetailLoading(true);
        setShowRegAdmin(false);
        try {
            // Расширенная статистика (full-stats), с фолбеком на старый /stats эндпоинт.
            let res = await fetch(`/api/system/schools/${id}/full-stats?period_days=30`, { headers: getHeaders() });
            if (!res.ok) {
                res = await fetch(`/api/system/schools/${id}/stats`, { headers: getHeaders() });
            }
            if (res.ok) {
                const data = await res.json();
                setSchoolDetail(data);
            }
        } finally { setDetailLoading(false); }
    };

    const handleRegisterAdmin = async () => {
        if (!selectedSchool || !regForm.login.trim() || !regForm.password.trim() || !regForm.first_name.trim() || !regForm.last_name.trim()) return;
        setRegistering(true);
        try {
            const res = await fetch(`/api/system/schools/${selectedSchool}/register-admin`, {
                method: 'POST', headers: getHeaders(),
                body: JSON.stringify(regForm)
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || 'Администратор создан');
                setRegForm({ login: '', password: '', first_name: '', last_name: '', patronymic: '', role: 'admin' });
                setShowRegAdmin(false);
                loadSchoolDetail(selectedSchool);
                fetchSchools();
            } else {
                alert(data.detail || 'Ошибка создания');
            }
        } finally { setRegistering(false); }
    };

    if (loading) {
        return <div className={styles.loadingScreen}><div className={styles.spinner} /><span>Загрузка школ...</span></div>;
    }

    const activeCount = schools.filter(s => s.is_active).length;

    return (
        <div>
            {/* Summary metrics */}
            <div className={styles.metricsGrid}>
                <div className={styles.metricCard}>
                    <div className={`${styles.metricIcon} ${styles.purple}`}>🏫</div>
                    <span className={styles.metricLabel}>Всего школ</span>
                    <span className={styles.metricValue}>{schools.length}</span>
                </div>
                <div className={styles.metricCard}>
                    <div className={`${styles.metricIcon} ${styles.green}`}>✓</div>
                    <span className={styles.metricLabel}>Активных</span>
                    <span className={styles.metricValue}>{activeCount}</span>
                </div>
                <div className={styles.metricCard}>
                    <div className={`${styles.metricIcon} ${styles.blue}`}>👥</div>
                    <span className={styles.metricLabel}>Пользователей</span>
                    <span className={styles.metricValue}>{schools.reduce((s, x) => s + x.users_count, 0)}</span>
                </div>
            </div>

            {/* Create new school */}
            <div className={styles.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showCreate ? 16 : 0 }}>
                    <div className={styles.cardTitle} style={{ marginBottom: 0 }}>🏫 Инстансы школ</div>
                    <button className={styles.btnPrimary} onClick={() => setShowCreate(!showCreate)}>
                        {showCreate ? '✕ Отмена' : '+ Создать школу'}
                    </button>
                </div>

                {showCreate && (
                    <div style={{ padding: 20, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginTop: 16 }}>
                        <div className={styles.formRow}>
                            <div className={styles.formGroup}>
                                <label>Название школы *</label>
                                <input className={styles.formInput} type="text" placeholder="МАОУ СОШ №42 г. Москва" value={formName} onChange={e => setFormName(e.target.value)} />
                            </div>
                            <div className={styles.formGroup}>
                                <label>Часовой пояс</label>
                                <select className={styles.formSelect} value={formTz} onChange={e => setFormTz(e.target.value)}>
                                    {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                                </select>
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                            <button className={styles.btnSecondary} onClick={() => setShowCreate(false)}>Отмена</button>
                            <button className={styles.btnPrimary} onClick={handleCreate} disabled={creating || !formName.trim()}>
                                {creating ? 'Создаём...' : 'Создать инстанс'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Schools list + detail panel */}
            <div style={{ display: 'flex', gap: 20 }}>
                {/* Left: schools list */}
                <div style={{ flex: selectedSchool ? '0 0 380px' : '1' }}>
                    {schools.length === 0 ? (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>🏫</div>
                            <span className={styles.emptyText}>Нет зарегистрированных школ</span>
                            <span className={styles.emptyHint}>Создайте первый инстанс выше</span>
                        </div>
                    ) : (
                        schools.map(school => (
                            <div
                                key={school.id}
                                className={styles.schoolRow}
                                style={{
                                    cursor: 'pointer',
                                    borderColor: selectedSchool === school.id ? 'rgba(139,92,246,0.5)' : undefined,
                                    background: selectedSchool === school.id ? 'rgba(139,92,246,0.05)' : undefined,
                                }}
                                onClick={() => loadSchoolDetail(school.id)}
                            >
                                <div className={styles.schoolInfo}>
                                    <div className={styles.schoolAvatar}>{school.name.charAt(0)}</div>
                                    <div className={styles.schoolMeta}>
                                        <span className={styles.schoolName}>{school.name}</span>
                                        <span className={styles.schoolDetail}>
                                            {school.timezone} · 👥 {school.users_count} · 🎓 {school.students_count} · 📚 {school.classes_count} кл.
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span className={`${styles.badge} ${school.is_active ? styles.active : styles.inactive}`}>
                                        {school.is_active ? '● Активна' : '● Стоп'}
                                    </span>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Right: school detail panel */}
                {selectedSchool && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                        {detailLoading ? (
                            <div className={styles.loadingScreen}><div className={styles.spinner} /></div>
                        ) : schoolDetail ? (
                            <div>
                                <div className={styles.card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <div className={styles.cardTitle} style={{ marginBottom: 0 }}>
                                            📊 {schoolDetail.school.name}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {schools.find(s => s.id === selectedSchool)?.is_active ? (
                                                <button className={styles.btnDanger} onClick={() => handleToggle(selectedSchool, true)}>Приостановить</button>
                                            ) : (
                                                <button className={styles.btnSuccess} onClick={() => handleToggle(selectedSchool, false)}>Активировать</button>
                                            )}
                                            <button className={styles.btnSecondary} onClick={() => { setSelectedSchool(null); setSchoolDetail(null); }}>✕</button>
                                        </div>
                                    </div>

                                    <div className={styles.metricsGrid} style={{ marginBottom: 0 }}>
                                        <div className={styles.metricCard}>
                                            <span className={styles.metricLabel}>Пользователей</span>
                                            <span className={styles.metricValue}>{schoolDetail.stats.users}</span>
                                        </div>
                                        <div className={styles.metricCard}>
                                            <span className={styles.metricLabel}>Учеников</span>
                                            <span className={styles.metricValue}>{schoolDetail.stats.students}</span>
                                        </div>
                                        <div className={styles.metricCard}>
                                            <span className={styles.metricLabel}>Учителей</span>
                                            <span className={styles.metricValue}>{schoolDetail.stats.teachers}</span>
                                        </div>
                                        <div className={styles.metricCard}>
                                            <span className={styles.metricLabel}>Классов</span>
                                            <span className={styles.metricValue}>{schoolDetail.stats.classes}</span>
                                        </div>
                                        <div className={styles.metricCard}>
                                            <span className={styles.metricLabel}>Предметов</span>
                                            <span className={styles.metricValue}>{schoolDetail.stats.subjects}</span>
                                        </div>
                                        {schoolDetail.stats.avg_grade !== undefined && (
                                            <div className={styles.metricCard}>
                                                <span className={styles.metricLabel}>Ср. балл (30 дн.)</span>
                                                <span className={styles.metricValue} style={{
                                                    color: schoolDetail.stats.avg_grade >= 4 ? '#2ecc71' : schoolDetail.stats.avg_grade >= 3 ? '#f1c40f' : '#e74c3c',
                                                }}>
                                                    {schoolDetail.stats.avg_grade ? schoolDetail.stats.avg_grade.toFixed(2) : '—'}
                                                </span>
                                            </div>
                                        )}
                                        {schoolDetail.stats.grades_count !== undefined && (
                                            <div className={styles.metricCard}>
                                                <span className={styles.metricLabel}>Оценок (30 дн.)</span>
                                                <span className={styles.metricValue}>{schoolDetail.stats.grades_count}</span>
                                            </div>
                                        )}
                                        {schoolDetail.stats.lvk_distributed !== undefined && (
                                            <div className={styles.metricCard}>
                                                <span className={styles.metricLabel}>Раздано LVK</span>
                                                <span className={styles.metricValue} style={{ color: '#2ecc71' }}>+{schoolDetail.stats.lvk_distributed}</span>
                                            </div>
                                        )}
                                        {schoolDetail.stats.lvk_spent !== undefined && (
                                            <div className={styles.metricCard}>
                                                <span className={styles.metricLabel}>Потрачено LVK</span>
                                                <span className={styles.metricValue} style={{ color: '#e74c3c' }}>−{schoolDetail.stats.lvk_spent}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Производительность по классам */}
                                {schoolDetail.class_performance && schoolDetail.class_performance.length > 0 && (
                                    <div className={styles.card}>
                                        <div className={styles.cardTitle}>Успеваемость по классам (30 дн.)</div>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                                <thead>
                                                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', textAlign: 'left' }}>
                                                        <th style={{ padding: '6px 4px' }}>Класс</th>
                                                        <th style={{ padding: '6px 4px' }}>Параллель</th>
                                                        <th style={{ padding: '6px 4px', textAlign: 'right' }}>Ср. балл</th>
                                                        <th style={{ padding: '6px 4px', textAlign: 'right' }}>Оценок</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {schoolDetail.class_performance.map(c => (
                                                        <tr key={c.class_id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                            <td style={{ padding: '6px 4px' }}>{c.class_name}</td>
                                                            <td style={{ padding: '6px 4px' }}>{c.grade_level ?? '—'}</td>
                                                            <td style={{
                                                                padding: '6px 4px', textAlign: 'right',
                                                                color: c.avg_grade >= 4 ? '#2ecc71' : c.avg_grade >= 3 ? '#f1c40f' : c.avg_grade > 0 ? '#e74c3c' : 'var(--text-muted)',
                                                            }}>
                                                                {c.avg_grade > 0 ? c.avg_grade.toFixed(2) : '—'}
                                                            </td>
                                                            <td style={{ padding: '6px 4px', textAlign: 'right' }}>{c.grades_count}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Активность учителей */}
                                {schoolDetail.teacher_activity && schoolDetail.teacher_activity.length > 0 && (
                                    <div className={styles.card}>
                                        <div className={styles.cardTitle}>Топ учителей по числу оценок</div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                                            <tbody>
                                                {schoolDetail.teacher_activity.map(t => (
                                                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                                        <td style={{ padding: '6px 4px' }}>{t.name}</td>
                                                        <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>{t.grades_given}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Admins */}
                                <div className={styles.card}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                                        <div className={styles.cardTitle} style={{ marginBottom: 0 }}>👤 Администраторы школы</div>
                                        <button className={styles.btnPrimary} onClick={() => setShowRegAdmin(!showRegAdmin)}>
                                            {showRegAdmin ? '✕ Отмена' : '+ Назначить админа'}
                                        </button>
                                    </div>

                                    {showRegAdmin && (
                                        <div style={{ padding: 16, background: 'var(--bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', marginBottom: 16 }}>
                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label>Логин *</label>
                                                    <input className={styles.formInput} value={regForm.login} onChange={e => setRegForm({ ...regForm, login: e.target.value })} placeholder="director42" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Пароль *</label>
                                                    <input className={styles.formInput} value={regForm.password} onChange={e => setRegForm({ ...regForm, password: e.target.value })} placeholder="••••••••" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Роль</label>
                                                    <select className={styles.formSelect} value={regForm.role} onChange={e => setRegForm({ ...regForm, role: e.target.value })}>
                                                        <option value="admin">Администратор</option>
                                                        <option value="school_admin">Завуч</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className={styles.formRow}>
                                                <div className={styles.formGroup}>
                                                    <label>Фамилия *</label>
                                                    <input className={styles.formInput} value={regForm.last_name} onChange={e => setRegForm({ ...regForm, last_name: e.target.value })} placeholder="Иванов" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Имя *</label>
                                                    <input className={styles.formInput} value={regForm.first_name} onChange={e => setRegForm({ ...regForm, first_name: e.target.value })} placeholder="Пётр" />
                                                </div>
                                                <div className={styles.formGroup}>
                                                    <label>Отчество</label>
                                                    <input className={styles.formInput} value={regForm.patronymic} onChange={e => setRegForm({ ...regForm, patronymic: e.target.value })} placeholder="Сергеевич" />
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                                                <button className={styles.btnSecondary} onClick={() => setShowRegAdmin(false)}>Отмена</button>
                                                <button className={styles.btnPrimary} onClick={handleRegisterAdmin} disabled={registering || !regForm.login || !regForm.password || !regForm.first_name || !regForm.last_name}>
                                                    {registering ? 'Создаём...' : 'Зарегистрировать'}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {schoolDetail.admins.length > 0 ? (
                                        schoolDetail.admins.map(a => (
                                            <div key={a.id} className={styles.schoolRow}>
                                                <div className={styles.schoolInfo}>
                                                    <div className={styles.schoolAvatar}>{(a.name || a.login).charAt(0)}</div>
                                                    <div className={styles.schoolMeta}>
                                                        <span className={styles.schoolName}>{a.name || a.login}</span>
                                                        <span className={styles.schoolDetail}>
                                                            @{a.login} · {a.role === 'admin' ? 'Администратор' : 'Завуч'}
                                                            {a.last_login ? ` · Последний вход: ${new Date(a.last_login).toLocaleDateString('ru-RU')}` : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className={`${styles.badge} ${styles.active}`}>{a.role}</span>
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                                            Нет назначенных администраторов. Нажмите «+ Назначить админа».
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </div>
                )}
            </div>
        </div>
    );
}
