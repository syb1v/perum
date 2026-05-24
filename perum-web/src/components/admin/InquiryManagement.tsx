
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';

interface Inquiry {
    id: number;
    name: string;
    email: string;
    message: string;
    is_read: boolean;
    created_at: string;
}

export default function InquiryManagement() {
    const { showSuccess, showError } = useToast();
    const [inquiries, setInquiries] = useState<Inquiry[]>([]);
    const [filter, setFilter] = useState<'new' | 'old'>('new');
    const [loading, setLoading] = useState(false);

    // View Modal
    const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);

    const fetchInquiries = useCallback(async () => {
        setLoading(true);
        try {
            // API expects is_read as query param? Or returns all and we filter?
            // Legacy js: getInquiries(isRead = null) => params is_read=${isRead}
            // new: false => is_read=0, old: true => is_read=1
            const isRead = filter === 'old' ? 1 : 0;
            const res = await api.get<{ inquiries: Inquiry[] }>(`/admin/inquiries?is_read=${isRead}`);
            setInquiries(res.inquiries);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить обращения');
        } finally {
            setLoading(false);
        }
    }, [filter, showError]);

    useEffect(() => {
        fetchInquiries();
    }, [fetchInquiries]);

    const handleMarkAsRead = async (id: number) => {
        try {
            await api.put(`/admin/inquiries/${id}/read`, {});
            showSuccess('Отмечено прочитанным');
            fetchInquiries();
            if (selectedInquiry?.id === id) setSelectedInquiry(null);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка обновления');
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Удалить обращение?')) return;
        try {
            await api.del(`/admin/inquiries/${id}`);
            showSuccess('Обращение удалено');
            fetchInquiries();
            if (selectedInquiry?.id === id) setSelectedInquiry(null);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('ru-RU');
    };

    return (
        <div className={styles.card}>
            <div className={styles.sectionHeader} style={{ justifyContent: 'space-between' }}>
                <h2>Обращения пользователей</h2>
            </div>

            <div className={styles.questTabs}>
                <button
                    className={`${styles.questTab} ${filter === 'new' ? styles.active : ''}`}
                    onClick={() => setFilter('new')}
                >
                    Новые
                </button>
                <button
                    className={`${styles.questTab} ${filter === 'old' ? styles.active : ''}`}
                    onClick={() => setFilter('old')}
                >
                    Архив
                </button>
            </div>

            <div className={styles.inquiryList}>
                {loading ? (
                    <p className={styles.empty}>Загрузка...</p>
                ) : inquiries.length === 0 ? (
                    <p className={styles.empty}>Обращений нет</p>
                ) : (
                    inquiries.map(inquiry => (
                        <div
                            key={inquiry.id}
                            className={`${styles.inquiryItem} ${!inquiry.is_read ? styles.inquiryUnread : ''}`}
                        >
                            <div className={styles.inquiryHeader}>
                                <div className={styles.inquiryMeta}>
                                    <div className={styles.inquiryAuthor}>
                                        {inquiry.name} <span className={styles.inquiryEmail}>({inquiry.email})</span>
                                    </div>
                                    <div className={styles.inquiryDate}>{formatDate(inquiry.created_at)}</div>
                                </div>
                                <div className={styles.inquiryActions}>
                                    {!inquiry.is_read && (
                                        <button
                                            className={styles.actionBtn}
                                            onClick={() => handleMarkAsRead(inquiry.id)}
                                            title="Пометить прочитанным"
                                        >
                                            ✓
                                        </button>
                                    )}
                                    <button
                                        className={`${styles.actionBtn} ${styles.danger}`}
                                        onClick={() => handleDelete(inquiry.id)}
                                        title="Удалить"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                            <p className={styles.inquiryMessage}>{inquiry.message}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
