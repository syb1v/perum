
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import styles from '@/app/admin/page.module.css';
import { User } from '@/types';
import BalanceModal from './modals/BalanceModal';
import AdminWalletModal from './modals/AdminWalletModal';
import EditUserModal from './modals/EditUserModal';

interface UsersResponse {
    users: User[];
}

export default function UserManagement() {
    const { showSuccess, showError } = useToast();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    // Стабильный стейт для колбека
    const canLoadMoreRef = useRef(false);
    canLoadMoreRef.current = hasMore && !loading && !loadingMore;

    // Filters and sorting
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [sortConfigs, setSortConfigs] = useState<Record<string, { by: 'id' | 'name', order: 'asc' | 'desc' }>>({});

    // Modals state
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [selectedUsersForModal, setSelectedUsersForModal] = useState<User[]>([]);
    const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
    const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
    const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
    const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);

    // Debounce search
    const [debouncedSearch, setDebouncedSearch] = useState('');
    useEffect(() => {
        const timer = setTimeout(() => setSearch(debouncedSearch), 500);
        return () => clearTimeout(timer);
    }, [debouncedSearch]);

    const fetchUsers = useCallback(async (showLoader = true, isLoadMore = false, currentPage = 0) => {
        if (showLoader && !isLoadMore) setLoading(true);
        if (isLoadMore) setLoadingMore(true);
        try {
            const skip = currentPage * 50;
            const res = await api.get<UsersResponse & { has_more: boolean }>(`/admin/users/search?query=${encodeURIComponent(search)}&role=${roleFilter}&skip=${skip}&limit=50`);

            if (isLoadMore) {
                setUsers(prev => {
                    const existing = new Set(prev.map(u => u.id));
                    return [...prev, ...res.users.filter(u => !existing.has(u.id))];
                });
            } else {
                setUsers(res.users);
            }
            setHasMore(res.has_more);
        } catch (error) {
            console.error(error);
            showError('Не удалось загрузить пользователей');
        } finally {
            if (showLoader && !isLoadMore) setLoading(false);
            if (isLoadMore) setLoadingMore(false);
        }
    }, [search, roleFilter, showError]);

    const fetchUsersRef = useRef<typeof fetchUsers | null>(null);
    useEffect(() => {
        fetchUsersRef.current = fetchUsers;
    }, [fetchUsers]);

    const toggleUserSelection = (id: number) => {
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAllUsers = (usersToToggle: User[]) => {
        const allSelected = usersToToggle.every(u => selectedUserIds.has(u.id));
        setSelectedUserIds(prev => {
            const next = new Set(prev);
            if (allSelected) {
                usersToToggle.forEach(u => next.delete(u.id));
            } else {
                usersToToggle.forEach(u => next.add(u.id));
            }
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (selectedUserIds.size === 0) return;
        if (!confirm(`Вы уверены, что хотите удалить ${selectedUserIds.size} пользователей?`)) return;

        try {
            await Promise.all(Array.from(selectedUserIds).map(id => api.del(`/admin/users/${id}`)));
            showSuccess(`Удалено ${selectedUserIds.size} пользователей`);
            setSelectedUserIds(new Set());
            fetchUsers(false, false, 0);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка при массовом удалении');
        }
    };

    const observer = useRef<IntersectionObserver | null>(null);
    const observerRefCallback = useCallback((node: HTMLDivElement | null) => {
        if (observer.current) observer.current.disconnect();
        if (!node) return;
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && canLoadMoreRef.current) {
                setPage(p => {
                    const nextPage = p + 1;
                    if (fetchUsersRef.current) fetchUsersRef.current(false, true, nextPage);
                    return nextPage;
                });
            }
        }, { rootMargin: '100px' });
        observer.current.observe(node);
    }, []);

    useEffect(() => {
        setPage(0);
        fetchUsers(true, false, 0);
    }, [fetchUsers]);



    const handleDelete = async (user: User) => {
        if (!confirm(`Вы уверены, что хотите удалить пользователя ${user.login}?`)) return;

        try {
            await api.del(`/admin/users/${user.id}`);
            showSuccess('Пользователь удален');
            fetchUsers(false, false, 0);
        } catch (error: unknown) {
            showError(error instanceof Error ? error.message : 'Ошибка удаления');
        }
    };

    const formatName = (u: User) => {
        return [u.last_name, u.first_name, u.patronymic].filter(Boolean).join(' ') || '—';
    };

    const handleSort = (role: string, field: 'id' | 'name') => {
        setSortConfigs(prev => {
            const current = prev[role] || { by: 'id', order: 'desc' };
            if (current.by === field) {
                return { ...prev, [role]: { by: field, order: current.order === 'asc' ? 'desc' : 'asc' } };
            }
            return { ...prev, [role]: { by: field, order: 'asc' } };
        });
    };

    const renderTable = (role: string, title: string) => {
        let filtered = users.filter(u => u.role === role);
        if (roleFilter !== 'all' && role !== roleFilter) return null;
        if (roleFilter === 'all' && filtered.length === 0) return null; // Не показывать пустые таблицы в режиме "Все роли"

        const sortConfig = sortConfigs[role] || { by: 'id', order: 'desc' };
        filtered = filtered.sort((a, b) => {
            let res = 0;
            if (sortConfig.by === 'id') {
                res = a.id - b.id;
            } else if (sortConfig.by === 'name') {
                res = formatName(a).localeCompare(formatName(b), 'ru', { numeric: true });
            }
            return sortConfig.order === 'asc' ? res : -res;
        });

        return (
            <div className={styles.card}>
                <div className={styles.sectionHeader}>
                    <h2>{title}</h2>
                    <span className={styles.usersCount}>{filtered.length}</span>
                </div>
                <div className={styles.tableContainer}>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th style={{ width: '40px', textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={filtered.length > 0 && filtered.every(u => selectedUserIds.has(u.id))}
                                        onChange={() => toggleAllUsers(filtered)}
                                    />
                                </th>
                                <th onClick={() => handleSort(role, 'id')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        ID
                                        {sortConfig.by === 'id' && <span style={{ fontSize: '0.8em', opacity: 0.7 }}>{sortConfig.order === 'asc' ? '▲' : '▼'}</span>}
                                        {sortConfig.by !== 'id' && <span style={{ fontSize: '0.8em', opacity: 0.2 }}>▲</span>}
                                    </div>
                                </th>
                                <th>Логин</th>
                                <th onClick={() => handleSort(role, 'name')} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        ФИО
                                        {sortConfig.by === 'name' && <span style={{ fontSize: '0.8em', opacity: 0.7 }}>{sortConfig.order === 'asc' ? '▲' : '▼'}</span>}
                                        {sortConfig.by !== 'name' && <span style={{ fontSize: '0.8em', opacity: 0.2 }}>▲</span>}
                                    </div>
                                </th>
                                {role === 'student' && <th>Баланс</th>}
                                <th>Пароль изменен</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 ? (
                                <tr>
                                    <td colSpan={role === 'student' ? 7 : 6} className={styles.empty}>Нет пользователей</td>
                                </tr>
                            ) : (
                                filtered.map(u => (
                                    <tr key={u.id} className={selectedUserIds.has(u.id) ? styles.selectedRow : ''}>
                                        <td style={{ textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={selectedUserIds.has(u.id)}
                                                onChange={() => toggleUserSelection(u.id)}
                                            />
                                        </td>
                                        <td>{u.id}</td>
                                        <td>{u.login}</td>
                                        <td>{formatName(u)}</td>
                                        {role === 'student' && <td>{u.balance}</td>}
                                        <td>
                                            <span className={`${styles.statusBadge} ${u.password_changed ? styles.yes : styles.no}`}>
                                                {u.password_changed ? '✓' : '⚠'}
                                            </span>
                                        </td>
                                        <td>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                {role === 'student' && (
                                                    <>
                                                        <button
                                                            className={styles.actionBtn}
                                                            onClick={() => { setSelectedUser(u); setIsWalletModalOpen(true); }}
                                                        >
                                                            Кошелек
                                                        </button>
                                                        <button
                                                            className={styles.actionBtn}
                                                            onClick={() => { setSelectedUser(u); setSelectedUsersForModal([]); setIsBalanceModalOpen(true); }}
                                                        >
                                                            + Ливки
                                                        </button>
                                                    </>
                                                )}

                                                <button
                                                    className={styles.actionBtn}
                                                    onClick={() => { setSelectedUser(u); setIsEditUserModalOpen(true); }}
                                                >
                                                    Ред.
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.danger}`}
                                                    onClick={() => handleDelete(u)}
                                                >
                                                    Удалить
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    return (
        <div style={{ overflowAnchor: 'none' }}>
            <div className={styles.searchBar}>
                <div className={styles.searchInputWrapper}>
                    <svg className={styles.searchIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8" />
                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Поиск по ФИО, логину..."
                        value={debouncedSearch}
                        onChange={(e) => setDebouncedSearch(e.target.value)}
                    />
                </div>
                <div className={styles.roleFilter}>
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                        <option value="all">Все роли</option>
                        <option value="student">Ученики</option>
                        <option value="teacher">Учителя</option>
                        <option value="class_teacher">Классные руководители</option>
                        <option value="parent">Родители</option>
                        <option value="admin">Администраторы</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <div className={styles.loading}>Загрузка...</div>
            ) : (
                <>
                    {renderTable('admin', 'Администраторы')}
                    {renderTable('class_teacher', 'Классные руководители')}
                    {renderTable('teacher', 'Учителя')}
                    {renderTable('parent', 'Родители')}
                    {renderTable('student', 'Ученики')}
                </>
            )}

            {hasMore && !loading && (
                <div ref={observerRefCallback} style={{ height: '20px', margin: '20px 0' }}>
                    {loadingMore && <div className={styles.empty}>Загрузка дополнительных пользователей...</div>}
                </div>
            )}

            {selectedUserIds.size > 0 && (
                <div className={styles.bulkActionsPanel}>
                    <span className={styles.bulkText}>Выбрано: {selectedUserIds.size}</span>
                    <div className={styles.bulkActionsButtons}>
                        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={handleBulkDelete}>
                            Удалить выбранных
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={() => {
                                const selectedUsersList = users.filter(u => selectedUserIds.has(u.id));
                                setSelectedUser(null);
                                setSelectedUsersForModal(selectedUsersList);
                                setIsBalanceModalOpen(true);
                            }}
                        >
                            + Ливки выбранным
                        </button>
                    </div>
                </div>
            )}

            <BalanceModal
                isOpen={isBalanceModalOpen}
                onClose={() => setIsBalanceModalOpen(false)}
                user={selectedUsersForModal.length > 0 ? selectedUsersForModal : selectedUser}
                onSuccess={() => {
                    setSelectedUserIds(new Set());
                    fetchUsers(false, false, 0);
                }}
            />

            <AdminWalletModal
                isOpen={isWalletModalOpen}
                onClose={() => setIsWalletModalOpen(false)}
                user={selectedUser}
            />

            <EditUserModal
                isOpen={isEditUserModalOpen}
                onClose={() => setIsEditUserModalOpen(false)}
                user={selectedUser}
                onSuccess={() => fetchUsers(false, false, 0)}
            />
        </div>
    );
}
