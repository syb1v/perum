import { useState, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import apiClient from '@/lib/apiClient';
import styles from './ExchangeManagement.module.css';

interface TradingWindow {
    id: number;
    week_number: number;
    academic_year: number;
    opens_at: string;
    closes_at: string;
    is_active: boolean;
    created_at: string;
}

interface InvestmentAdmin {
    id: number;
    user: {
        id: number | null;
        login: string;
        first_name: string | null;
        last_name: string | null;
    };
    subject: string;
    amount: number;
    week_number: number;
    status: string;
    result_amount: number | null;
    created_at: string;
}

interface AdminExchangeLog {
    id: number;
    user: {
        id: number | null;
        login: string;
        first_name: string | null;
        last_name: string | null;
    };
    action: string;
    amount: number;
    price: number | null;
    created_at: string;
    subject: string;
}

interface ExchangeSettings {
    open_day: number;
    open_time: string;
    close_day: number;
    close_time: string;
    calc_day: number;
    calc_time: string;
}

const daysOptions = [
    { value: 1, label: 'Понедельник' },
    { value: 2, label: 'Вторник' },
    { value: 3, label: 'Среда' },
    { value: 4, label: 'Четверг' },
    { value: 5, label: 'Пятница' },
    { value: 6, label: 'Суббота' },
    { value: 7, label: 'Воскресенье' }
];

export default function ExchangeManagement() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [windows, setWindows] = useState<TradingWindow[]>([]);
    const [investments, setInvestments] = useState<InvestmentAdmin[]>([]);
    const [logs, setLogs] = useState<AdminExchangeLog[]>([]);
    const [settings, setSettings] = useState<ExchangeSettings | null>(null);
    const [savingSettings, setSavingSettings] = useState(false);
    const [loading, setLoading] = useState(true);
    const [subjects, setSubjects] = useState<any[]>([]);

    useEffect(() => {
        if (user) {
            fetchData();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [windowsRes, invRes, settingsRes, logsRes, subjectsRes] = await Promise.all([
                apiClient.get<TradingWindow[]>('/exchange/admin/windows'),
                apiClient.get<InvestmentAdmin[]>('/exchange/admin/investments?limit=20'),
                apiClient.get<ExchangeSettings>('/exchange/admin/settings'),
                apiClient.get<AdminExchangeLog[]>('/exchange/admin/logs?limit=50'),
                apiClient.get<{subjects: any[]}>('/admin/subjects')
            ]);
            setWindows(windowsRes || []);
            setInvestments(invRes || []);
            setSettings(settingsRes || null);
            setLogs(logsRes || []);
            setSubjects(subjectsRes?.subjects || []);
        } catch (error) {
            console.error('Failed to fetch exchange admin data:', error);
            showToast('Ошибка при загрузке данных биржи', 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateSubject = async (subjectId: number, field: string, value: any) => {
        try {
            await apiClient.put(`/admin/subjects/${subjectId}`, { [field]: value });
            setSubjects(prev => prev.map(s => s.id === subjectId ? { ...s, [field]: value } : s));
            showToast('Предмет обновлен', 'success');
        } catch (err) {
            console.error('Update err', err);
            showToast('Ошибка обновления', 'error');
        }
    };

    const handleToggleWindow = async (windowId: number, currentStatus: boolean) => {
        try {
            await apiClient.post(`/exchange/admin/windows/${windowId}/toggle`, {
                is_active: !currentStatus
            });
            if (!currentStatus) {
                await apiClient.post('/admin/subjects/enable-all-exchange');
            }
            showToast(`Окно торгов ${!currentStatus ? 'открыто' : 'закрыто'}`, 'success');
            fetchData();
        } catch (error) {
            console.error('Failed to toggle window:', error);
            showToast('Ошибка при изменении статуса окна', 'error');
        }
    };

    const handleEnableAllSubjects = async () => {
        try {
            await apiClient.post('/admin/subjects/enable-all-exchange');
            showToast('Все предметы включены для торгов', 'success');
            fetchData();
        } catch (err) {
            console.error('Enable all err', err);
            showToast('Ошибка включения предметов', 'error');
        }
    };

    const handleCalculateResults = async () => {
        if (!confirm('Вы уверены, что хотите запустить расчет результатов для текущей недели?')) return;

        try {
            const res = await apiClient.post<{ processed: number }>('/exchange/calculate-results');
            const processedCount = res?.processed ?? 0;
            showToast(`Расчет завершен. Обработано вкладов: ${processedCount}`, 'success');
            fetchData();
        } catch (error) {
            console.error('Failed to calculate results:', error);
            showToast('Ошибка при расчете результатов', 'error');
        }
    };

    const handleRefundSingle = async (investmentId: number) => {
        if (!confirm('Вернуть этот вклад?')) return;
        try {
            await apiClient.post(`/exchange/admin/investments/${investmentId}/refund`);
            showToast('Вклад возвращён', 'success');
            fetchData();
        } catch (error) {
            console.error('Failed to refund:', error);
            showToast('Ошибка при возврате вклада', 'error');
        }
    };

    const handleRefundAll = async () => {
        if (!confirm('Вы уверены, что хотите вернуть ВСЕ активные вклады? Средства будут возвращены на баланс.')) return;
        try {
            const res = await apiClient.post<{ refunded_count: number; message: string }>('/exchange/admin/investments/refund-all');
            showToast(res?.message || 'Все вклады возвращены', 'success');
            fetchData();
        } catch (error) {
            console.error('Failed to refund all:', error);
            showToast('Ошибка при массовом возврате', 'error');
        }
    };

    const handleSaveSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!settings) return;

        setSavingSettings(true);
        try {
            await apiClient.put('/exchange/admin/settings', settings);
            showToast('Настройки автоматизации сохранены', 'success');
        } catch (err) {
            console.error("Failed to save settings:", err);
            showToast('Ошибка при сохранении настроек', 'error');
        } finally {
            setSavingSettings(false);
        }
    };

    if (loading) {
        return <div className={styles.loading}>Загрузка данных биржи...</div>;
    }

    const currentWindow = windows && windows.length > 0 ? windows[0] : null;

    return (
        <div className={styles.exchangeContainer}>
            <div className={styles.headerControls}>
                <h2 className={styles.sectionTitle}>Управление биржей</h2>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className={styles.btnAction} onClick={handleCalculateResults}>
                        Запустить расчет недели
                    </button>
                    <button className={styles.btnAction} onClick={handleRefundAll} style={{ background: '#ef4444' }}>
                        Вернуть все вклады
                    </button>
                </div>
            </div>

            <div className={styles.gridContainer}>
                <div className={styles.leftColumn}>
                    {/* Windows Card */}
                    <div className={styles.card}>
                        <h3 className={styles.cardTitle}>Текущее окно торгов</h3>
                        {currentWindow ? (
                            <div className={styles.windowInfo}>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Неделя / Год:</span>
                                    <span className={styles.infoValue}>{currentWindow.week_number} / {currentWindow.academic_year}</span>
                                </div>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Статус:</span>
                                    <span className={`${styles.statusBadge} ${currentWindow.is_active ? styles.open : styles.closed}`}>
                                        {currentWindow.is_active ? 'Открыто' : 'Закрыто'}
                                    </span>
                                </div>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Открытие:</span>
                                    <span className={styles.infoValue}>{new Date(currentWindow.opens_at).toLocaleString('ru-RU')}</span>
                                </div>
                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Закрытие:</span>
                                    <span className={styles.infoValue}>{new Date(currentWindow.closes_at).toLocaleString('ru-RU')}</span>
                                </div>

                                <button
                                    className={`${styles.btnToggle} ${currentWindow.is_active ? styles.btnDanger : styles.btnSuccess}`}
                                    onClick={() => handleToggleWindow(currentWindow.id, currentWindow.is_active)}
                                >
                                    {currentWindow.is_active ? 'Закрыть торги' : 'Открыть торги'}
                                </button>
                            </div>
                        ) : (
                            <p className={styles.emptyText}>Окно торгов не найдено для текущей недели.</p>
                        )}
                    </div>

                    {/* Settings Card */}
                    {settings && (
                        <div className={styles.card}>
                            <h3 className={styles.cardTitle}>Настройки автоматизации</h3>
                            <form onSubmit={handleSaveSettings}>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>День открытия</label>
                                        <select
                                            value={settings.open_day}
                                            onChange={(e) => setSettings({ ...settings, open_day: Number(e.target.value) })}
                                            required
                                        >
                                            {daysOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Время открытия</label>
                                        <input
                                            type="time"
                                            value={settings.open_time}
                                            onChange={(e) => setSettings({ ...settings, open_time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>День закрытия</label>
                                        <select
                                            value={settings.close_day}
                                            onChange={(e) => setSettings({ ...settings, close_day: Number(e.target.value) })}
                                            required
                                        >
                                            {daysOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Время закрытия</label>
                                        <input
                                            type="time"
                                            value={settings.close_time}
                                            onChange={(e) => setSettings({ ...settings, close_time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <div className={styles.formGrid}>
                                    <div className={styles.formGroup}>
                                        <label>День авторасчёта</label>
                                        <select
                                            value={settings.calc_day}
                                            onChange={(e) => setSettings({ ...settings, calc_day: Number(e.target.value) })}
                                            required
                                        >
                                            {daysOptions.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                                        </select>
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label>Время авторасчёта</label>
                                        <input
                                            type="time"
                                            value={settings.calc_time}
                                            onChange={(e) => setSettings({ ...settings, calc_time: e.target.value })}
                                            required
                                        />
                                    </div>
                                </div>

                                <button type="submit" className={styles.btnSave} disabled={savingSettings}>
                                    {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
                                </button>
                            </form>
                        </div>
                    )}
                </div>

                {/* Subjects Management */}
                <div className={styles.card} style={{ marginTop: '20px' }}>
                    <h3 className={styles.cardTitle}>
                        Настройка предметов биржи
                        <button
                            className={styles.btnAction}
                            style={{ marginLeft: '16px', fontSize: '0.8rem', padding: '4px 12px' }}
                            onClick={handleEnableAllSubjects}
                        >
                            Включить все предметы для торгов
                        </button>
                    </h3>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Предмет</th>
                                    <th>Участвует в торгах</th>
                                    <th>Коэффициент профита</th>
                                </tr>
                            </thead>
                            <tbody>
                                {subjects.map(s => (
                                    <tr key={s.id}>
                                        <td>{s.name}</td>
                                        <td>
                                            <input 
                                                type="checkbox" 
                                                checked={s.in_exchange} 
                                                onChange={(e) => handleUpdateSubject(s.id, 'in_exchange', e.target.checked)}
                                            />
                                        </td>
                                        <td>
                                            <input 
                                                type="number" 
                                                step="0.1" 
                                                min="0.1"
                                                value={s.exchange_coefficient || 1.0} 
                                                onChange={(e) => handleUpdateSubject(s.id, 'exchange_coefficient', parseFloat(e.target.value))}
                                                style={{ width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #ccc' }}
                                            />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Recent Investments */}
                <div className={styles.card} style={{ marginTop: '20px' }}>
                    <h3 className={styles.cardTitle}>Последние активности (20)</h3>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Игрок</th>
                                    <th>Предмет</th>
                                    <th>Сумма</th>
                                    <th>Статус</th>
                                    <th>Результат</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {investments.length > 0 ? investments.map(inv => (
                                    <tr key={inv.id}>
                                        <td>
                                            <div className={styles.userInfo}>
                                                <span className={styles.userName}>
                                                    {inv.user.first_name || inv.user.login} {inv.user.last_name || ''}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{inv.subject}</td>
                                        <td>{inv.amount} лив.</td>
                                        <td>
                                            <span className={`${styles.invStatus} ${styles[inv.status]}`}>
                                                {inv.status === 'active' ? 'Активен' :
                                                    inv.status === 'completed' ? 'Завершен' : 'Отменен'}
                                            </span>
                                        </td>
                                        <td>
                                            {inv.result_amount !== null ? (
                                                <span className={inv.result_amount > inv.amount ? styles.profit : inv.result_amount < inv.amount ? styles.loss : ''}>
                                                    {inv.result_amount}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            {inv.status === 'active' && (
                                                <button
                                                    className={styles.btnToggle}
                                                    style={{ fontSize: '0.75rem', padding: '4px 10px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                                                    onClick={() => handleRefundSingle(inv.id)}
                                                >
                                                    Вернуть
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={6} className={styles.emptyTextCenter}>Нет недавних вкладов</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Exchange Logs */}
                <div className={styles.card} style={{ marginTop: '20px' }}>
                    <h3 className={styles.cardTitle}>Логи биржи (Последние 50 операций)</h3>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Дата</th>
                                    <th>Игрок</th>
                                    <th>Предмет</th>
                                    <th>Действие</th>
                                    <th>Сумма / Индекс</th>
                                </tr>
                            </thead>
                            <tbody>
                                {logs.length > 0 ? logs.map(log => {
                                    let actionLabel = 'Неизвестно';
                                    let badgeClass = styles.neutral;

                                    if (log.action === 'invest') {
                                        actionLabel = 'Вклад';
                                        badgeClass = styles.negative; // Ливки ушли
                                    } else if (log.action === 'cancel') {
                                        actionLabel = 'Отмена';
                                        badgeClass = styles.positive; // Ливки вернулись
                                    } else if (log.action === 'dividend') {
                                        actionLabel = 'Расчет';
                                        badgeClass = styles.positive; // Ливки начислены
                                    }

                                    return (
                                        <tr key={log.id}>
                                            <td>{new Date(log.created_at).toLocaleString('ru-RU')}</td>
                                            <td>
                                                <div className={styles.userInfo}>
                                                    <span className={styles.userName}>
                                                        {log.user.first_name || log.user.login} {log.user.last_name || ''}
                                                    </span>
                                                </div>
                                            </td>
                                            <td>{log.subject}</td>
                                            <td>
                                                <span className={`${styles.invStatus} ${badgeClass}`}>
                                                    {actionLabel}
                                                </span>
                                            </td>
                                            <td>
                                                {log.action === 'invest' ? '-' : '+'}{log.amount} лив.
                                                {log.price !== null && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Индекс: {log.price.toFixed(2)}</div>}
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr>
                                        <td colSpan={5} className={styles.emptyTextCenter}>Логи отсутствуют</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
