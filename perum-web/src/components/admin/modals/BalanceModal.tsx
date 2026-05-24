
'use client';

import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import styles from '@/app/admin/page.module.css';
import { User } from '@/types';

interface BalanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    user: User | User[] | null;
    onSuccess: () => void;
}

export default function BalanceModal({ isOpen, onClose, user, onSuccess }: BalanceModalProps) {
    const { showSuccess, showError } = useToast();
    const [amount, setAmount] = useState<string>('');
    const [comment, setComment] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSave = async () => {
        if (!user) return;
        const usersToUpdate = Array.isArray(user) ? user : [user];
        if (usersToUpdate.length === 0) return;

        const numAmount = parseInt(amount);

        if (isNaN(numAmount) || numAmount === 0) {
            showError('Введите корректную сумму (не ноль)');
            return;
        }

        setLoading(true);
        try {
            await Promise.all(usersToUpdate.map(u =>
                api.post(`/admin/users/${u.id}/balance`, { amount: numAmount, comment })
            ));

            showSuccess(`${numAmount > 0 ? 'Начислено' : 'Списано'} ${Math.abs(numAmount)} ливок (${usersToUpdate.length} чел.)`);
            onSuccess();
            onClose();
            setAmount('');
            setComment('');
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка при изменении баланса');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Начисление ливок">
            <div className={styles.modalBody}>
                <p>
                    {Array.isArray(user) ? (
                        <>Выбрано пользователей: <strong>{user.length}</strong></>
                    ) : (
                        <>Пользователь: <strong>{user?.last_name} {user?.first_name}</strong> (Баланс: {user?.balance})</>
                    )}
                </p>
                <div className={styles.formGroup}>
                    <label>Сумма (+ или -)</label>
                    <input
                        type="number"
                        placeholder="100"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                    />
                </div>
                <div className={styles.formGroup}>
                    <label>Комментарий</label>
                    <input
                        type="text"
                        placeholder="Причина начисления"
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                    />
                </div>
                <div className={styles.registerActions} style={{ marginTop: '24px' }}>
                    <button className={styles.btnSecondary} onClick={onClose} disabled={loading}>
                        Отмена
                    </button>
                    <button className={styles.btnPrimary} onClick={handleSave} disabled={loading}>
                        {loading ? 'Выполнение...' : 'Начислить'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
