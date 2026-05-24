import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import client from '@/types/openapi';
import type { components } from '@/types/api';

type InventoryItemResponse = components['schemas']['InventoryItemResponse'];

export function useStudentProfile() {
    const { user, refreshUser } = useAuth();
    const { showError, showInfo, showSuccess } = useToast();

    const queryClient = useQueryClient();

    /* ── Equipped gift ids (up to 10) ── */
    const [equippedIds, setEquippedIds] = useState<number[]>(() => {
        if (typeof window !== 'undefined') {
            try {
                const saved = localStorage.getItem('equipped_gifts');
                if (saved) return JSON.parse(saved) as number[];
            } catch { /* ignore */ }
        }
        return [];
    });

    /* ═══════ API Queries ═══════ */
    const { data: inventoryData } = useQuery({
        queryKey: ['market', 'inventory'],
        queryFn: async () => {
            const { data, error } = await client.GET('/api/market/inventory', {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (error) throw new Error((error as any)?.detail || 'Ошибка инвентаря');
            return data as unknown as readonly InventoryItemResponse[];
        },
        enabled: !!user,
    });

    const gifts = (inventoryData || []).filter((i: InventoryItemResponse) => i.item.item_type === 'gift');
    const marketAvatars = (inventoryData || []).filter((i: InventoryItemResponse) => i.item.item_type === 'avatar');

    /* ═══════ Toggle equipped gift ═══════ */
    const handleToggleEquip = (invId: number) => {
        setEquippedIds(prev => {
            const index = prev.indexOf(invId);
            let next: number[];
            if (index !== -1) {
                next = prev.filter(id => id !== invId);
            } else {
                if (prev.length >= 10) {
                    showInfo('Максимум 10 подарков можно надеть');
                    return prev;
                }
                next = [...prev, invId];
            }
            localStorage.setItem('equipped_gifts', JSON.stringify(next));
            return next;
        });
    };

    /* ═══════ Get equipped gifts from inventory ═══════ */
    const equippedGifts = equippedIds
        .map(id => gifts.find((inv: InventoryItemResponse) => inv.id === id))
        .filter(Boolean) as InventoryItemResponse[];

    /* ═══════ Mutations ═══════ */
    const equipMutation = useMutation({
        mutationFn: async (invId: number) => {
            const { error } = await client.POST('/api/market/equip/{inventory_id}', {
                params: { path: { inventory_id: invId } }
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (error) throw new Error((error as any)?.detail || 'Ошибка экипировки');
        },
        onSuccess: () => {
            showSuccess('Аватар обновлен');
            refreshUser();
            queryClient.invalidateQueries({ queryKey: ['market', 'inventory'] });
        },
        onError: (err) => {
            showError(err.message);
        }
    });

    const defaultAvatarMutation = useMutation({
        mutationFn: async (url: string) => {
            const { error } = await client.POST('/api/user/set-default-avatar', {
                body: { avatar_url: url }
            });
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (error) throw new Error((error as any)?.detail || 'Ошибка обновления');
        },
        onSuccess: () => {
            showSuccess('Аватар обновлен');
            refreshUser();
            queryClient.invalidateQueries({ queryKey: ['market', 'inventory'] });
        },
        onError: (err) => {
            showError(err.message);
        }
    });

    const handleEquipAvatar = (invId: number, onSuccess?: () => void) => {
        equipMutation.mutate(invId, {
            onSuccess: () => {
                if (onSuccess) onSuccess();
            }
        });
    };

    const handleSetDefaultAvatar = (url: string, onSuccess?: () => void) => {
        defaultAvatarMutation.mutate(url, {
            onSuccess: () => {
                if (onSuccess) onSuccess();
            }
        });
    };

    /* ═══════ Placeholder handler ═══════ */
    const comingSoon = () => {
        showInfo('Эта функция будет доступна в ближайшем обновлении!');
    };

    /* ═══════ Helpers ═══════ */
    const displayName = [user?.last_name, user?.first_name, user?.patronymic].filter(Boolean).join(' ') || user?.login || 'Загрузка...';

    return {
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
    };
}
