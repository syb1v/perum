import React from 'react';
import Modal from '@/components/ui/Modal';
import { InventoryItem } from '@/types';
import { CoinIcon } from '@/components/ui/CoinIcon';
import styles from './GiftViewModal.module.css';

interface GiftViewModalProps {
    isOpen: boolean;
    gift: InventoryItem | null;
    onClose: () => void;
}

export default function GiftViewModal({ isOpen, gift, onClose }: GiftViewModalProps) {
    if (!isOpen || !gift) return null;

    const formattedDate = gift.purchased_at
        ? new Date(gift.purchased_at).toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
          })
        : 'Неизвестно';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="О подарке">
            <div className={styles.giftViewContainer}>
                <div className={styles.imageWrapper}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={gift.item.image_path || ''}
                        alt={gift.item.name}
                        className={styles.giftImage}
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                        }}
                    />
                </div>
                
                <h3 className={styles.giftName}>{gift.item.name}</h3>
                
                {gift.item.description && (
                    <p className={styles.giftDescription}>{gift.item.description}</p>
                )}

                <div className={styles.giftDetails}>
                    <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Стоимость:</span>
                        <span className={styles.detailValue}>
                            {gift.item.price} <CoinIcon id={`gift-view-coin-${gift.id}`} />
                        </span>
                    </div>
                    <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Дата получения:</span>
                        <span className={styles.detailValue}>{formattedDate}</span>
                    </div>
                </div>
            </div>
        </Modal>
    );
}
