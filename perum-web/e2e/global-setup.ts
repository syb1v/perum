import type { FullConfig } from '@playwright/test';

const BASE = process.env.E2E_BASE_URL ?? 'http://school.localhost:4173';
const INTERNAL_TOKEN = process.env.E2E_INTERNAL_TOKEN ?? 'e2e-internal-token';
const ADMIN_EMAIL = 'e2e-admin@example.com';

const CREDENTIALS = {
    teacher: { login: 'e2e-teacher', password: 'e2e-teacher-password' },
    student: { login: 'e2e-student', password: 'e2e-student-password' },
    parent: { login: 'e2e-parent', password: 'e2e-parent-password' },
};

interface Fixture {
    teacherLogin: string;
    teacherPassword: string;
    studentLogin: string;
    studentPassword: string;
    studentFirstName: string;
    studentLastName: string;
    parentLogin: string;
    parentPassword: string;
    classId: number;
    subjectId: number;
    subjectName: string;
    studentId: number;
    gradeDate: string;
}

async function waitForHealth(): Promise<void> {
    const deadline = Date.now() + 90_000;
    let lastError: unknown = null;
    while (Date.now() < deadline) {
        try {
            const [tenantResponse, webResponse] = await Promise.all([
                fetch(`${BASE}/health`),
                fetch(`${BASE}/login`),
            ]);
            if (tenantResponse.ok && webResponse.ok) return;
            lastError = new Error(`health statuses tenant=${tenantResponse.status} web=${webResponse.status}`);
        } catch (error) {
            lastError = error;
        }
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw new Error(`Tenant health check failed: ${String(lastError)}`);
}

async function apiRequest(
    method: string,
    path: string,
    options: { token?: string; internal?: boolean; body?: unknown } = {},
): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    if (options.internal) headers['X-Internal-Token'] = INTERNAL_TOKEN;
    const response = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    const text = await response.text();
    if (!response.ok) {
        throw new Error(`${method} ${path} -> ${response.status}: ${text}`);
    }
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function fixtureDate(): { iso: string; weekday: number; yearStart: string; yearEnd: string } {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    const weekday = (date.getDay() + 6) % 7;
    const yearStart = new Date(date);
    yearStart.setDate(yearStart.getDate() - 7);
    const yearEnd = new Date(date);
    yearEnd.setDate(yearEnd.getDate() + 7);
    const iso = (value: Date) => [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0'),
    ].join('-');
    return { iso: iso(date), weekday, yearStart: iso(yearStart), yearEnd: iso(yearEnd) };
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
    await waitForHealth();

    const bootstrap = await apiRequest('POST', '/internal/bootstrap-school-admin', {
        internal: true,
        body: { email: ADMIN_EMAIL, full_name: 'E2E Admin' },
    });
    const temporaryPassword = bootstrap.temporary_password as string;

    const login = await apiRequest('POST', '/api/login', {
        body: { login: ADMIN_EMAIL, password: temporaryPassword },
    });
    const token = login.access_token as string;

    const subjectName = 'E2E Математика';
    const subject = await apiRequest('POST', '/api/admin/subjects', {
        token,
        body: { name: subjectName, short_name: 'E2E Мат', category: 'normal' },
    });
    const subjectId = (subject.subject as { id: number }).id;

    await apiRequest('POST', '/api/admin/work-types', {
        token,
        body: { name: 'E2E Ответ', weight: 1, is_active: true },
    });

    const klass = await apiRequest('POST', '/api/admin/classes', {
        token,
        body: { name: 'E2E 7А', grade_level: 7, is_profile: 0 },
    });
    const classId = (klass.class as { id: number }).id;

    await apiRequest('POST', '/api/admin/register-users', {
        token,
        body: {
            users: [
                { role: 'teacher', login: CREDENTIALS.teacher.login, password: CREDENTIALS.teacher.password, first_name: 'Учитель', last_name: 'Потокова' },
                { role: 'student', login: CREDENTIALS.student.login, password: CREDENTIALS.student.password, first_name: 'Ученик', last_name: 'Потоков', class_id: classId },
                { role: 'parent', login: CREDENTIALS.parent.login, password: CREDENTIALS.parent.password, first_name: 'Родитель', last_name: 'Потокова' },
            ],
        },
    });

    const users = await apiRequest('GET', '/api/admin/users', { token });
    const byLogin = new Map(
        (users.users as Array<{ id: number; login: string }>).map(user => [user.login, user.id]),
    );
    const teacherId = byLogin.get(CREDENTIALS.teacher.login) as number;
    const studentId = byLogin.get(CREDENTIALS.student.login) as number;
    const parentId = byLogin.get(CREDENTIALS.parent.login) as number;

    await apiRequest('POST', '/api/admin/teacher-subjects', {
        token,
        body: { teacher_id: teacherId, subject_id: subjectId, class_id: classId },
    });

    const links = await apiRequest('PUT', `/api/admin/users/${parentId}/students`, {
        token,
        body: { student_ids: [studentId] },
    });
    if ((links.student_ids as number[]).length !== 1) {
        throw new Error('Parent-student link was not created');
    }

    const dates = fixtureDate();
    const year = await apiRequest('POST', '/api/admin/academic-years', {
        token,
        body: {
            name: 'E2E Год',
            start_date: `${dates.yearStart}T00:00:00`,
            end_date: `${dates.yearEnd}T23:59:59`,
            is_current: true,
        },
    });

    await apiRequest('POST', '/api/admin/school-periods', {
        token,
        body: {
            name: 'E2E период',
            period_type: 'quarter',
            start_date: `${dates.iso}T00:00:00`,
            end_date: `${dates.iso}T23:59:59`,
            is_active: true,
            academic_year_id: year.id as number,
            target_grades: '[7]',
        },
    });

    await apiRequest('PUT', `/api/admin/classes/${classId}/schedule`, {
        token,
        body: {
            items: [
                {
                    subject_id: subjectId,
                    day_of_week: dates.weekday,
                    lesson_number: 1,
                    room: 'E2E',
                    teacher_id: teacherId,
                },
            ],
        },
    });

    const fixture: Fixture = {
        teacherLogin: CREDENTIALS.teacher.login,
        teacherPassword: CREDENTIALS.teacher.password,
        studentLogin: CREDENTIALS.student.login,
        studentPassword: CREDENTIALS.student.password,
        studentFirstName: 'Ученик',
        studentLastName: 'Потоков',
        parentLogin: CREDENTIALS.parent.login,
        parentPassword: CREDENTIALS.parent.password,
        classId,
        subjectId,
        subjectName,
        studentId,
        gradeDate: dates.iso,
    };
    process.env.E2E_FIXTURE = JSON.stringify(fixture);
    console.log('e2e fixture ready:', { classId, subjectId, studentId, gradeDate: dates.iso });
}
