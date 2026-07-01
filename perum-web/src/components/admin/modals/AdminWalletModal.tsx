
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import styles from '@/components/modals/WalletHistoryModal.module.css'; // Reuse existing styles
import { User, Transaction } from '@/types';

interface AdminWalletModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | null;
}

interface WalletData {
    transactions: Transaction[];
    stats: {
        total_income: number;
        total_expense: number;
        total_count: number;
    };
}

export default function AdminWalletModal({ isOpen, onClose, user }: AdminWalletModalProps) {
    const { showError } = useToast();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<WalletData | null>(null);

    const fetchData = useCallback(async () => {
        if (!isOpen || !user) return;

        setLoading(true);
        try {
            const res = await api.get<WalletData>(`/admin/users/${user.id}/transactions?limit=100`);
            setData(res);
        } catch (error) {
            console.error('Error fetching wallet history:', error);
            showError('Не удалось загрузить историю транзакций');
        } finally {
            setLoading(false);
        }
    }, [isOpen, user, showError]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        } else {
            setData(null);
        }
    }, [isOpen, fetchData]);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const getTypeLabel = (type: string) => {
        const labels: Record<string, string> = {
            'grade': '📚 Оценка',
            'penalty': '⚠️ Штраф',
            'quest': '🎯 Квест',
            'purchase': '🛒 Покупка',
            'admin': '👤 Админ'
        };
        return labels[type] || type;
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Кошелёк: ${user?.first_name} ${user?.last_name}`} className={styles.modal}>
            <div className={styles.container}>
                {/* Stats Cards */}
                {data && (
                    <div className={styles.statsGrid}>
                        <div className={`${styles.statCard} ${styles.received}`}>
                            <div className={styles.statContent}>
                                <span className={styles.statLabel}>ПОЛУЧЕНО</span>
                                <span className={styles.statValue}>+{Math.round(data.stats.total_income)}</span>
                            </div>
                        </div>
                        <div className={`${styles.statCard} ${styles.spent}`}>
                            <div className={styles.statContent}>
                                <span className={styles.statLabel}>СПИСАНО</span>
                                <span className={styles.statValue}>-{Math.round(data.stats.total_expense)}</span>
                            </div>
                        </div>
                        <div className={`${styles.statCard}`}>
                            <div className={styles.statContent}>
                                <span className={styles.statLabel}>ТРАНЗАКЦИЙ</span>
                                <span className={styles.statValue}>{data.stats.total_count}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* Transaction List */}
                <div className={styles.listContainer}>
                    {loading ? (
                        <div className={styles.loading}>
                            <div className={styles.spinner}></div>
                            <p>Загрузка транзакций...</p>
                        </div>
                    ) : !data || data.transactions.length === 0 ? (
                        <div className={styles.empty}>
                            <p>Транзакций не найдено</p>
                        </div>
                    ) : (
                        data.transactions.map((t) => (
                            <div key={t.id} className={`${styles.transactionItem} ${t.amount > 0 ? styles.itemReceived : styles.itemSpent}`}>
                                <div className={styles.itemContent}>
                                    <div className={styles.itemDescription}>{t.reason || 'Без описания'}</div>
                                    <div className={styles.itemDate}>
                                        {getTypeLabel(t.type)} • {formatDate(t.created_at)}
                                    </div>
                                </div>
                                <div className={styles.itemAmount}>
                                    {t.amount > 0 ? '+' : ''}{Math.round(t.amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Modal>
    );
}
