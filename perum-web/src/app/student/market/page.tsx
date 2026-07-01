'use client';

import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import Modal from '@/components/ui/Modal';
import { CoinIcon } from '@/components/ui/CoinIcon';
import { GiftCard } from '@/components/market/GiftCard';
import { GiftUpgradeAnimation, type UpgradePhase } from '@/components/market/GiftUpgradeAnimation';
import type { ShopItem, InventoryItem } from '@/types';
import DeliveryCodeModal from '@/components/market/DeliveryCodeModal';
import styles from './page.module.css';

type MarketTab = 'shop' | 'inventory';
type FilterType = 'all' | 'avatar' | 'background' | 'gift' | 'stationery';

const ITEM_TYPE_LABELS: Record<string, string> = {
    avatar: 'Аватарка',
    background: 'Фон',
    gift: 'Подарки',
    stationery: 'Канцелярия',
};

function MarketFaqModal({ onClose }: { onClose: () => void }) {
    return (
        <Modal isOpen={true} onClose={onClose} title="Как работает маркет?" size="lg">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.5' }}>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>🛒 Что такое маркет?</h4>
                    <p style={{ margin: 0 }}>Маркет — это магазин, где вы можете тратить заработанные ливки на покупку аватарок, фонов, подарков и канцелярии.</p>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>🎨 Категории товаров</h4>
                    <ul style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
                        <li style={{ marginBottom: '4px' }}><strong>Аватары</strong> — меняют вашу фотографию профиля.</li>
                        <li style={{ marginBottom: '4px' }}><strong>Фоны</strong> — украшают ваш профиль.</li>
                        <li style={{ marginBottom: '4px' }}><strong>Подарки</strong> — уникальные коллекционные предметы, которые можно надеть в профиле (до 10 шт).</li>
                        <li><strong>Канцелярия</strong> — реальные предметы, которые можно забрать у учителя.</li>
                    </ul>
                </div>
                <div>
                    <h4 style={{ color: 'var(--text-primary)', margin: '0 0 8px 0' }}>⭐ Редкость</h4>
                    <p style={{ margin: 0 }}>Каждый предмет имеет свою редкость: <strong>Обычный</strong>, <strong>Редкий</strong> или <strong>Легендарный</strong>. Чем редче предмет — тем он дороже.</p>
                </div>
            </div>
        </Modal>
    );
}

export default function MarketPage() {
    const { user, refreshUser } = useAuth();
    const { showSuccess, showError } = useToast();

    const [tab, setTab] = useState<MarketTab>('shop');
    const [filter, setFilter] = useState<FilterType>('all');
    const [items, setItems] = useState<ShopItem[]>([]);
    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [buyModal, setBuyModal] = useState<ShopItem | null>(null);
    const [deliveryCodeModal, setDeliveryCodeModal] = useState<InventoryItem | null>(null);
    const [showFaq, setShowFaq] = useState(false);
    const [upgradeAnim, setUpgradeAnim] = useState<UpgradePhase | null>(null);

    /* ── Pagination state ── */
    const pageSize = () => window.innerWidth <= 768 ? 8 : 16;
    const [visibleCountShop, setVisibleCountShop] = useState(16);
    const [visibleCountInv, setVisibleCountInv] = useState(16);

    // Сброс при смене фильтра/таба
    useEffect(() => {
        setVisibleCountShop(pageSize());
        setVisibleCountInv(pageSize());
    }, [filter, tab]);


    const loadMarket = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await api.get<ShopItem[]>('/market/items');
            setItems(data);
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Ошибка загрузки магазина');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const loadInventory = async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await api.get<InventoryItem[]>('/market/inventory');
            setInventory(data);
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Ошибка загрузки инвентаря');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        const fetchAll = async () => {
            setLoading(true);
            await Promise.all([
                loadMarket(true),
                loadInventory(true)
            ]);
            setLoading(false);
        };
        fetchAll();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showError]);

    const handleBuy = async (itemId: number) => {
        try {
            await api.post(`/market/buy/${itemId}`);
            showSuccess('Предмет куплен!');
            setBuyModal(null);
            refreshUser();
            loadMarket(true); // Refresh shop items after purchase silently
            loadInventory(true); // Refresh inventory after purchase silently
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Ошибка покупки';
            showError(message);
        }
    };

    const handleEquip = async (invId: number) => {
        try {
            await api.post(`/market/equip/${invId}`);
            showSuccess('Аватар надет!');
            loadInventory(true);
            refreshUser();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Ошибка';
            showError(message);
        }
    };

    const handleUnequip = async () => {
        try {
            await api.post('/market/unequip/avatar');
            showSuccess('Аватар снят!');
            loadInventory(true);
            refreshUser();
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Ошибка';
            showError(message);
        }
    };

    const handleUpgrade = async (invId: number) => {
        const inv = inventory.find((i) => i.id === invId);
        if (!inv) return;

        // Открываем сцену в «спин»-фазе сразу — пока летит запрос
        setUpgradeAnim({ phase: 'spinning', inv });

        type UpgradeResp = { success: boolean; bg_url: string; pattern_url: string; new_balance: number; item_name: string; message: string };
        try {
            const res = await api.post<UpgradeResp>(`/market/upgrade/${invId}`);
            // Гарантируем минимум 900мс крутки, чтобы анимация не «мигнула» при быстром бэкенде
            await new Promise((resolve) => setTimeout(resolve, 600));
            setUpgradeAnim({ phase: 'revealing', inv, bgUrl: res.bg_url, patternUrl: res.pattern_url });
            refreshUser();
        } catch (err) {
            setUpgradeAnim(null);
            const message = err instanceof Error ? err.message : 'Ошибка улучшения';
            showError(message);
        }
    };

    const closeUpgradeAnim = () => {
        setUpgradeAnim(null);
        // Перезагружаем инвентарь после закрытия сцены —
        // это обновит GiftCard финальным skin/pattern_mode с сервера.
        loadInventory(true);
    };

    /* ══ Filters ══ */
    const availableCategories = useMemo(() => {
        if (tab === 'shop') {
            return new Set(items.map(i => i.item_type));
        } else {
            return new Set(inventory.map(inv => inv.item.item_type));
        }
    }, [tab, items, inventory]);

    useEffect(() => {
        if (filter !== 'all' && !availableCategories.has(filter)) {
            setFilter('all');
        }
    }, [availableCategories, filter]);

    const filteredItems = useMemo(() => {
        const list = filter === 'all' ? items : items.filter((i) => i.item_type === filter);
        return list;
    }, [items, filter]);

    const visibleItems = useMemo(() => filteredItems.slice(0, visibleCountShop), [filteredItems, visibleCountShop]);

    const filteredInventory = useMemo(() => {
        const list = filter === 'all' ? inventory : inventory.filter((i) => i.item.item_type === filter);
        return list;
    }, [inventory, filter]);

    const visibleInventoryItems = useMemo(() => filteredInventory.slice(0, visibleCountInv), [filteredInventory, visibleCountInv]);

    // Подсчёт купленных товаров для проверки лимитов
    const ownedItemCounts = useMemo(() => {
        const counts = new Map<number, number>();
        inventory.forEach((inv) => {
            counts.set(inv.item.id, (counts.get(inv.item.id) || 0) + 1);
        });
        return counts;
    }, [inventory]);

    // Получить запись инвентаря для канцелярии (для кнопки в каталоге)
    const getStationeryInventoryEntry = (itemId: number) => {
        // Ищем первую не-выданную запись, приоритет отдаём ещё не полученным
        const notIssued = inventory.find(inv => inv.item.id === itemId && !inv.is_issued);
        if (notIssued) return notIssued;
        return inventory.find(inv => inv.item.id === itemId) ?? null;
    };

    // Infinite scroll через window scroll
    useEffect(() => {
        const handleScroll = () => {
            const scrolledToBottom =
                window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 80;
            if (!scrolledToBottom) return;

            if (tab === 'shop') {
                setVisibleCountShop((prev: number) => {
                    if (prev < filteredItems.length) return prev + pageSize();
                    return prev;
                });
            } else {
                setVisibleCountInv((prev: number) => {
                    if (prev < filteredInventory.length) return prev + pageSize();
                    return prev;
                });
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [tab, filteredItems.length, filteredInventory.length]);

    const rarityLabel = (r: string) => (r === 'legendary' || r === 'super_rare') ? 'Легендарный' : r === 'rare' ? 'Редкий' : 'Обычный';
    const rarityClass = (r: string) => (r === 'legendary' || r === 'super_rare') ? styles.glow_legendary : r === 'rare' ? styles.glow_rare : styles.glow_common;
    const badgeClass = (r: string) => (r === 'legendary' || r === 'super_rare') ? styles.badge_legendary : r === 'rare' ? styles.badge_rare : styles.badge_common;

    return (
        <div className={styles.page}>

            {/* Tabs */}
            <div className={styles.headerControls}>
                <div className={styles.viewToggle}>
                    <button className={`${styles.viewBtn} ${tab === 'shop' ? styles.viewBtnActive : ''}`} onClick={() => setTab('shop')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                        Каталог
                    </button>
                    <button className={`${styles.viewBtn} ${tab === 'inventory' ? styles.viewBtnActive : ''}`} onClick={() => setTab('inventory')}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                            <line x1="12" y1="22.08" x2="12" y2="12" />
                        </svg>
                        Инвентарь
                    </button>
                </div>

                <button
                    className={styles.faqButton}
                    onClick={() => setShowFaq(true)}
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    FAQ
                </button>
            </div>

            {/* Filters */}
            <div className={styles.filtersWrap}>
                <div className={styles.filters}>
                    <button className={`${styles.filter} ${filter === 'all' ? styles.filterActive : ''}`} onClick={() => setFilter('all')}>Все</button>

                    {availableCategories.has('avatar') && (
                        <button className={`${styles.filter} ${filter === 'avatar' ? styles.filterActive : ''}`} onClick={() => setFilter('avatar')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                <circle cx="12" cy="7" r="4" />
                            </svg>
                            Аватары
                        </button>
                    )}

                    {availableCategories.has('background') && (
                        <button className={`${styles.filter} ${filter === 'background' ? styles.filterActive : ''}`} onClick={() => setFilter('background')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                <circle cx="8.5" cy="8.5" r="1.5" />
                                <polyline points="21 15 16 10 5 21" />
                            </svg>
                            Фоны
                        </button>
                    )}

                    {availableCategories.has('gift') && (
                        <button className={`${styles.filter} ${filter === 'gift' ? styles.filterActive : ''}`} onClick={() => setFilter('gift')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 12 20 22 4 22 4 12" />
                                <rect x="2" y="7" width="20" height="5" />
                                <line x1="12" y1="22" x2="12" y2="7" />
                                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                            </svg>
                            Подарки
                        </button>
                    )}

                    {availableCategories.has('stationery') && (
                        <button className={`${styles.filter} ${filter === 'stationery' ? styles.filterActive : ''}`} onClick={() => setFilter('stationery')}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 19l7-7 3 3-7 7-3-3z" />
                                <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
                                <path d="M2 2l7.586 7.586" />
                                <circle cx="11" cy="11" r="2" />
                            </svg>
                            Канцелярия
                        </button>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div className={styles.gridWrap}>
                {loading ? (
                    <div className={styles.loading}>
                        <div className={styles.spinner}></div>
                        <p>Загружаем товары…</p>
                    </div>
                ) : tab === 'shop' ? (
                    <>
                        <div className={styles.grid}>
                            {visibleItems.length === 0 ? (
                                <div className={styles.empty}>Товары не найдены</div>
                            ) : (
                                visibleItems.map((item) => {
                                    const count = ownedItemCounts.get(item.id) || 0;
                                    const isAlreadyOwned = item.item_type !== 'gift'
                                        ? count >= 1
                                        : (item.per_user_limit !== null && count >= item.per_user_limit);

                                    const invEntry = item.item_type === 'stationery' && isAlreadyOwned ? getStationeryInventoryEntry(item.id) : null;
                                    const isIssued = invEntry?.is_issued || false;
                                    
                                    let cardClass = styles.card;
                                    if (isAlreadyOwned) {
                                        if (item.item_type === 'stationery' && !isIssued) {
                                            cardClass = `${styles.card} ${styles.card_dimmed_clickable}`;
                                        } else {
                                            cardClass = `${styles.card} ${styles.card_disabled}`;
                                        }
                                    }

                                    return (
                                        <div
                                            key={item.id}
                                            className={cardClass}
                                            onClick={() => {
                                                if (!isAlreadyOwned) {
                                                    setBuyModal(item);
                                                } else if (item.item_type === 'stationery' && invEntry && !isIssued) {
                                                    setDeliveryCodeModal(invEntry);
                                                }
                                            }}
                                        >
                                            <div className={styles.cardImage} data-type={item.item_type}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                {(item.image_path) ? <img src={item.image_path} alt={item.name} /> : (
                                                    <svg className={styles.placeholderIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                        <circle cx="9" cy="21" r="1" />
                                                        <circle cx="20" cy="21" r="1" />
                                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                                    </svg>
                                                )}
                                                <div className={`${styles.rarityGlow} ${rarityClass(item.rarity)}`}></div>
                                                <div className={`${styles.badge} ${styles.badgeRarity} ${badgeClass(item.rarity)}`}>{rarityLabel(item.rarity)}</div>
                                                {count > 0 && (
                                                    <div className={`${styles.badge} ${styles.badge_owned}`}>Уже есть {item.item_type === 'gift' ? `(${count})` : ''}</div>
                                                )}
                                            </div>
                                            <div className={styles.cardBody}>
                                                <h3 className={styles.cardName}>{item.name}</h3>
                                                <p className={styles.cardType}>{ITEM_TYPE_LABELS[item.item_type] || item.item_type}</p>
                                                <div className={styles.cardFooter}>
                                                    <div className={styles.price}>
                                                        <CoinIcon id={`coin-${item.id}`} className={styles.coinIcon} />
                                                        {item.price}
                                                    </div>
                                                    {/* Кнопка: учитываем состояние канцелярии */}
                                                    {item.item_type === 'stationery' && isAlreadyOwned ? (() => {
                                                        const invEntry = getStationeryInventoryEntry(item.id);
                                                        if (invEntry?.is_issued) {
                                                            return (
                                                                <button className={styles.buyBtn} disabled>
                                                                    Получено
                                                                </button>
                                                            );
                                                        }
                                                        return (
                                                            <button
                                                                className={styles.confirmBtn}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (invEntry) setDeliveryCodeModal(invEntry);
                                                                }}
                                                            >
                                                                Получить код
                                                            </button>
                                                        );
                                                    })() : (
                                                        <button className={styles.buyBtn} disabled={isAlreadyOwned}>
                                                            {isAlreadyOwned ? 'Куплено' : 'Купить'}
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                    </>
                ) : (
                    <>
                        <div className={styles.grid}>
                            {visibleInventoryItems.length === 0 ? (
                                <div className={styles.empty}>Инвентарь пуст</div>
                            ) : (
                                visibleInventoryItems.map((inv) => (
                                    <div key={inv.id} className={styles.card}>
                                        {/* Карточка подарка — многослойный компонент с анимациями */}
                                        {inv.item.item_type === 'gift' ? (
                                            <div className={styles.cardImage} data-type="gift">
                                                <GiftCard inv={inv} />
                                                <div className={`${styles.badge} ${styles.badgeRarity} ${badgeClass(inv.item.rarity)}`}>{rarityLabel(inv.item.rarity)}</div>
                                                {inv.is_equipped && <div className={`${styles.badge} ${styles.badge_rare}`}>Надет</div>}
                                            </div>
                                        ) : (
                                            <div className={styles.cardImage} data-type={inv.item.item_type}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                {inv.item.image_path ? <img src={inv.item.image_path} alt={inv.item.name} /> : (
                                                    <svg className={styles.placeholderIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                                        <circle cx="9" cy="21" r="1" />
                                                        <circle cx="20" cy="21" r="1" />
                                                        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                                    </svg>
                                                )}
                                                <div className={`${styles.rarityGlow} ${rarityClass(inv.item.rarity)}`}></div>
                                                <div className={`${styles.badge} ${styles.badgeRarity} ${badgeClass(inv.item.rarity)}`}>{rarityLabel(inv.item.rarity)}</div>
                                                {inv.is_equipped && <div className={`${styles.badge} ${styles.badge_rare}`}>Надет</div>}
                                            </div>
                                        )}
                                        <div className={styles.cardBody}>
                                            <h3 className={styles.cardName}>{inv.item.name}</h3>
                                            <p className={styles.cardType}>{ITEM_TYPE_LABELS[inv.item.item_type] || inv.item.item_type}</p>
                                            <div className={styles.cardFooter}>
                                                <span className={styles.acquiredDate}>
                                                    {inv.purchased_at ? `куплено ${new Date(inv.purchased_at).toLocaleDateString('ru-RU')}` : 'куплено давно'}
                                                </span>
                                            </div>
                                            {/* Inventory actions per item type */}
                                            {inv.item.item_type === 'avatar' && (
                                                inv.is_equipped ? (
                                                    <button className={styles.cancelBtn} onClick={() => handleUnequip()}>Снять</button>
                                                ) : (
                                                    <button className={styles.confirmBtn} onClick={() => handleEquip(inv.id)}>Надеть</button>
                                                )
                                            )}
                                            {inv.item.item_type === 'background' && (
                                                <button className={styles.cancelBtn} disabled title="Будет доступно позже">Скоро</button>
                                            )}
                                            {inv.item.item_type === 'gift' && (
                                                <>
                                                    {(inv.upgrade_bg_url || inv.upgrade_pattern_url) ? (
                                                        <span className={styles.acquiredDate}>✨ Улучшен</span>
                                                    ) : inv.item.is_upgradable ? (
                                                        <button className={styles.confirmBtn} onClick={() => handleUpgrade(inv.id)}>
                                                            ✦ Улучшить
                                                        </button>
                                                    ) : (
                                                        <span className={styles.acquiredDate}>Подарок</span>
                                                    )}
                                                </>
                                            )}
                                            {inv.item.item_type === 'stationery' && (
                                                inv.is_issued ? (
                                                    <div className={styles.issuedBadge}>
                                                        Выдан {inv.issued_at ? new Date(inv.issued_at).toLocaleDateString('ru-RU') : ''}
                                                    </div>
                                                ) : (
                                                    <button className={styles.confirmBtn} onClick={() => setDeliveryCodeModal(inv)}>Получить код</button>
                                                )
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                    </>
                )}
            </div>

            {/* Buy Modal */}
            <Modal isOpen={!!buyModal} onClose={() => setBuyModal(null)} title={buyModal?.name || 'Покупка'}>
                {buyModal && (
                    <div className={styles.buyConfirm}>
                        <div className={styles.modalImg} data-type={buyModal.item_type}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            {(buyModal.image_path) ? <img src={buyModal.image_path} alt={buyModal.name} /> : (
                                <svg className={styles.placeholderIcon} width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                    <circle cx="9" cy="21" r="1" />
                                    <circle cx="20" cy="21" r="1" />
                                    <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                                </svg>
                            )}
                        </div>
                        <p className={styles.modalDesc}>{buyModal.description}</p>

                        <div className={styles.buyActions}>
                            <div className={styles.price} style={{ marginRight: 'auto' }}>
                                <CoinIcon id="coin-modal" className={styles.coinIcon} />
                                {buyModal.price} ливок
                            </div>

                            <button className={styles.cancelBtn} onClick={() => setBuyModal(null)}>Отмена</button>
                            <button
                                className={styles.confirmBtn}
                                onClick={() => handleBuy(buyModal.id)}
                                disabled={(user?.balance ?? 0) < buyModal.price}
                            >
                                Купить
                            </button>
                        </div>
                    </div>
                )}
            </Modal>

            {showFaq && <MarketFaqModal onClose={() => setShowFaq(false)} />}

            {deliveryCodeModal && (
                <DeliveryCodeModal
                    inventoryId={deliveryCodeModal.id}
                    itemName={deliveryCodeModal.item.name}
                    token={localStorage.getItem('token') || ''}
                    onClose={() => setDeliveryCodeModal(null)}
                    onCancelled={() => setDeliveryCodeModal(null)}
                />
            )}

            <GiftUpgradeAnimation data={upgradeAnim} onClose={closeUpgradeAnim} />
        </div>
    );
}
