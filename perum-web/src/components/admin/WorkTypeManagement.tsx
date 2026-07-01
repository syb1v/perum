import { useState, useEffect } from 'react';
import styles from '@/app/admin/page.module.css';
import api from '@/lib/apiClient';
import WorkTypeModal from './modals/WorkTypeModal';

interface WorkType {
    id: number;
    name: string;
    weight: number;
    is_active: boolean;
}

export default function WorkTypeManagement() {
    const [workTypes, setWorkTypes] = useState<WorkType[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalWorkType, setModalWorkType] = useState<WorkType | null>(null);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const res = await api.get<{ success: boolean; work_types: WorkType[] }>('/admin/work-types');
            setWorkTypes(res.work_types);
            setError('');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при загрузке видов работ');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Вы уверены, что хотите удалить этот вид работы?')) return;
        try {
            await api.del(`/admin/work-types/${id}`);
            fetchData();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Ошибка при удалении');
        }
    };

    const handleAdd = () => {
        setModalWorkType(null);
        setIsModalOpen(true);
    };

    const editWorkType = (wt: WorkType) => {
        setModalWorkType(wt);
        setIsModalOpen(true);
    };

    if (isLoading) return <div className={styles.loading}>Загрузка...</div>;

    return (
        <div className={styles.managementSection}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
                <button onClick={handleAdd} className={styles.submitBtn}>
                    + Добавить вид работы
                </button>
            </div>

            {error && <div className={styles.errorBanner}>{error}</div>}

            <div className={styles.card}>
                <h2 className={styles.cardTitle}>Список видов работ</h2>

                <div className={styles.tableWrapper}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Название</th>
                                <th>Вес</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {workTypes.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className={styles.emptyState}>
                                        Виды работ не найдены
                                    </td>
                                </tr>
                            ) : (
                                workTypes.map((wt) => (
                                    <tr key={wt.id}>
                                        <td>{wt.name}</td>
                                        <td>{wt.weight.toFixed(1)}</td>
                                        <td>
                                            <span className={wt.is_active ? styles.statusActive : styles.statusInactive}>
                                                {wt.is_active ? 'Активен' : 'Неактивен'}
                                            </span>
                                        </td>
                                        <td className={styles.actionsCell}>
                                            <button
                                                onClick={() => editWorkType(wt)}
                                                className={styles.actionBtn}
                                                title="Редактировать"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                onClick={() => handleDelete(wt.id)}
                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                title="Удалить"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <WorkTypeModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                workType={modalWorkType}
                onSaved={() => fetchData()}
            />
        </div>
    );
}
