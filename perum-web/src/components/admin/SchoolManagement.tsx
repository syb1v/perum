'use client';

import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

interface School {
    id: number;
    name: string;
    is_active: boolean;
    students_count: number;
    teachers_count: number;
    classes_count: number;
}

interface SchoolAdmin {
    id: number;
    login: string;
    first_name: string | null;
    last_name: string | null;
    role: string;
    is_active: boolean;
}

/**
 * Консоль org_admin: управление ШКОЛАМИ организации и АДМИНАМИ каждой школы.
 * org_admin не заходит внутрь школы — внутришкольную работу ведёт school_admin.
 */
export default function SchoolManagement() {
    const [schools, setSchools] = useState<School[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isEditing, setIsEditing] = useState<number | null>(null);
    const [name, setName] = useState('');
    const [isActive, setIsActive] = useState(true);

    // Раскрытая школа → её админы.
    const [expanded, setExpanded] = useState<number | null>(null);
    const [admins, setAdmins] = useState<SchoolAdmin[]>([]);
    const [adminForm, setAdminForm] = useState({ login: '', password: '', first_name: '', last_name: '' });

    const fetchSchools = async () => {
        try {
            setIsLoading(true);
            const res = await api.get<{ schools: School[] }>('/admin/schools');
            setSchools(res.schools || []);
            setError('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при загрузке школ');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => { fetchSchools(); }, []);

    const resetForm = () => { setIsEditing(null); setName(''); setIsActive(true); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEditing) await api.put(`/admin/schools/${isEditing}`, { name, is_active: isActive });
            else await api.post('/admin/schools', { name });
            resetForm();
            fetchSchools();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при сохранении');
        }
    };

    const editSchool = (s: School) => { setIsEditing(s.id); setName(s.name); setIsActive(s.is_active); };

    const handleDelete = async (s: School) => {
        if (!confirm(`Удалить школу «${s.name}»? Возможно только если в ней нет пользователей и классов.`)) return;
        try { await api.del(`/admin/schools/${s.id}`); fetchSchools(); }
        catch (err) { setError(err instanceof Error ? err.message : 'Ошибка при удалении'); }
    };

    const loadAdmins = async (schoolId: number) => {
        try {
            const res = await api.get<{ admins: SchoolAdmin[] }>(`/admin/schools/${schoolId}/admins`);
            setAdmins(res.admins || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при загрузке администраторов');
        }
    };

    const toggleAdmins = async (schoolId: number) => {
        if (expanded === schoolId) { setExpanded(null); return; }
        setExpanded(schoolId);
        setAdminForm({ login: '', password: '', first_name: '', last_name: '' });
        await loadAdmins(schoolId);
    };

    const addAdmin = async (schoolId: number, e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.post(`/admin/schools/${schoolId}/admins`, adminForm);
            setAdminForm({ login: '', password: '', first_name: '', last_name: '' });
            await loadAdmins(schoolId);
            fetchSchools();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Ошибка при создании администратора');
        }
    };

    const removeAdmin = async (schoolId: number, userId: number) => {
        if (!confirm('Снять этого администратора школы?')) return;
        try { await api.del(`/admin/schools/${schoolId}/admins/${userId}`); await loadAdmins(schoolId); }
        catch (err) { setError(err instanceof Error ? err.message : 'Ошибка при снятии администратора'); }
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>{isEditing ? 'Редактировать школу' : 'Добавить школу'}</h2>
                {error && <div className={styles.errorBanner}>{error}</div>}
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGroup}>
                        <label className={styles.label}>Название школы</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                            className={styles.input} placeholder="Напр. Гимназия №5" required />
                    </div>
                    {isEditing && (
                        <div className={styles.checkboxGroup}>
                            <div className={styles.customCheckbox}>
                                <input type="checkbox" id="schoolActive" checked={isActive}
                                    onChange={(e) => setIsActive(e.target.checked)} />
                                <label htmlFor="schoolActive">Школа активна</label>
                            </div>
                        </div>
                    )}
                    <div className={styles.formActions}>
                        {isEditing && <button type="button" onClick={resetForm} className={styles.cancelBtn}>Отмена</button>}
                        <button type="submit" className={styles.submitBtn}>{isEditing ? 'Сохранить' : 'Добавить школу'}</button>
                    </div>
                </form>
            </div>

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Школы организации</h2>
                <p style={{ color: '#64748b', marginBottom: '1rem', fontSize: '0.9rem' }}>
                    Вы управляете школами и их администраторами. Внутреннюю работу школы (журнал, оценки,
                    пользователи, расписание) ведёт администратор школы в своём изолированном кабинете.
                </p>
                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название</th><th>Ученики</th><th>Учителя</th><th>Классы</th><th>Статус</th><th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {schools.length === 0 ? (
                                <tr><td colSpan={6} className={styles.emptyState}>Школы не найдены</td></tr>
                            ) : (
                                schools.map((s) => (
                                    <>
                                        <tr key={s.id}>
                                            <td style={{ fontWeight: 600 }}>{s.name}</td>
                                            <td>{s.students_count}</td>
                                            <td>{s.teachers_count}</td>
                                            <td>{s.classes_count}</td>
                                            <td>{s.is_active
                                                ? <span className={styles.statusActive}>Активна</span>
                                                : <span style={{ color: '#ef4444' }}>Неактивна</span>}</td>
                                            <td className={styles.actionsCell}>
                                                <button onClick={() => toggleAdmins(s.id)} className={styles.actionBtn}
                                                    style={{ color: '#3b82f6', fontSize: '13px' }}>
                                                    {expanded === s.id ? 'Скрыть админов' : 'Администраторы'}
                                                </button>
                                                <button onClick={() => editSchool(s)} className={styles.actionBtn} title="Редактировать">✏️</button>
                                                <button onClick={() => handleDelete(s)} className={`${styles.actionBtn} ${styles.deleteBtn}`} title="Удалить пустую школу">🗑️</button>
                                            </td>
                                        </tr>
                                        {expanded === s.id && (
                                            <tr key={`${s.id}-admins`}>
                                                <td colSpan={6} style={{ background: '#f8fafc' }}>
                                                    <div style={{ padding: '0.5rem 0.25rem' }}>
                                                        <strong>Администраторы школы «{s.name}»</strong>
                                                        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
                                                            {admins.length === 0 && <li style={{ color: '#94a3b8' }}>Пока нет администраторов</li>}
                                                            {admins.map((a) => (
                                                                <li key={a.id} style={{ marginBottom: '0.25rem' }}>
                                                                    {(a.last_name || '') + ' ' + (a.first_name || '')} — <code>{a.login}</code>
                                                                    {' '}({a.role})
                                                                    <button onClick={() => removeAdmin(s.id, a.id)}
                                                                        className={styles.actionBtn} style={{ color: '#ef4444', marginLeft: 8 }}>снять</button>
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        <form onSubmit={(e) => addAdmin(s.id, e)} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                                            <input className={styles.input} placeholder="Логин" required style={{ maxWidth: 140 }}
                                                                value={adminForm.login} onChange={(e) => setAdminForm({ ...adminForm, login: e.target.value })} />
                                                            <input className={styles.input} placeholder="Пароль" required style={{ maxWidth: 140 }}
                                                                value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
                                                            <input className={styles.input} placeholder="Имя" style={{ maxWidth: 120 }}
                                                                value={adminForm.first_name} onChange={(e) => setAdminForm({ ...adminForm, first_name: e.target.value })} />
                                                            <input className={styles.input} placeholder="Фамилия" style={{ maxWidth: 120 }}
                                                                value={adminForm.last_name} onChange={(e) => setAdminForm({ ...adminForm, last_name: e.target.value })} />
                                                            <button type="submit" className={styles.submitBtn}>Добавить админа</button>
                                                        </form>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
