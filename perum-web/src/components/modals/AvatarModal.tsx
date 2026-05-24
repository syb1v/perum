import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import styles from './AvatarModal.module.css';
import type { components } from '@/types/api';

type AvatarItem = components['schemas']['InventoryItemResponse'];

interface AvatarModalProps {
    isOpen: boolean;
    onClose: () => void;
    marketAvatars: AvatarItem[];
    onEquipAvatar: (invId: number) => void;
    onSetDefaultAvatar: (url: string) => void;
}

export default function AvatarModal({ isOpen, onClose, marketAvatars, onEquipAvatar, onSetDefaultAvatar }: AvatarModalProps) {
    const [avatarTab, setAvatarTab] = useState<'market' | 'default'>('market');

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Смена аватара">
            <div className={styles.avatarModal}>
                <div className={styles.avatarTabs}>
                    <button
                        className={`${styles.avatarTab} ${avatarTab === 'market' ? styles.avatarTabActive : ''}`}
                        onClick={() => setAvatarTab('market')}
                    >
                        Из Маркета
                    </button>
                    <button
                        className={`${styles.avatarTab} ${avatarTab === 'default' ? styles.avatarTabActive : ''}`}
                        onClick={() => setAvatarTab('default')}
                    >
                        Стандартные
                    </button>
                </div>

                <div className={styles.avatarGrid}>
                    {avatarTab === 'market' && (
                        marketAvatars.length > 0 ? (
                            marketAvatars.map((inv) => (
                                <div key={inv.id} className={styles.avatarChoice} onClick={() => onEquipAvatar(inv.id)}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={inv.item.image_path || undefined} alt={inv.item.name} />
                                </div>
                            ))
                        ) : (
                            <p className={styles.emptyMsg}>У вас пока нет купленных аватаров.</p>
                        )
                    )}

                    {avatarTab === 'default' && (
                        [
                            '/defaults/avatar1.svg',
                            '/defaults/avatar2.svg',
                            '/defaults/avatar3.svg',
                            '/defaults/avatar4.svg',
                        ].map((url, idx) => (
                            <div key={idx} className={styles.avatarChoice} onClick={() => onSetDefaultAvatar(url)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Стандартный аватар" />
                            </div>
                        ))
                    )}
                </div>
            </div>
        </Modal>
    );
}
