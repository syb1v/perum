
'use client';

import { useState, useEffect } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';

interface RegisterUser {
    last_name: string;
    first_name: string;
    patronymic: string;
    login: string;
    password: string;
}

interface ClassData {
    id: number;
    name: string;
}

interface RegisterResult {
    last_name: string;
    first_name: string;
    patronymic: string;
    login: string;
    password: string;
    created: boolean;
}

interface RegisterResponse {
    message: string;
    users: RegisterResult[];
}

export default function Registration() {
    const { showSuccess, showError, showWarning } = useToast();
    const [role, setRole] = useState('student');
    const [classes, setClasses] = useState<ClassData[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [rows, setRows] = useState<RegisterUser[]>([]);
    const [results, setResults] = useState<RegisterResult[]>([]);
    const [loading, setLoading] = useState(false);

    // Initial fetch for classes
    useEffect(() => {
        const fetchClasses = async () => {
            try {
                const res = await api.get<{ classes: ClassData[] }>('/admin/classes');
                setClasses(res.classes);
            } catch (err) {
                console.error(err);
            }
        };
        fetchClasses();
    }, []);

    const generateLogin = (currentRole: string, classId: string, index: number) => {
        const rolePrefix = currentRole.substring(0, 3);
        let classPart = '';
        if (currentRole === 'student' && classId) {
            const cls = classes.find(c => c.id.toString() === classId);
            if (cls) classPart = `_${cls.name}`;
        }
        const uniqueId = Math.random().toString(36).substring(2, 6);
        return `${rolePrefix}${classPart}_${index + 1}_${uniqueId}`.toLowerCase();
    };

    const generatePassword = () => {
        // Генерируем пароль ОДИН РАЗ при создании строки, больше не меняем
        const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    };

    // Initialize first row on mount
    useEffect(() => {
        setRows([
            { last_name: '', first_name: '', patronymic: '', login: generateLogin(role, selectedClassId, 0), password: generatePassword() }
        ]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // При смене роли или класса — обновляем ТОЛЬКО логины, пароли НЕ трогаем
    useEffect(() => {
        setRows(prevRows => {
            if (prevRows.length === 0) return prevRows;
            return prevRows.map((r, i) => ({
                ...r,
                login: generateLogin(role, selectedClassId, i),
                // password намеренно НЕ обновляется
            }));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [role, selectedClassId, classes]);

    const addRow = () => {
        setRows([...rows, {
            last_name: '', first_name: '', patronymic: '',
            login: generateLogin(role, selectedClassId, rows.length),
            password: generatePassword(),
        }]);
    };

    const removeRow = (index: number) => {
        if (rows.length === 1) return;
        setRows(rows.filter((_, i) => i !== index));
    };

    const updateRow = (index: number, field: keyof RegisterUser, value: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        setRows(newRows);
    };

    const handleRegister = async () => {
        // Filter empty rows
        const validUsers = rows.filter(u => u.last_name.trim() && u.first_name.trim());

        if (validUsers.length === 0) {
            showWarning('Заполните хотя бы одну строку (Фамилия и Имя обязательны)');
            return;
        }

        setLoading(true);
        try {
            const usersPayload = validUsers.map(u => ({
                ...u,
                role,
                ...(role === 'student' && selectedClassId ? { class_id: parseInt(selectedClassId) } : {})
            }));

            const res = await api.post<RegisterResponse>('/admin/register-users', { users: usersPayload });
            setResults(res.users);
            showSuccess(res.message);
            // Reset form
            setRows([{ last_name: '', first_name: '', patronymic: '', login: generateLogin(role, selectedClassId, 0), password: generatePassword() }]);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка регистрации');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        showSuccess('Скопировано!');
    };

    const exportCSV = () => {
        if (!results.length) return;
        const csv = 'ФИО,Логин,Пароль\n' + results.map(u =>
            `"${[u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ')}","${u.login}","${u.password}"`
        ).join('\n');

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `users_${new Date().toISOString().slice(0, 10)}.csv`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 100);
    };

    return (
        <div>
            <div className={styles.card}>
                <div className={styles.sectionHeader}>
                    <h2>Массовая регистрация пользователей</h2>
                </div>

                <div className={styles.registerOptions}>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                        <div>
                            <label>Роль:</label>
                            <select value={role} onChange={(e) => setRole(e.target.value)}>
                                <option value="student">Ученик</option>
                                <option value="teacher">Учитель</option>
                                <option value="class_teacher">Классный руководитель</option>
                                <option value="parent">Родитель</option>
                                <option value="admin">Администратор</option>
                            </select>
                        </div>

                        {role === 'student' && (
                            <div>
                                <label>Класс (опционально):</label>
                                <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
                                    <option value="">Не выбран</option>
                                    {classes.map(c => (
                                        <option key={c.id} value={c.id.toString()}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>
                </div>

                <p className={styles.description}>
                    Введите данные пользователей в таблицу ниже. Логины и пароли будут сгенерированы автоматически.
                </p>

                <div className={styles.inputTableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '40px' }}>№</th>
                                <th>Фамилия *</th>
                                <th>Имя *</th>
                                <th>Отчество</th>
                                <th>Логин *</th>
                                <th>Пароль *</th>
                                <th style={{ width: '40px' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row, index) => (
                                <tr key={index}>
                                    <td className={styles.rowNum}>{index + 1}</td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Фамилия"
                                            value={row.last_name}
                                            onChange={(e) => updateRow(index, 'last_name', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Имя"
                                            value={row.first_name}
                                            onChange={(e) => updateRow(index, 'first_name', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Отчество"
                                            value={row.patronymic}
                                            onChange={(e) => updateRow(index, 'patronymic', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Логин"
                                            value={row.login}
                                            onChange={(e) => updateRow(index, 'login', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            type="text"
                                            placeholder="Пароль"
                                            value={row.password}
                                            onChange={(e) => updateRow(index, 'password', e.target.value)}
                                        />
                                    </td>
                                    <td>
                                        <button className={styles.removeRowBtn} onClick={() => removeRow(index)} tabIndex={-1}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className={styles.registerActions}>
                    <button className={styles.btnSecondary} onClick={addRow}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Добавить строку
                    </button>
                    <button className={styles.btnPrimary} onClick={handleRegister} disabled={loading}>
                        {loading ? 'Регистрация...' : 'Зарегистрировать'}
                    </button>
                </div>
            </div>

            {results.length > 0 && (
                <div className={styles.card}>
                    <div className={styles.sectionHeader} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <h3>Результаты регистрации</h3>
                        <button className={styles.btnSecondary} onClick={exportCSV}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Экспорт CSV
                        </button>
                    </div>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ФИО</th>
                                    <th>Логин</th>
                                    <th>Пароль</th>
                                    <th>Статус</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((u, i) => (
                                    <tr key={i}>
                                        <td>{[u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ')}</td>
                                        <td>
                                            <code className={styles.code}>{u.login}</code>
                                            <button className={styles.copyBtn} onClick={() => copyToClipboard(u.login)}>📋</button>
                                        </td>
                                        <td>
                                            {u.created ? (
                                                <>
                                                    <code className={styles.code}>{u.password}</code>
                                                    <button className={styles.copyBtn} onClick={() => copyToClipboard(u.password)}>📋</button>
                                                </>
                                            ) : (
                                                <span className={styles.labelMuted}>Ошибка</span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`${styles.statusBadge} ${u.created ? styles.success : styles.error}`}>
                                                {u.created ? '✓' : '✗'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
