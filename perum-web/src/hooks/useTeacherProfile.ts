import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import api from '@/lib/apiClient';
import client from '@/types/openapi';
import type { components } from '@perum/api-schema/tenant';

type TeacherHomeworkList = components['schemas']['TeacherHomeworkListOut'];
export function useTeacherProfile() {
    const { user } = useAuth();
    const { showError } = useToast();

    /* ═══════ API Queries ═══════ */
    const { data: classesData, isLoading: isLoadingClasses } = useQuery({
        queryKey: ['teacher', 'classes'],
        queryFn: async () => {
            const { data, error } = await client.GET('/api/teacher/classes', {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (error) throw new Error((error as any)?.detail || 'Ошибка загрузки классов');
            return data;
        },
        enabled: !!user,
    });

    const { data: homeworkData, isLoading: isLoadingHomework } = useQuery({
        queryKey: ['teacher', 'homework'],
        queryFn: () => api.get<TeacherHomeworkList>('/teacher/homework'),
        enabled: !!user,
    });

    /* ── Derived State ── */
    const activity = (homeworkData?.homework || []).slice(0, 5);
    const classes = classesData?.classes || [];
    const studentsCount = classes.reduce((acc, c) => acc + (c.student_count || 0), 0);
    const stats = {
        classesCount: classes.length,
        studentsCount
    };
    const loading = isLoadingClasses || isLoadingHomework;

    /* ═══════ Helpers ═══════ */
    const displayName = [user?.last_name, user?.first_name, user?.patronymic].filter(Boolean).join(' ') || user?.login || 'Загрузка...';

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('ru-RU', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });
    };

    const comingSoon = () => {
        showError('Эта функция будет доступна в ближайшем обновлении!');
    };

    return {
        user,
        stats,
        activity,
        loading,
        displayName,
        formatDate,
        comingSoon,
    };
}
