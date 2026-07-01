'use client';

import { useState } from 'react';
import { useStudentProfile } from '@/hooks/useStudentProfile';
import HelpModal from '@/components/modals/HelpModal';
import GiftsModal from '@/components/modals/GiftsModal';
import AvatarModal from '@/components/modals/AvatarModal';
import ChangePasswordModal from '@/components/modals/ChangePasswordModal';
import GiftViewModal from '@/components/modals/GiftViewModal';
import { CoinIcon } from '@/components/ui/CoinIcon';
import styles from './page.module.css';

/* ════════════════════════════════════════
   Main Profile Page Component
   ════════════════════════════════════════ */
export default function StudentProfile() {
    const {
        user,
        gifts,
        equippedIds,
        marketAvatars,
        equippedGifts,
        displayName,
        handleToggleEquip,
        handleEquipAvatar,
        handleSetDefaultAvatar,
        comingSoon,
    } = useStudentProfile();

    /* ── Modals ── */
    const [helpOpen, setHelpOpen] = useState(false);
    const [giftsOpen, setGiftsOpen] = useState(false);
    const [changePasswordOpen, setChangePasswordOpen] = useState(false);
    const [avatarModalOpen, setAvatarModalOpen] = useState(false);
    const [selectedViewGift, setSelectedViewGift] = useState<unknown>(null);

    /* ════════════════════════════════════════
       Render
       ════════════════════════════════════════ */
    return (
        <div className={styles.profileMain}>
            {/* ── Profile Card ── */}
            <section className={styles.profileCard}>
                <div className={styles.profileHeader}>
                    <div className={styles.avatarContainer}>
                        <div className={styles.avatar}>
                            {user?.avatar_url ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img src={user.avatar_url} alt="Аватар" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                    <circle cx="12" cy="7" r="4" />
                                </svg>
                            )}
                        </div>
                        <button className={styles.avatarEdit} onClick={() => setAvatarModalOpen(true)}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        </button>
                    </div>
                    <div className={styles.profileInfo}>
                        <h1 className={styles.profileName}>{displayName}</h1>
                        <p className={styles.profileRole}>Ученик</p>
                        <div className={styles.profileBalance}>
                            <span>{user?.balance ?? 0}</span> <CoinIcon id="profile-balance-coin" />
                        </div>
                    </div>
                </div>

                {/* Equipped Gift Badges – horizontal scrollable */}
                <div className={styles.profileBadges}>
                    <h3>Мои подарки {equippedGifts.length > 0 && <span className={styles.badgeCount}>({equippedGifts.length})</span>}</h3>
                    <div className={styles.badgesScroll}>
                        {equippedGifts.length === 0 ? (
                            <div className={styles.badgePlaceholder}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <rect x="3" y="3" width="18" height="18" rx="2" />
                                    <circle cx="8.5" cy="8.5" r="1.5" />
                                    <polyline points="21 15 16 10 5 21" />
                                </svg>
                                <span>Нажмите «Подарки», чтобы надеть подарки</span>
                            </div>
                        ) : (
                            equippedGifts.map((inv) => (
                                <div key={inv.id} className={styles.giftBadge} title={inv.item.name} onClick={() => setSelectedViewGift(inv)} style={{ cursor: 'pointer' }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={inv.item.image_path || undefined} alt={inv.item.name} className={styles.giftImage} />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            {/* ── Menu Grid ── */}
            <section className={styles.profileMenu}>
                <div className={styles.menuGrid}>
                    {/* Помощь */}
                    <div className={styles.menuCard} onClick={() => setHelpOpen(true)}>
                        <div className={styles.menuIcon}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                <path d="M12 7v2" />
                                <path d="M12 13h.01" />
                            </svg>
                        </div>
                        <span className={styles.menuTitle}>Помощь</span>
                        <span className={styles.menuDesc}>Связаться с поддержкой</span>
                    </div>

                    {/* Подарки - now opens the modal */}
                    <div className={styles.menuCard} onClick={() => setGiftsOpen(true)}>
                        <div className={`${styles.menuIcon} ${styles.menuIconGifts}`}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 12 20 22 4 22 4 12" />
                                <rect x="2" y="7" width="20" height="5" />
                                <line x1="12" y1="22" x2="12" y2="7" />
                                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                            </svg>
                        </div>
                        <span className={styles.menuTitle}>Подарки</span>
                        <span className={styles.menuDesc}>Просмотр и экипировка</span>
                    </div>

                    {/* Активность */}
                    <div className={styles.menuCard} onClick={comingSoon}>
                        <div className={`${styles.menuIcon} ${styles.menuIconActivity}`}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                            </svg>
                        </div>
                        <span className={styles.menuTitle}>Активность</span>
                        <span className={styles.menuDesc}>История действий</span>
                    </div>

                    {/* Друзья */}
                    <div className={styles.menuCard} onClick={comingSoon}>
                        <div className={`${styles.menuIcon} ${styles.menuIconFriends}`}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <span className={styles.menuTitle}>Друзья</span>
                        <span className={styles.menuDesc}>Приглашения и список</span>
                    </div>
                </div>
            </section>

            {/* ── Help Modal ── */}
            {helpOpen && <HelpModal onClose={() => setHelpOpen(false)} />}

            {/* ── Gifts Modal ── */}
            {giftsOpen && (
                <GiftsModal
                    isOpen={giftsOpen}
                    gifts={gifts}
                    equippedIds={equippedIds}
                    onToggleEquip={handleToggleEquip}
                    onClose={() => setGiftsOpen(false)}
                />
            )}

            {/* ── Change Password Modal ── */}
            <ChangePasswordModal
                isOpen={changePasswordOpen}
                onClose={() => setChangePasswordOpen(false)}
            />
            {/* ── Avatar Selection Modal ── */}
            <AvatarModal
                isOpen={avatarModalOpen}
                onClose={() => setAvatarModalOpen(false)}
                marketAvatars={marketAvatars}
                onEquipAvatar={handleEquipAvatar}
                onSetDefaultAvatar={handleSetDefaultAvatar}
            />

            {/* ── Gift View Modal ── */}
            <GiftViewModal
                isOpen={!!selectedViewGift}
                /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                gift={selectedViewGift as any}
                onClose={() => setSelectedViewGift(null)}
            />
        </div>
    );
}
