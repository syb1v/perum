import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';

interface ControlWork {
    id: number;
    class_id: number;
    class_name: string;
    subject_id: number;
    subject_name: string;
    work_type: string;
    title: string | null;
    work_date: string;
}

export default function ControlWorksSection() {
    const [works, setWorks] = useState<ControlWork[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const fetchWorks = async () => {
        try {
            setIsLoading(true);
            const response = await api.get<{ control_works: ControlWork[] }>('/admin/control-works');
            setWorks(response.control_works);
            setError('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при загрузке данных');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchWorks();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите отменить эту контрольную работу?')) return;
        try {
            await api.del(`/admin/control-works/${id}`);
            fetchWorks();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при удалении');
        }
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div className={styles.card}>
                <h2 className={styles.cardTitle}>График контрольных и самостоятельных работ</h2>
                {error && <div className={styles.errorBanner}>{error}</div>}

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Класс</th>
                                <th>Предмет</th>
                                <th>Тип работы</th>
                                <th>Тема</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {works.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className={styles.emptyState}>
                                        Запланированных работ нет
                                    </td>
                                </tr>
                            ) : (
                                works.map((w) => (
                                    <tr key={w.id}>
                                        <td>{new Date(w.work_date).toLocaleDateString()}</td>
                                        <td>{w.class_name}</td>
                                        <td>{w.subject_name}</td>
                                        <td>
                                            <span style={{
                                                background: w.work_type === 'контрольная' ? '#fee2e2' : '#e0e7ff',
                                                color: w.work_type === 'контрольная' ? '#991b1b' : '#3730a3',
                                                padding: '2px 8px',
                                                borderRadius: '12px',
                                                fontSize: '12px'
                                            }}>
                                                {w.work_type}
                                            </span>
                                        </td>
                                        <td>{w.title || '—'}</td>
                                        <td className={styles.actionsCell}>
                                            <button
                                                onClick={() => handleDelete(w.id)}
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Отменить работу"
                                            >
                                                Отменить
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
