import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import client from '@/types/openapi';

interface ActivityItem {
    id: number;
    title: string;
    description: string;
    created_at: string;
    class_name?: string;
    subject_name?: string;
}

interface ClassResponse {
    id: number;
    name: string;
    student_count: number;
    created_at: string;
}

interface ClassesResponse {
    classes: ClassResponse[];
}

interface HomeworkResponse {
    homework: ActivityItem[];
}
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
            return data as unknown as ClassesResponse;
        },
        enabled: !!user,
    });

    const { data: homeworkData, isLoading: isLoadingHomework } = useQuery({
        queryKey: ['teacher', 'homework'],
        queryFn: async () => {
            const { data, error } = await client.GET('/api/teacher/homework', {});
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if (error) throw new Error((error as any)?.detail || 'Ошибка загрузки ДЗ');
            return data as unknown as HomeworkResponse;
        },
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
