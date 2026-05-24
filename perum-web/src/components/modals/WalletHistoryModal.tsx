'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import styles from './WalletHistoryModal.module.css';

interface Transaction {
    id: number;
    amount: number;
    description: string;
    created_at: string;
}

interface WalletHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface StatsResponse {
    received: number;
    spent: number;
    period: string;
}

interface TransactionsResponse {
    transactions: Transaction[];
    total: number;
    page: number;
    pages: number;
}

export default function WalletHistoryModal({ isOpen, onClose }: WalletHistoryModalProps) {
    const { showError } = useToast();
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ received: 0, spent: 0 });
    const [transactions, setTransactions] = useState<Transaction[]>([]);

    // Filters state
    const [filters, setFilters] = useState({
        type: 'all',
        period: 'month',
        search: '',
        page: 1
    });

    const [pagination, setPagination] = useState({
        total: 0,
        pages: 1
    });

    // Debounce search
    const [debouncedSearch, setDebouncedSearch] = useState('');

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedSearch(filters.search);
        }, 500);
        return () => clearTimeout(timer);
    }, [filters.search]);

    // Reset page on filter change
    useEffect(() => {
        setFilters(prev => ({ ...prev, page: 1 }));
    }, [filters.type, filters.period, debouncedSearch]);

    const fetchData = useCallback(async () => {
        if (!isOpen) return;

        setLoading(true);
        try {
            // Fetch Stats (based on period)
            const statsRes = await api.get<StatsResponse>(`/wallet/statistics?period=${filters.period}`);
            setStats(statsRes);

            // Fetch Transactions
            const params = new URLSearchParams({
                page: filters.page.toString(),
                limit: '7',
                period: filters.period
            });

            if (filters.type !== 'all') params.append('transaction_type', filters.type);
            if (debouncedSearch) params.append('search', debouncedSearch);

            const transRes = await api.get<TransactionsResponse>(`/wallet/transactions?${params.toString()}`);
            setTransactions(transRes.transactions);
            setPagination({
                total: transRes.total,
                pages: transRes.pages
            });

        } catch (error) {
            console.error('Error fetching wallet history:', error);
            showError('Не удалось загрузить историю транзакций');
        } finally {
            setLoading(false);
        }
    }, [isOpen, filters.period, filters.type, filters.page, debouncedSearch, showError]);

    useEffect(() => {
        if (isOpen) {
            fetchData();
        }
    }, [isOpen, fetchData]);

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= pagination.pages) {
            setFilters(prev => ({ ...prev, page: newPage }));
        }
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="История транзакций" className={styles.modal}>
            <div className={styles.container}>
                {/* Stats Cards */}
                <div className={styles.statsGrid}>
                    <div className={`${styles.statCard} ${styles.received}`}>
                        <div className={styles.statIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="17 11 12 6 7 11" />
                                <polyline points="17 18 12 13 7 18" />
                            </svg>
                        </div>
                        <div className={styles.statContent}>
                            <span className={styles.statLabel}>ПОЛУЧЕНО</span>
                            <span className={styles.statValue}>+{Math.round(stats.received)}</span>
                        </div>
                    </div>
                    <div className={`${styles.statCard} ${styles.spent}`}>
                        <div className={styles.statIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <polyline points="7 13 12 18 17 13" />
                                <polyline points="7 6 12 11 17 6" />
                            </svg>
                        </div>
                        <div className={styles.statContent}>
                            <span className={styles.statLabel}>СПИСАНО</span>
                            <span className={styles.statValue}>-{Math.round(stats.spent)}</span>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className={styles.filters}>
                    <div className={styles.filterGroup}>
                        <label>Тип</label>
                        <select
                            className={styles.select}
                            value={filters.type}
                            onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                        >
                            <option value="all">Все</option>
                            <option value="received">Получено</option>
                            <option value="spent">Списано</option>
                        </select>
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Период</label>
                        <select
                            className={styles.select}
                            value={filters.period}
                            onChange={(e) => setFilters(prev => ({ ...prev, period: e.target.value }))}
                        >
                            <option value="all">Всё время</option>
                            <option value="week">За неделю</option>
                            <option value="month">За месяц</option>
                            <option value="year">За год</option>
                        </select>
                    </div>
                    <div className={`${styles.filterGroup} ${styles.searchWrapper}`}>
                        <label>Поиск</label>
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Поиск..."
                            value={filters.search}
                            onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        />
                        <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <path d="m21 21-4.35-4.35" />
                        </svg>
                    </div>
                </div>

                {/* Transaction List */}
                <div className={styles.listContainer}>
                    {loading ? (
                        <div className={styles.loading}>
                            <div className={styles.spinner}></div>
                            <p>Загрузка транзакций...</p>
                        </div>
                    ) : transactions.length === 0 ? (
                        <div className={styles.empty}>
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                                <polyline points="17 6 23 6 23 12" />
                            </svg>
                            <p>Транзакций не найдено</p>
                        </div>
                    ) : (
                        transactions.map((t) => (
                            <div key={t.id} className={`${styles.transactionItem} ${t.amount > 0 ? styles.itemReceived : styles.itemSpent}`}>
                                <div className={styles.itemIcon}>
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        {t.amount > 0
                                            ? <><polyline points="17 11 12 6 7 11" /><polyline points="17 18 12 13 7 18" /></>
                                            : <><polyline points="7 13 12 18 17 13" /><polyline points="7 6 12 11 17 6" /></>
                                        }
                                    </svg>
                                </div>
                                <div className={styles.itemContent}>
                                    <div className={styles.itemDescription}>
                                        {(() => {
                                            const match = t.description.match(/^Оценка\s+(\d+|[^\s]+)\s+по\s+предмету\s+[«"]?([^»"]+)[»"]?/i);
                                            return match ? `${match[1]} за ${match[2]}` : t.description;
                                        })()}
                                    </div>
                                    <div className={styles.itemDate}>{formatDate(t.created_at)}</div>
                                    {/* Mobile amount visible here? Using flex order if needed */}
                                </div>
                                <div className={styles.itemAmount}>
                                    {t.amount > 0 ? '+' : ''}{Math.round(t.amount)}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Pagination */}
                <div className={styles.pagination}>
                    <button
                        className={styles.pageBtn}
                        disabled={filters.page <= 1 || loading}
                        onClick={() => handlePageChange(filters.page - 1)}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Назад
                    </button>
                    <span className={styles.paginationInfo}>Страница {filters.page} из {pagination.pages}</span>
                    <button
                        className={styles.pageBtn}
                        disabled={filters.page >= pagination.pages || loading}
                        onClick={() => handlePageChange(filters.page + 1)}
                    >
                        Далее
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 18 15 12 9 6" />
                        </svg>
                    </button>
                </div>
            </div>
        </Modal>
    );
}
