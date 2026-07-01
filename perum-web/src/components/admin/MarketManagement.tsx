'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import api from '@/lib/apiClient';
import { useToast } from '@/context/ToastContext';
import Modal from '@/components/ui/Modal';
import { DragDropUploader } from '@/components/ui/DragDropUploader';
import styles from '@/app/admin/page.module.css';

interface ShopItem {
    id: number;
    name: string;
    description: string | null;
    price: number;
    item_type: string;
    rarity: string;
    stock: number | null;
    image_path: string | null;
    per_user_limit: number | null;
    is_active: boolean;
    is_physical: boolean;
    is_archived: boolean;
    is_upgradable?: boolean;
    upgrade_price?: number | null;
    upgrade_bundle_id?: number | null;
    available_from?: string | null;
    created_at: string;
}

export interface GiftUpgradeAsset {
    id: number;
    name: string;
    asset_type: 'background' | 'pattern';
    url: string;
    render_mode?: 'cover' | 'repeat' | 'contain' | string;
    image_url?: string;  // временное поле формы (то же что url; источник — ответ /upload)
    is_active: boolean;
    available_from: string | null;
    created_at: string;
}

export interface GiftUpgradeBundle {
    id: number;
    name: string;
    skins: string[];
    disabled_assets: number[];
    created_at: string;
}

export default function MarketManagement() {
    const { showSuccess, showError } = useToast();
    const [activeTab, setActiveTab] = useState<'catalog' | 'archive' | 'transactions' | 'inventory' | 'upgrade_assets' | 'upgrade_assets_pool'>('catalog');

    const TYPE_TRANSLATIONS: Record<string, string> = {
        'avatar': 'Аватар',
        'background': 'Фон',
        'gift': 'Подарок',
        'stationery': 'Канцелярия'
    };

    const RARITY_TRANSLATIONS: Record<string, string> = {
        'common': 'Обычная (Common)',
        'rare': 'Редкая (Rare)',
        'super_rare': 'Супер-редкая (Super Rare)',
        'legendary': 'Легендарная (Legendary)'
    };

    // Catalog states
    const [items, setItems] = useState<ShopItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);

    // Transactions states
    interface MarketTransaction {
        id: number;
        amount: number;
        reason: string;
        created_at: string;
        item_type?: string;
        item_name?: string;
        user: { id: number; login: string; first_name: string; last_name: string; };
        count?: number; // for grouping
    }
    const [transactions, setTransactions] = useState<MarketTransaction[]>([]);
    const [txLoading, setTxLoading] = useState(true);
    const [, setTxPage] = useState(0);
    const [txHasMore, setTxHasMore] = useState(true);

    // Filters for transactions
    const [txSearch, setTxSearch] = useState('');
    const [txTypeFilter, setTxTypeFilter] = useState('');

    // Inventory states
    interface InventoryStat {
        id: number;
        name: string;
        item_type: string;
        price: number;
        stock_remaining: number | null;
        total_purchased: number;
        total_issued: number;
        total_unissued: number;
    }
    const [inventoryStats, setInventoryStats] = useState<InventoryStat[]>([]);
    const [invLoading, setInvLoading] = useState(true);

    const canLoadMoreRef = useRef(false);
    canLoadMoreRef.current = hasMore && !loading && !loadingMore && activeTab === 'catalog';

    const canLoadMoreTxRef = useRef(false);
    canLoadMoreTxRef.current = txHasMore && !txLoading && activeTab === 'transactions';

    // Upgrade Assets states
    const [upgradeAssets, setUpgradeAssets] = useState<GiftUpgradeAsset[]>([]);
    const [assetsLoading, setAssetsLoading] = useState(true);

    const [upgradeBundles, setUpgradeBundles] = useState<GiftUpgradeBundle[]>([]);
    const [bundlesLoading, setBundlesLoading] = useState(true);

    const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
    const [isAssetEditMode, setIsAssetEditMode] = useState(false);
    const [currentAsset, setCurrentAsset] = useState<Partial<GiftUpgradeAsset>>({
        name: '', asset_type: 'background', url: '', is_active: true, available_from: null
    });

    const [isAssetsListModalOpen, setIsAssetsListModalOpen] = useState(false);
    
    // Bulk Upload States
    const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
    const [previewAssets, setPreviewAssets] = useState<Array<{ url: string, filename: string, suggested_type: string, suggested_render_mode?: string }>>([]);
    const [isUploadingBulk, setIsUploadingBulk] = useState(false);

    const [isBundleModalOpen, setIsBundleModalOpen] = useState(false);
    const [isBundleEditMode, setIsBundleEditMode] = useState(false);
    const [currentBundle, setCurrentBundle] = useState<Partial<GiftUpgradeBundle>>({
        name: '', skins: [], disabled_assets: []
    });

    const [isUpgradeLinkModalOpen, setIsUpgradeLinkModalOpen] = useState(false);
    const [currentUpgradeLinkItem, setCurrentUpgradeLinkItem] = useState<ShopItem | null>(null);
    const [linkUpgradeBundleId, setLinkUpgradeBundleId] = useState<string>('');
    const [linkUpgradePrice, setLinkUpgradePrice] = useState<string>('');

    const [error, setError] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentItem, setCurrentItem] = useState<Partial<ShopItem>>({
        name: '', description: '', price: 0, item_type: 'avatar',
        rarity: 'common', stock: null, image_path: '', per_user_limit: null, is_active: true, is_physical: false,
        is_upgradable: false, upgrade_price: null, available_from: null
    });
    
    // Dynamic custom types/rarities support
    const [isCreatingNewType, setIsCreatingNewType] = useState(false);
    const [isCreatingNewRarity, setIsCreatingNewRarity] = useState(false);
    const uniqueTypes = Array.from(new Set(['avatar', 'background', 'gift', 'stationery', ...items.map(i => i.item_type)])).filter(Boolean);
    const uniqueRarities = Array.from(new Set(['common', 'rare', 'super_rare', 'legendary', ...items.map(i => i.rarity)])).filter(Boolean);

    const [isUploading, setIsUploading] = useState(false);

    const handleImageUpload = async (file: File) => {
        setIsUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.postFormData<{ success: boolean; image_path: string }>('/admin/market/items/upload', formData);
            if (res.success && res.image_path) {
                setCurrentItem(prev => ({ ...prev, image_path: res.image_path }));
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsUploading(false);
        }
    };

    const handleAssetImageUpload = async (file: File) => {
        setIsUploading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.postFormData<{ success: boolean; image_url: string }>('/admin/market/upgrade-assets/upload', formData);
            if (res.success && res.image_url) {
                setCurrentAsset(prev => ({ ...prev, image_url: res.image_url }));
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsUploading(false);
        }
    };

    const fetchItems = useCallback(async (showLoader = true, isLoadMore = false, currentPage = 0, archived = false) => {
        if (showLoader && !isLoadMore) setLoading(true);
        if (isLoadMore) setLoadingMore(true);
        try {
            const skip = currentPage * 50;
            const archivedParam = archived ? '&include_archived=true' : '';
            const res = await api.get<{ items: ShopItem[], has_more: boolean }>(`/admin/market/items?skip=${skip}&limit=50${archivedParam}`);
            const filtered = archived
                ? (res.items || []).filter((i: ShopItem) => i.is_archived)
                : (res.items || []);

            if (isLoadMore) {
                setItems(prev => {
                    const existing = new Set(prev.map(i => i.id));
                    return [...prev, ...filtered.filter((i: ShopItem) => !existing.has(i.id))];
                });
            } else {
                setItems(filtered);
            }
            setHasMore(res.has_more);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            if (showLoader && !isLoadMore) setLoading(false);
            if (isLoadMore) setLoadingMore(false);
        }
    }, []);

    const fetchTransactions = useCallback(async (isLoadMore = false, currentPage = 0, overrideSearch?: string, overrideType?: string) => {
        setTxLoading(true);
        try {
            const skip = currentPage * 100;
            const s = overrideSearch !== undefined ? overrideSearch : txSearch;
            const t = overrideType !== undefined ? overrideType : txTypeFilter;

            let url = `/admin/market/transactions?skip=${skip}&limit=100`;
            if (s) url += `&search=${encodeURIComponent(s)}`;
            if (t) url += `&item_type=${encodeURIComponent(t)}`;

            const res = await api.get<{ transactions: MarketTransaction[], has_more: boolean }>(url);

            if (isLoadMore) {
                setTransactions(prev => {
                    // don't filter by set since id won't be unique if grouped, but wait, the API returns unique tx IDs.
                    const existing = new Set(prev.map(i => i.id));
                    return [...prev, ...(res.transactions || []).filter(i => !existing.has(i.id))];
                });
            } else {
                setTransactions(res.transactions || []);
            }
            setTxHasMore(res.has_more);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setTxLoading(false);
        }
    }, [txSearch, txTypeFilter]);

    const fetchInventoryStats = useCallback(async () => {
        setInvLoading(true);
        try {
            const res = await api.get<{stats: InventoryStat[]}>('/admin/market/inventory-stats');
            setInventoryStats(res.stats || []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setInvLoading(false);
        }
    }, []);

    const fetchUpgradeAssets = useCallback(async () => {
        setAssetsLoading(true);
        try {
            const res = await api.get<GiftUpgradeAsset[]>('/admin/market/upgrade-assets');
            setUpgradeAssets(Array.isArray(res) ? res : []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setAssetsLoading(false);
        }
    }, []);

    const fetchUpgradeBundles = useCallback(async () => {
        setBundlesLoading(true);
        try {
            const res = await api.get<GiftUpgradeBundle[]>('/admin/market/upgrade-bundles');
            setUpgradeBundles(Array.isArray(res) ? res : []);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setAssetsLoading(false);
        }
    }, []);

    const observer = useRef<IntersectionObserver | null>(null);
    const observerRefCallback = useCallback((node: HTMLDivElement | null) => {
        if (observer.current) observer.current.disconnect();
        if (!node) return;
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting) {
                if (activeTab === 'catalog' && canLoadMoreRef.current) {
                    setPage(p => {
                        const nextPage = p + 1;
                        fetchItems(false, true, nextPage);
                        return nextPage;
                    });
                } else if (activeTab === 'transactions' && canLoadMoreTxRef.current) {
                    setTxPage(p => {
                        const nextPage = p + 1;
                        fetchTransactions(true, nextPage);
                        return nextPage;
                    });
                }
            }
        }, { rootMargin: '100px' });
        observer.current.observe(node);
    }, [fetchItems, fetchTransactions, activeTab]);

    useEffect(() => {
        if (activeTab === 'catalog') {
            setPage(0);
            fetchItems(true, false, 0, false);
        } else if (activeTab === 'archive') {
            setPage(0);
            fetchItems(true, false, 0, true);
        } else if (activeTab === 'transactions') {
            setTxPage(0);
            fetchTransactions(false, 0);
        } else if (activeTab === 'inventory') {
            fetchInventoryStats();
        } else if (activeTab === 'upgrade_assets') {
            fetchUpgradeAssets();
            fetchUpgradeBundles();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);



    const handleOpenModal = (item?: ShopItem) => {
        if (item) {
            setCurrentItem(item);
            setIsEditMode(true);
        } else {
            setCurrentItem({
                name: '', description: '', price: 0, item_type: 'avatar',
                rarity: 'common', stock: null, image_path: '', per_user_limit: null, is_active: true, is_physical: false
            });
            setIsEditMode(false);
        }
        setIsCreatingNewType(false);
        setIsCreatingNewRarity(false);
        setError('');
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setError('');
    };

    const handleOpenAssetModal = (asset?: GiftUpgradeAsset) => {
        if (asset) {
            setCurrentAsset(asset);
            setIsAssetEditMode(true);
        } else {
            setCurrentAsset({
                name: '', asset_type: 'background', render_mode: 'cover', image_url: '', is_active: true, available_from: null
            });
            setIsAssetEditMode(false);
        }
        setError('');
        setIsAssetModalOpen(true);
    };

    const handleCloseAssetModal = () => {
        setIsAssetModalOpen(false);
        setError('');
    };

    const handleBulkUploadFiles = async (files: File[]) => {
        try {
            setIsUploadingBulk(true);
            const formData = new FormData();
            files.forEach(file => formData.append('files', file));

            const response = await api.postFormData<Array<{ url: string; filename: string; suggested_type: string; suggested_render_mode?: string }>>(
                '/admin/market/upload-bulk',
                formData,
            );

            setPreviewAssets(response);
            setIsPreviewModalOpen(true);
        } catch (err) {
            showError('Ошибка загрузки файлов');
            console.error(err);
        } finally {
            setIsUploadingBulk(false);
        }
    };

    const handleSaveBulkAssets = async () => {
        try {
            setIsSaving(true);
            const payload = previewAssets.map(asset => ({
                name: asset.filename,
                url: asset.url,
                asset_type: asset.suggested_type,
                render_mode: asset.suggested_render_mode || 'cover',
                is_active: true
            }));
            
            await api.post('/admin/market/upgrade-assets/bulk', payload);
            showSuccess('Активы успешно загружены');
            setIsPreviewModalOpen(false);
            setPreviewAssets([]);
            fetchUpgradeAssets(); // Refresh the list
        } catch (err) {
            showError('Ошибка при сохранении активов');
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveAsset = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            setError('');

            const url = isAssetEditMode && currentAsset.id
                ? `/admin/market/upgrade-assets/${currentAsset.id}`
                : '/admin/market/upgrade-assets';

            const payload: Partial<GiftUpgradeAsset> = { ...currentAsset };
            if (!payload.image_url) {
                throw new Error('Картинка обязательна');
            }
            // Бэкенд ожидает поле `url`, а форма держит выбранную картинку как `image_url`.
            payload.url = payload.image_url;
            delete payload.image_url;

            // Конвертация available_from в UTC, если задано
            if (payload.available_from) {
                const date = new Date(payload.available_from);
                payload.available_from = date.toISOString();
            } else {
                payload.available_from = null;
            }

            if (isAssetEditMode) {
                await api.patch(url, payload);
            } else {
                await api.post(url, payload);
            }

            await fetchUpgradeAssets();
            showSuccess('Актив сохранён');
            handleCloseAssetModal();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteAsset = async (id: number) => {
        if (!confirm('Удалить этот актив? Это действие необратимо (но пользователи, уже купившие его, сохранят его).')) return;
        try {
            await api.del(`/admin/market/upgrade-assets/${id}`);
            await fetchUpgradeAssets();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    const handleOpenBundleModal = (bundle?: GiftUpgradeBundle) => {
        if (bundle) {
            setCurrentBundle(bundle);
            setIsBundleEditMode(true);
        } else {
            setCurrentBundle({ name: '', skins: [], disabled_assets: [] });
            setIsBundleEditMode(false);
        }
        setError('');
        setIsBundleModalOpen(true);
    };

    const handleCloseBundleModal = () => {
        setIsBundleModalOpen(false);
        setError('');
    };

    const handleSaveBundle = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            setError('');

            const url = isBundleEditMode && currentBundle.id
                ? `/admin/market/upgrade-bundles/${currentBundle.id}`
                : '/admin/market/upgrade-bundles';

            const payload = { ...currentBundle };
            if (!payload.name) throw new Error('Название обязательно');

            if (isBundleEditMode) {
                await api.patch(url, payload);
            } else {
                await api.post(url, payload);
            }

            await fetchUpgradeBundles();
            showSuccess('Набор улучшений сохранён');
            handleCloseBundleModal();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteBundle = async (id: number) => {
        if (!confirm('Удалить этот набор? Улучшенные подарки сохранят свои свойства, но новые улучшить будет нельзя.')) return;
        try {
            await api.del(`/admin/market/upgrade-bundles/${id}`);
            await fetchUpgradeBundles();
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    const handleOpenUpgradeLinkModal = (item: ShopItem) => {
        setCurrentUpgradeLinkItem(item);
        setLinkUpgradeBundleId(item.upgrade_bundle_id ? String(item.upgrade_bundle_id) : '');
        setLinkUpgradePrice(item.upgrade_price ? String(item.upgrade_price) : '');
        setError('');
        setIsUpgradeLinkModalOpen(true);
    };

    const handleCloseUpgradeLinkModal = () => {
        setIsUpgradeLinkModalOpen(false);
        setError('');
    };

    const handleSaveUpgradeLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentUpgradeLinkItem) return;
        try {
            setIsSaving(true);
            setError('');

            const payload: Partial<ShopItem> = {
                upgrade_bundle_id: linkUpgradeBundleId ? Number(linkUpgradeBundleId) : null,
                upgrade_price: linkUpgradePrice ? Number(linkUpgradePrice) : null,
                is_upgradable: !!linkUpgradeBundleId // Legacy compatibility if needed
            };

            await api.put(`/admin/market/items/${currentUpgradeLinkItem.id}`, payload);
            
            setPage(0);
            await fetchItems(false, false, 0);
            showSuccess('Улучшение привязано');
            handleCloseUpgradeLinkModal();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsSaving(true);
            setError('');

            const url = isEditMode && currentItem.id
                ? `/admin/market/items/${currentItem.id}`
                : '/admin/market/items';

            // Clean up nulls
            const payload = { ...currentItem };
            if ((payload.stock as unknown as string) === '') payload.stock = null;
            if ((payload.per_user_limit as unknown as string) === '') payload.per_user_limit = null;
            if (payload.stock !== null && payload.stock !== undefined) payload.stock = Number(payload.stock);
            if (payload.per_user_limit !== null && payload.per_user_limit !== undefined) payload.per_user_limit = Number(payload.per_user_limit);
            payload.price = Number(payload.price);
            
            if (payload.item_type === 'gift') {
                if ((payload.upgrade_price as unknown as string) === '') payload.upgrade_price = null;
                if (payload.upgrade_price !== null && payload.upgrade_price !== undefined) payload.upgrade_price = Number(payload.upgrade_price);
            } else {
                payload.is_upgradable = false;
                payload.upgrade_price = null;
            }

            if (payload.available_from) {
                const date = new Date(payload.available_from);
                payload.available_from = date.toISOString();
            } else {
                payload.available_from = null;
            }

            if (isEditMode) {
                await api.put(url, payload);
            } else {
                await api.post(url, payload);
            }

            setPage(0);
            await fetchItems(false, false, 0);
            showSuccess('Изменения применены');
            handleCloseModal();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setIsSaving(false);
        }
    };

    const handleArchive = async (id: number) => {
        if (!confirm('Архивировать этот товар? Он исчезнет из каталога, но останется в инвентарях пользователей.')) return;
        try {
            await api.del(`/admin/market/items/${id}`);
            setPage(0);
            await fetchItems(false, false, 0, activeTab === 'archive');
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    const handleRestore = async (id: number) => {
        try {
            await api.post(`/admin/market/items/${id}/restore`, {});
            setPage(0);
            await fetchItems(false, false, 0, true);
        } catch (err: unknown) {
            alert(err instanceof Error ? err.message : String(err));
        }
    };

    const groupedTransactions = useMemo(() => {
        const grouped: MarketTransaction[] = [];
        for (const tx of transactions) {
            const last = grouped[grouped.length - 1];
            if (last && last.user.id === tx.user.id && last.reason === tx.reason) {
                last.amount += tx.amount;
                last.count = (last.count || 1) + 1;
            } else {
                grouped.push({ ...tx, count: 1 });
            }
        }
        return grouped;
    }, [transactions]);

    const handleTxSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setTxPage(0);
        fetchTransactions(false, 0, txSearch, txTypeFilter);
    };

    if (loading && items.length === 0 && activeTab === 'catalog') {
        return <div className={styles.loading}>Загрузка...</div>;
    }

    return (
        <div className={styles.managmentContainer} style={{ overflowAnchor: 'none' }}>
            <div className={styles.questTabs}>
                <button
                    className={`${styles.questTab} ${activeTab === 'catalog' ? styles.active : ''}`}
                    onClick={() => setActiveTab('catalog')}
                >
                    Каталог товаров
                </button>
                <button
                    className={`${styles.questTab} ${activeTab === 'archive' ? styles.active : ''}`}
                    onClick={() => setActiveTab('archive')}
                >
                    Архив
                </button>
                <button
                    className={`${styles.questTab} ${activeTab === 'inventory' ? styles.active : ''}`}
                    onClick={() => setActiveTab('inventory')}
                >
                    Складской учет
                </button>
                <button
                    className={`${styles.questTab} ${activeTab === 'transactions' ? styles.active : ''}`}
                    onClick={() => setActiveTab('transactions')}
                >
                    История покупок
                </button>
                <button
                    className={`${styles.questTab} ${activeTab === 'upgrade_assets' ? styles.active : ''}`}
                    onClick={() => setActiveTab('upgrade_assets')}
                >
                    Панель улучшений
                </button>
                <button
                    className={`${styles.questTab} ${activeTab === 'upgrade_assets_pool' ? styles.active : ''}`}
                    onClick={() => setActiveTab('upgrade_assets_pool')}
                >
                    Фоны и узоры
                </button>
            </div>

            {error && !isModalOpen && <div className={styles.errorMessage}>{error}</div>}

            {(activeTab === 'catalog' || activeTab === 'archive') && (
                <>
                    <div className={styles.actionHeader}>
                        {activeTab === 'catalog' && (
                            <button className={styles.actionBtn} onClick={() => handleOpenModal()}>
                                Добавить товар
                            </button>
                        )}
                        {activeTab === 'archive' && (
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                                Архивированные товары скрыты из каталога. Инвентари пользователей сохранены.
                            </p>
                        )}
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Превью</th>
                                    <th>Название</th>
                                    <th>Тип / Редкость</th>
                                    <th>Цена</th>
                                    <th>Кол-во</th>
                                    <th>Лимит</th>
                                    <th>Статус</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map(item => (
                                    <tr key={item.id} className={!item.is_active ? styles.inactiveRow : ''}>
                                        <td>{item.id}</td>
                                        <td>
                                            {item.image_path && (
                                                <div style={{ width: 40, height: 40, background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={item.image_path} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className={styles.cell_bold}>{item.name}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{item.description}</div>
                                        </td>
                                        <td>
                                            <div>{item.item_type}</div>
                                            <span style={{ fontSize: 12, opacity: 0.8 }}>{item.rarity}</span>
                                        </td>
                                        <td>{item.price} L</td>
                                        <td>{item.stock === null ? '∞' : item.stock}</td>
                                        <td>{item.per_user_limit === null ? '∞' : `${item.per_user_limit} на чел`}</td>
                                        <td>
                                            {item.is_archived ? (
                                                <span className={styles.statusBadge_inactive}>🗄️ Архив</span>
                                            ) : (
                                                <span className={item.is_active ? styles.statusBadge : styles.statusBadge_inactive}>
                                                    {item.is_active ? 'Активен' : 'Скрыт'}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            {item.is_archived ? (
                                                <button
                                                    className={styles.btnSecondary}
                                                    title="Восстановить из архива"
                                                    onClick={() => handleRestore(item.id)}
                                                    style={{ padding: '6px 12px', fontSize: '12px' }}
                                                >Восстановить</button>
                                            ) : (
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                                                    {item.item_type === 'gift' && (
                                                        <button 
                                                            className={styles.btnPrimary} 
                                                            title="Настройки улучшений"
                                                            onClick={() => handleOpenUpgradeLinkModal(item)}
                                                            style={{ padding: '4px 10px', fontSize: '12px' }}
                                                        >Улучшение</button>
                                                    )}
                                                    <button 
                                                        className={styles.btnSecondary} 
                                                        onClick={() => handleOpenModal(item)}
                                                        style={{ padding: '4px 10px', fontSize: '12px' }}
                                                    >Редактировать</button>
                                                    <button
                                                        className={styles.btnSecondary}
                                                        title="Архивировать (инвентарь сохраняется)"
                                                        onClick={() => handleArchive(item.id)}
                                                        style={{ padding: '4px 10px', fontSize: '12px', borderColor: 'var(--error)', color: 'var(--error)' }}
                                                    >Архивировать</button>
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {items.length === 0 && !loading && (
                                    <tr>
                                        <td colSpan={9} style={{ textAlign: 'center', padding: '2rem' }}>
                                            {activeTab === 'archive' ? 'Архив пуст' : 'Нет товаров'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {hasMore && !loading && (activeTab === 'catalog' || activeTab === 'archive') && (
                        <div ref={observerRefCallback} style={{ height: '20px', margin: '20px 0' }}>
                            {loadingMore && <div className={styles.empty}>Загрузка дополнительных товаров...</div>}
                        </div>
                    )}
                </>
            )}

            {activeTab === 'upgrade_assets' && (
                <>
                    <div className={styles.actionHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', flex: 1 }}>
                            Настройки улучшений для подарков. Здесь вы можете создавать пулы вариаций и привязывать их к товарам.
                        </p>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className={styles.btnPrimary} onClick={() => handleOpenBundleModal()}>
                                Добавить улучшение
                            </button>
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Название набора</th>
                                    <th>Вариаций (скинов)</th>
                                    <th>Исключено фонов/узоров</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upgradeBundles.map(bundle => (
                                    <tr key={bundle.id}>
                                        <td>{bundle.id}</td>
                                        <td>
                                            <div className={styles.cell_bold}>{bundle.name}</div>
                                        </td>
                                        <td>{bundle.skins?.length || 0} шт.</td>
                                        <td>{bundle.disabled_assets?.length || 0} шт.</td>
                                        <td>
                                            <div className={styles.actions}>
                                                <button onClick={() => handleOpenBundleModal(bundle)} className={styles.editBtn}>
                                                    Ред.
                                                </button>
                                                <button onClick={() => handleDeleteBundle(bundle.id)} className={styles.deleteBtn}>
                                                    Удал.
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {upgradeBundles.length === 0 && !bundlesLoading && (
                                    <tr>
                                        <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                                            Нет наборов улучшений
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'upgrade_assets_pool' && (
                <>
                    <div className={styles.actionHeader} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ flex: 1, paddingRight: '20px' }}>
                                <h3 style={{ margin: '0 0 10px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>Глобальный пул (Фоны и Узоры)</h3>
                                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                                    Эти фоны и узоры будут доступны для всех наборов улучшений. Вы можете управлять их режимами отрисовки.
                                </p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className={styles.btnSecondary} onClick={() => setIsPreviewModalOpen(true)}>
                                    Массовая загрузка (Zip/Папки)
                                </button>
                                <button className={styles.btnPrimary} onClick={() => handleOpenAssetModal()}>
                                    Новый актив
                                </button>
                            </div>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', padding: '15px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '1rem', color: 'var(--text-primary)' }}>ℹ️ Мини-FAQ: Режимы отрисовки</h4>
                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: '250px' }}>
                                    <strong style={{ color: 'var(--accent-primary)' }}>Как есть (Cover)</strong>
                                    <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                                        Изображение будет растянуто на всю карточку. Идеально подходит для заранее заготовленных больших картинок (уже готовых паттернов или полноценных фонов).
                                    </p>
                                </div>
                                <div style={{ flex: 1, minWidth: '250px' }}>
                                    <strong style={{ color: 'var(--accent-primary)' }}>По шаблону (Repeat)</strong>
                                    <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                                        Изображение будет уменьшено и размножено по всему фону (как в Telegram). Идеально для одиночных маленьких иконок (например, один леденец 🍬 или снежинка ❄️).
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Превью</th>
                                    <th>Название</th>
                                    <th>Тип</th>
                                    <th>Отрисовка</th>
                                    <th>Статус</th>
                                    <th>Действия</th>
                                </tr>
                            </thead>
                            <tbody>
                                {upgradeAssets.map(asset => (
                                    <tr key={asset.id} className={!asset.is_active ? styles.inactiveRow : ''}>
                                        <td>{asset.id}</td>
                                        <td>
                                            <div style={{ width: 40, height: 40, background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            </div>
                                        </td>
                                        <td>
                                            <div className={styles.cell_bold}>{asset.name}</div>
                                        </td>
                                        <td>{asset.asset_type === 'background' ? 'Фон' : 'Узор'}</td>
                                        <td>
                                            <span style={{ fontSize: 12, padding: '2px 6px', background: 'var(--bg-primary)', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                                {asset.render_mode === 'repeat' ? 'По шаблону' : asset.render_mode === 'contain' ? 'По центру' : 'Как есть'}
                                            </span>
                                        </td>
                                        <td>
                                            <span className={asset.is_active ? styles.statusBadge : styles.statusBadge_inactive}>
                                                {asset.is_active ? 'Активен' : 'Скрыт'}
                                            </span>
                                        </td>
                                        <td>
                                            <div className={styles.actions}>
                                                <button onClick={() => handleOpenAssetModal(asset)} className={styles.editBtn}>
                                                    Ред.
                                                </button>
                                                <button onClick={() => handleDeleteAsset(asset.id)} className={styles.deleteBtn}>
                                                    Удал.
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {upgradeAssets.length === 0 && !assetsLoading && (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                                            Нет активов
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {activeTab === 'transactions' && (
                <>
                    <div className={styles.actionHeader} style={{ marginBottom: '1rem' }}>
                        <form onSubmit={handleTxSearch} style={{ display: 'flex', gap: '1rem', width: '100%', maxWidth: '800px' }}>
                            <input
                                type="text"
                                placeholder="Поиск по логину, имени или названию товара"
                                value={txSearch}
                                onChange={e => setTxSearch(e.target.value)}
                                style={{ flex: 1, padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            />
                            <select
                                value={txTypeFilter}
                                onChange={e => setTxTypeFilter(e.target.value)}
                                style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            >
                                <option value="">Все типы</option>
                                <option value="avatar">Аватар</option>
                                <option value="background">Фон</option>
                                <option value="gift">Подарок</option>
                                <option value="stationery">Канцелярия</option>
                            </select>
                            <button type="submit" className={styles.actionBtn}>
                                Поиск
                            </button>
                        </form>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Ученик</th>
                                    <th>Предмет</th>
                                    <th>Тип</th>
                                    <th>Количество</th>
                                    <th>Общая сумма</th>
                                    <th>Последняя покупка</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedTransactions.map((tx: MarketTransaction) => (
                                    <tr key={tx.id}>
                                        <td>
                                            <div className={styles.cell_bold}>{tx.user.login}</div>
                                            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                                                {tx.user.first_name || ''} {tx.user.last_name || ''}
                                            </div>
                                        </td>
                                        <td>{tx.item_name || tx.reason.replace('Покупка: ', '')}</td>
                                        <td>{tx.item_type || '-'}</td>
                                        <td style={{ fontWeight: 600 }}>{tx.count} шт.</td>
                                        <td style={{ color: 'var(--error)', fontWeight: 600 }}>
                                            {tx.amount} L
                                        </td>
                                        <td>{new Date(tx.created_at).toLocaleString('ru-RU')}</td>
                                    </tr>
                                ))}
                                {groupedTransactions.length === 0 && !txLoading && (
                                    <tr>
                                        <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                                            Покупок не найдено
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {txHasMore && !txLoading && activeTab === 'transactions' && (
                        <div ref={observerRefCallback} style={{ height: '20px', margin: '20px 0' }}>
                            <div className={styles.empty}>Загрузка дополнительных логов...</div>
                        </div>
                    )}
                </>
            )}

            {activeTab === 'inventory' && (
                <>
                    <div className={styles.actionHeader} style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ margin: 0, color: 'var(--text-primary)' }}>Статистика выдачи товаров</h3>
                            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                                Здесь отображаются товары, у которых есть остаток или которые были куплены для физической выдачи.
                            </p>
                        </div>
                    </div>

                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Название</th>
                                    <th>Тип</th>
                                    <th>Остаток на складе</th>
                                    <th>Всего куплено (шт)</th>
                                    <th>Выдано (шт)</th>
                                    <th>Ожидают выдачи (шт)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inventoryStats.map((stat: InventoryStat) => (
                                    <tr key={stat.id}>
                                        <td>{stat.id}</td>
                                        <td>
                                            <div className={styles.cell_bold} style={{ cursor: 'pointer', color: 'var(--accent-primary)' }} onClick={() => handleOpenModal(items.find(i => i.id === stat.id) || stat as unknown as ShopItem)}>
                                                {stat.name}
                                            </div>
                                        </td>
                                        <td>{stat.item_type}</td>
                                        <td>
                                            <span style={{ fontWeight: 600, color: stat.stock_remaining !== null && stat.stock_remaining < 5 ? 'var(--error)' : 'inherit' }}>
                                                {stat.stock_remaining === null ? '∞' : stat.stock_remaining}
                                            </span>
                                        </td>
                                        <td>{stat.total_purchased}</td>
                                        <td style={{ color: 'var(--success)' }}>{stat.total_issued}</td>
                                        <td>
                                            <span style={{ fontWeight: 600, color: stat.total_unissued > 0 ? 'var(--warning-text)' : 'inherit' }}>
                                                {stat.total_unissued}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {inventoryStats.length === 0 && !invLoading && (
                                    <tr>
                                        <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>
                                            Склад пуст или нет данных
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={isEditMode ? 'Редактировать товар' : 'Новый товар'}
            >
                <div className={styles.modalBody}>

                    <form onSubmit={handleSave} className={styles.modalForm}>
                        {error && <div className={styles.errorMessage}>{error}</div>}

                        <div className={styles.formGroup}>
                            <label>Название товара</label>
                            <input
                                type="text"
                                value={currentItem.name || ''}
                                onChange={e => setCurrentItem({ ...currentItem, name: e.target.value })}
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>Описание</label>
                            <input
                                type="text"
                                value={currentItem.description || ''}
                                onChange={e => setCurrentItem({ ...currentItem, description: e.target.value })}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <label>Цена (Ливок)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={currentItem.price || ''}
                                    onChange={e => setCurrentItem({ ...currentItem, price: e.target.value as unknown as number })}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <label>Остаток (пусто = ∞)</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={currentItem.stock === null ? '' : currentItem.stock}
                                    onChange={e => setCurrentItem({ ...currentItem, stock: (e.target.value === '' ? null : e.target.value) as unknown as number })}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <label>Тип</label>
                                {isCreatingNewType ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            value={currentItem.item_type || ''} 
                                            onChange={e => setCurrentItem({ ...currentItem, item_type: e.target.value })} 
                                            placeholder="Введите новый тип" 
                                            autoFocus 
                                            required 
                                        />
                                        <button type="button" className={styles.btnSecondary} style={{ padding: '0 12px', minWidth: 'auto' }} onClick={() => { setIsCreatingNewType(false); setCurrentItem({...currentItem, item_type: 'avatar'}); }}>&times;</button>
                                    </div>
                                ) : (
                                    <select
                                        value={currentItem.item_type || 'avatar'}
                                        onChange={e => {
                                            if (e.target.value === '__NEW__') {
                                                setIsCreatingNewType(true);
                                                setCurrentItem({ ...currentItem, item_type: '' });
                                            } else {
                                                setCurrentItem({ ...currentItem, item_type: e.target.value });
                                            }
                                        }}
                                    >
                                        {uniqueTypes.map(t => <option key={t} value={t}>{TYPE_TRANSLATIONS[t] || t}</option>)}
                                        <option value="__NEW__" style={{ fontWeight: 'bold' }}>+ Создать новый тип</option>
                                    </select>
                                )}
                            </div>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <label>Редкость</label>
                                {isCreatingNewRarity ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input 
                                            type="text" 
                                            value={currentItem.rarity || ''} 
                                            onChange={e => setCurrentItem({ ...currentItem, rarity: e.target.value })} 
                                            placeholder="Введите новую редкость" 
                                            autoFocus 
                                            required 
                                        />
                                        <button type="button" className={styles.btnSecondary} style={{ padding: '0 12px', minWidth: 'auto' }} onClick={() => { setIsCreatingNewRarity(false); setCurrentItem({...currentItem, rarity: 'common'}); }}>&times;</button>
                                    </div>
                                ) : (
                                    <select
                                        value={currentItem.rarity || 'common'}
                                        onChange={e => {
                                            if (e.target.value === '__NEW__') {
                                                setIsCreatingNewRarity(true);
                                                setCurrentItem({ ...currentItem, rarity: '' });
                                            } else {
                                                setCurrentItem({ ...currentItem, rarity: e.target.value });
                                            }
                                        }}
                                    >
                                        {uniqueRarities.map(r => <option key={r} value={r}>{RARITY_TRANSLATIONS[r] || r}</option>)}
                                        <option value="__NEW__" style={{ fontWeight: 'bold' }}>+ Создать новую редкость</option>
                                    </select>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
                            <div className={styles.formGroup} style={{ flex: 1 }}>
                                <label>Лимит на 1 человека (пусто = ∞)</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={currentItem.per_user_limit === null ? '' : currentItem.per_user_limit}
                                    onChange={e => setCurrentItem({ ...currentItem, per_user_limit: (e.target.value === '' ? null : e.target.value) as unknown as number })}
                                />
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '8px', paddingTop: '16px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={currentItem.is_active || false}
                                        onChange={e => setCurrentItem({ ...currentItem, is_active: e.target.checked })}
                                    />
                                    Активен для покупки
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                                    <input
                                        type="checkbox"
                                        checked={currentItem.is_physical || false}
                                        onChange={e => setCurrentItem({ ...currentItem, is_physical: e.target.checked })}
                                    />
                                    Физ. товар (лежит на складе)
                                </label>
                            </div>
                        </div>

                        {!isEditMode && (
                            <div className={styles.formGroup}>
                                <label>Отложенная публикация (оставьте пустым для мгновенной)</label>
                                <input
                                    type="datetime-local"
                                    value={currentItem.available_from ? new Date(currentItem.available_from).toISOString().slice(0, 16) : ''}
                                    onChange={e => setCurrentItem({ ...currentItem, available_from: e.target.value || null })}
                                />
                            </div>
                        )}

                        {currentItem.item_type === 'gift' && (
                            <div style={{ padding: '1rem', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: '1rem', fontWeight: 'bold' }}>
                                    <input
                                        type="checkbox"
                                        checked={currentItem.is_upgradable || false}
                                        onChange={e => setCurrentItem({ ...currentItem, is_upgradable: e.target.checked })}
                                    />
                                    Доступно для улучшения (узоры/фоны)
                                </label>
                                {currentItem.is_upgradable && (
                                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                                        <label>Цена улучшения (Ливок)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={currentItem.upgrade_price === null ? '' : currentItem.upgrade_price}
                                            onChange={e => setCurrentItem({ ...currentItem, upgrade_price: (e.target.value === '' ? null : e.target.value) as unknown as number })}
                                            required
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className={styles.formGroup}>
                            <label>Картинка товара (Drag & Drop или путь)</label>
                            <div
                                style={{
                                    border: '2px dashed var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: 'var(--bg-secondary)',
                                    position: 'relative',
                                    marginBottom: '0.5rem'
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleImageUpload(file);
                                }}
                                onClick={() => document.getElementById('marketImageUpload')?.click()}
                            >
                                {isUploading ? (
                                    <span style={{ color: 'var(--text-secondary)' }}>Загрузка картинки...</span>
                                ) : currentItem.image_path ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={currentItem.image_path} alt="Preview" style={{ height: 80, objectFit: 'contain' }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Кликните или перетащите новую картинку для замены</span>
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--text-secondary)' }}>Перетащите картинку сюда или кликните для выбора</span>
                                )}
                                <input
                                    id="marketImageUpload"
                                    type="file"
                                    accept="image/png, image/jpeg, image/gif, image/webp"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleImageUpload(file);
                                    }}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Или введите путь: /static/market/image.svg или /uploads/market/..."
                                value={currentItem.image_path || ''}
                                onChange={e => setCurrentItem({ ...currentItem, image_path: e.target.value })}
                            />
                        </div>



                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={handleCloseModal}>ОТМЕНА</button>
                            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                                {isSaving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            <Modal
                isOpen={isAssetModalOpen}
                onClose={handleCloseAssetModal}
                title={isAssetEditMode ? 'Редактировать актив' : 'Новый актив'}
            >
                <div className={styles.modalBody}>
                    <form onSubmit={handleSaveAsset} className={styles.modalForm}>
                        {error && <div className={styles.errorMessage}>{error}</div>}

                        <div className={styles.formGroup}>
                            <label>Название</label>
                            <input
                                type="text"
                                value={currentAsset.name || ''}
                                onChange={e => setCurrentAsset({ ...currentAsset, name: e.target.value })}
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>Тип актива</label>
                            <select
                                value={currentAsset.asset_type || 'background'}
                                onChange={e => setCurrentAsset({ ...currentAsset, asset_type: e.target.value as 'background' | 'pattern' })}
                            >
                                <option value="background">Фон</option>
                                <option value="pattern">Узор</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Режим отрисовки</label>
                            <select
                                value={currentAsset.render_mode || 'cover'}
                                onChange={e => setCurrentAsset({ ...currentAsset, render_mode: e.target.value })}
                            >
                                <option value="cover">Как есть (Cover)</option>
                                <option value="repeat">По шаблону (Repeat)</option>
                                <option value="contain">По центру (Contain)</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                                <input
                                    type="checkbox"
                                    checked={currentAsset.is_active ?? true}
                                    onChange={e => setCurrentAsset({ ...currentAsset, is_active: e.target.checked })}
                                />
                                Активен
                            </label>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Картинка актива (Обязательно)</label>
                            <div
                                style={{
                                    border: '2px dashed var(--border-color)',
                                    borderRadius: '8px',
                                    padding: '1rem',
                                    textAlign: 'center',
                                    cursor: 'pointer',
                                    background: 'var(--bg-secondary)',
                                    position: 'relative',
                                    marginBottom: '0.5rem'
                                }}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => {
                                    e.preventDefault();
                                    const file = e.dataTransfer.files[0];
                                    if (file) handleAssetImageUpload(file);
                                }}
                                onClick={() => document.getElementById('assetImageUpload')?.click()}
                            >
                                {isUploading ? (
                                    <span style={{ color: 'var(--text-secondary)' }}>Загрузка картинки...</span>
                                ) : currentAsset.image_url ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={currentAsset.image_url} alt="Preview" style={{ height: 80, objectFit: 'contain' }} />
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Кликните или перетащите новую картинку для замены</span>
                                    </div>
                                ) : (
                                    <span style={{ color: 'var(--text-secondary)' }}>Перетащите картинку сюда или кликните для выбора</span>
                                )}
                                <input
                                    id="assetImageUpload"
                                    type="file"
                                    accept="image/png, image/jpeg, image/gif, image/webp"
                                    style={{ display: 'none' }}
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleAssetImageUpload(file);
                                    }}
                                />
                            </div>
                            <input
                                type="text"
                                placeholder="Или введите путь"
                                value={currentAsset.image_url || ''}
                                onChange={e => setCurrentAsset({ ...currentAsset, image_url: e.target.value })}
                                required
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={handleCloseAssetModal}>ОТМЕНА</button>
                            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                                {isSaving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* Bundle Edit Modal */}
            <Modal
                isOpen={isBundleModalOpen}
                onClose={handleCloseBundleModal}
                title={isBundleEditMode ? 'Редактировать набор улучшений' : 'Новый набор улучшений'}
            >
                <div className={styles.modalBody}>
                    <form onSubmit={handleSaveBundle} className={styles.modalForm}>
                        <div className={styles.formGroup}>
                            <label>Название набора</label>
                            <input
                                type="text"
                                value={currentBundle.name || ''}
                                onChange={e => setCurrentBundle({ ...currentBundle, name: e.target.value })}
                                placeholder="Например: Подарок на 8 марта"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>Вариации (Скины)</label>
                            <div style={{ marginBottom: 12 }}>
                                <DragDropUploader 
                                    onUpload={async (files) => {
                                        try {
                                            setIsUploadingBulk(true);
                                            const formData = new FormData();
                                            files.forEach(file => formData.append('files', file));

                                            const response = await api.postFormData<Array<{ url: string }>>(
                                                '/admin/market/upload-bulk',
                                                formData,
                                            );

                                            const newUrls = response.map(r => r.url);
                                            setCurrentBundle(prev => ({
                                                ...prev,
                                                skins: [...(prev.skins || []), ...newUrls]
                                            }));
                                        } catch (err) {
                                            showError('Ошибка загрузки вариаций');
                                            console.error(err);
                                        } finally {
                                            setIsUploadingBulk(false);
                                        }
                                    }}
                                    isLoading={isUploadingBulk}
                                    label="Перетащите ZIP архив или картинки для добавления скинов"
                                    sublabel="Без ограничения по количеству"
                                />
                            </div>
                            
                            {(currentBundle.skins || []).length > 0 && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 10, marginTop: 10, background: 'var(--bg-secondary)', padding: 10, borderRadius: 8 }}>
                                    {(currentBundle.skins || []).map((url, idx) => (
                                        <div key={idx} style={{ position: 'relative', width: '100%', aspectRatio: '1', background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={url} alt={`Скин ${idx}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            <button 
                                                type="button"
                                                onClick={() => {
                                                    const newSkins = [...(currentBundle.skins || [])];
                                                    newSkins.splice(idx, 1);
                                                    setCurrentBundle({ ...currentBundle, skins: newSkins });
                                                }}
                                                style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(239, 68, 68, 0.8)', color: 'white', border: 'none', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 10 }}
                                                title="Удалить скин"
                                            >✕</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>При покупке подарка ученику случайно выпадет один из этих скинов.</p>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Отключенные фоны и узоры</label>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px' }}>
                                {upgradeAssets.map(asset => (
                                    <label key={asset.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={!currentBundle.disabled_assets?.includes(asset.id)}
                                            onChange={e => {
                                                const checked = e.target.checked;
                                                setCurrentBundle(prev => {
                                                    const disabled = prev.disabled_assets || [];
                                                    if (checked) {
                                                        return { ...prev, disabled_assets: disabled.filter(id => id !== asset.id) };
                                                    } else {
                                                        return { ...prev, disabled_assets: [...disabled, asset.id] };
                                                    }
                                                });
                                            }}
                                        />
                                        <div style={{ width: 24, height: 24, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img src={asset.url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <span style={{ fontSize: 14 }}>{asset.name} ({asset.asset_type === 'background' ? 'Фон' : 'Узор'})</span>
                                    </label>
                                ))}
                                {upgradeAssets.length === 0 && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Нет доступных активов</span>}
                            </div>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button type="button" className={styles.btnSecondary} style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setCurrentBundle({ ...currentBundle, disabled_assets: [] })}>Включить все</button>
                                <button type="button" className={styles.btnSecondary} style={{ padding: '4px 8px', fontSize: 12 }} onClick={() => setCurrentBundle({ ...currentBundle, disabled_assets: upgradeAssets.map(a => a.id) })}>Отключить все</button>
                            </div>
                        </div>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={handleCloseBundleModal}>ОТМЕНА</button>
                            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                                {isSaving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* Link Upgrade Modal */}
            <Modal
                isOpen={isUpgradeLinkModalOpen}
                onClose={handleCloseUpgradeLinkModal}
                title="Настройка улучшения для товара"
            >
                <div className={styles.modalBody}>
                    <form onSubmit={handleSaveUpgradeLink} className={styles.modalForm}>
                        <div className={styles.formGroup}>
                            <label>Товар: {currentUpgradeLinkItem?.name}</label>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Набор улучшений</label>
                            <select
                                value={linkUpgradeBundleId}
                                onChange={e => setLinkUpgradeBundleId(e.target.value)}
                            >
                                <option value="">-- Без улучшений --</option>
                                {upgradeBundles.map(bundle => (
                                    <option key={bundle.id} value={bundle.id}>{bundle.name}</option>
                                ))}
                            </select>
                        </div>

                        {linkUpgradeBundleId && (
                            <div className={styles.formGroup}>
                                <label>Стоимость улучшения (в Ливках)</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="Оставьте пустым для дефолтной цены (25)"
                                    value={linkUpgradePrice}
                                    onChange={e => setLinkUpgradePrice(e.target.value)}
                                />
                            </div>
                        )}

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnSecondary} onClick={handleCloseUpgradeLinkModal}>ОТМЕНА</button>
                            <button type="submit" className={styles.btnPrimary} disabled={isSaving}>
                                {isSaving ? 'СОХРАНЕНИЕ...' : 'СОХРАНИТЬ'}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            {/* Bulk Upload Preview Modal */}
            <Modal
                isOpen={isPreviewModalOpen}
                onClose={() => {
                    setIsPreviewModalOpen(false);
                    setPreviewAssets([]);
                    setIsAssetsListModalOpen(true);
                }}
                title="Массовая загрузка активов"
                size="xxl"
            >
                <div className={styles.modalBody}>
                    {previewAssets.length === 0 ? (
                        <DragDropUploader 
                            onUpload={handleBulkUploadFiles} 
                            isLoading={isUploadingBulk}
                            label="Перетащите ZIP архив или папку с фонами и узорами"
                        />
                    ) : (
                        <>
                            <div className={styles.actionHeader} style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
                                    Найдено файлов: {previewAssets.length}. Вы можете отредактировать названия и типы перед сохранением.
                                </p>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button className={styles.btnSecondary} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => {
                                        setPreviewAssets(prev => prev.map(a => ({ ...a, suggested_render_mode: 'repeat' })));
                                    }}>
                                        Отрисовать все по шаблону (Repeat)
                                    </button>
                                    <button className={styles.btnSecondary} style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => {
                                        setPreviewAssets(prev => prev.map(a => ({ ...a, suggested_render_mode: 'cover' })));
                                    }}>
                                        Отрисовать все как есть (Cover)
                                    </button>
                                </div>
                            </div>
                            <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>
                                            <th style={{ width: 60 }}>Превью</th>
                                            <th>Название</th>
                                            <th style={{ width: 130 }}>Тип</th>
                                            <th style={{ width: 170 }}>Режим отрисовки</th>
                                            <th style={{ width: 60 }}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewAssets.map((asset, index) => (
                                            <tr key={index}>
                                                <td>
                                                    <div style={{ width: 40, height: 40, background: '#1e293b', borderRadius: 8, overflow: 'hidden' }}>
                                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                                        <img src={asset.url} alt={asset.filename} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                </td>
                                                <td>
                                                    <input 
                                                        type="text" 
                                                        value={asset.filename}
                                                        onChange={e => {
                                                            const newAssets = [...previewAssets];
                                                            newAssets[index].filename = e.target.value;
                                                            setPreviewAssets(newAssets);
                                                        }}
                                                        style={{ width: '100%', padding: '6px 12px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'white' }}
                                                    />
                                                </td>
                                                <td>
                                                    <select 
                                                        value={asset.suggested_type}
                                                        onChange={e => {
                                                            const newAssets = [...previewAssets];
                                                            newAssets[index].suggested_type = e.target.value;
                                                            setPreviewAssets(newAssets);
                                                        }}
                                                        style={{ width: '100%', padding: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'white' }}
                                                    >
                                                        <option value="background">Фон</option>
                                                        <option value="pattern">Узор</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select 
                                                        value={asset.suggested_render_mode || 'cover'}
                                                        onChange={e => {
                                                            const newAssets = [...previewAssets];
                                                            newAssets[index].suggested_render_mode = e.target.value;
                                                            setPreviewAssets(newAssets);
                                                        }}
                                                        style={{ width: '100%', padding: '6px', background: 'var(--bg-input)', border: '1px solid var(--border-color)', borderRadius: 6, color: 'white' }}
                                                    >
                                                        <option value="cover">Как есть (Cover)</option>
                                                        <option value="repeat">По шаблону (Repeat)</option>
                                                        <option value="contain">По центру (Contain)</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <button 
                                                        className={styles.deleteBtn}
                                                        onClick={() => {
                                                            const newAssets = [...previewAssets];
                                                            newAssets.splice(index, 1);
                                                            setPreviewAssets(newAssets);
                                                        }}
                                                        title="Удалить файл"
                                                    >Удал.</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className={styles.modalActions} style={{ marginTop: 20 }}>
                                <button type="button" className={styles.btnSecondary} onClick={() => {
                                    setPreviewAssets([]);
                                }}>СБРОСИТЬ</button>
                                <button type="button" className={styles.btnPrimary} onClick={handleSaveBulkAssets} disabled={isSaving || previewAssets.length === 0}>
                                    {isSaving ? 'СОХРАНЕНИЕ...' : `СОХРАНИТЬ АКТИВЫ (${previewAssets.length})`}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>
        </div>
    );
}
