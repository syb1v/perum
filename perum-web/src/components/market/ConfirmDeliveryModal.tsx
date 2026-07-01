import React, { useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import styles from './ConfirmDeliveryModal.module.css';

interface ConfirmDeliveryModalProps {
    code: string;
    studentName: string;
    itemName: string;
    token: string;
    onClose: () => void;
    onConfirmed: () => void;
}

export default function ConfirmDeliveryModal({ code, studentName, itemName, token, onClose, onConfirmed }: ConfirmDeliveryModalProps) {
    const [confirming, setConfirming] = useState(false);
    const { showError } = useToast();

    const handleConfirm = async () => {
        setConfirming(true);
        try {
            const res = await fetch('/api/market/delivery/confirm', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ code })
            });
            
            if (res.ok) {
                onConfirmed();
            } else {
                const data = await res.json();
                showError(data.detail || 'Ошибка при выдаче товара');
            }
        } catch {
            showError('Ошибка при выдаче товара');
        } finally {
            setConfirming(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Подтверждение выдачи">
            <div className={styles.container}>
                <div className={styles.infoBox}>
                    <p className={styles.label}>Ученик</p>
                    <p className={styles.value}>{studentName}</p>
                </div>
                <div className={styles.infoBox}>
                    <p className={styles.label}>Товар</p>
                    <p className={styles.value}>{itemName}</p>
                </div>

                <div className={styles.actions}>
                    <button className={styles.cancelBtn} onClick={onClose} disabled={confirming}>
                        Отмена
                    </button>
                    <button className={styles.confirmBtn} onClick={handleConfirm} disabled={confirming}>
                        {confirming ? 'Выдача...' : '✓ Товар выдан'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

