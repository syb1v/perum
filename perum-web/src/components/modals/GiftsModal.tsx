import Modal from '@/components/ui/Modal';
import styles from './GiftsModal.module.css';
import type { components } from '@/types/api';

type GiftItem = components['schemas']['InventoryItemResponse'];

interface GiftsModalProps {
    isOpen: boolean;
    onClose: () => void;
    gifts: GiftItem[];
    equippedIds: number[];
    onToggleEquip: (invId: number) => void;
}

export default function GiftsModal({ isOpen, gifts, equippedIds, onToggleEquip, onClose }: GiftsModalProps) {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Подарки">
            <p className={styles.description}>
                Выберите до 10 подарков для отображения в профиле.
            </p>
            {gifts.length === 0 ? (
                <p className={styles.emptyMsg}>У вас пока нет подарков.</p>
            ) : (
                <div className={styles.giftsGrid}>
                    {gifts.map((inv) => {
                        const equippedIndex = equippedIds.indexOf(inv.id);
                        const isEquipped = equippedIndex !== -1;
                        return (
                            <div
                                key={inv.id}
                                className={`${styles.giftsItem} ${isEquipped ? styles.giftsItemEquipped : ''}`}
                                onClick={() => onToggleEquip(inv.id)}
                                title={inv.item.name}
                            >
                                <div className={styles.giftImageWrapper}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={inv.item.image_path || undefined} alt={inv.item.name} />
                                    {isEquipped && (
                                        <div className={styles.equippedBadge}>
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                {equippedIndex + 1}
                                            </span>
                                        </div>
                                    )}
                                </div>
                                <div className={styles.giftInfo}>
                                    <div className={styles.giftName}>{inv.item.name}</div>
                                    {inv.item.description && (
                                        <div className={styles.giftDesc}>{inv.item.description}</div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Modal>
    );
}
