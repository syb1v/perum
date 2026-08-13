import { test, expect, type Page } from '@playwright/test';

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

function fixture(): Fixture {
    const raw = process.env.E2E_FIXTURE;
    if (!raw) throw new Error('E2E_FIXTURE is missing: global setup did not run');
    return JSON.parse(raw) as Fixture;
}

async function login(
    page: Page,
    credentials: { login: string; password: string },
    dashboardPath: string,
): Promise<void> {
    await page.goto('/login');
    await page.getByLabel('Логин').fill(credentials.login);
    await page.locator('#password').fill(credentials.password);
    await Promise.all([
        page.waitForResponse(response =>
            response.url().endsWith('/api/login') && response.request().method() === 'POST' && response.ok(),
        ),
        page.waitForResponse(response =>
            new URL(response.url()).pathname === dashboardPath
            && response.request().resourceType() === 'document'
            && response.status() === 200,
        ),
        page.getByRole('button', { name: 'Войти' }).click(),
    ]);
    await expect(page).toHaveURL(new RegExp(`${dashboardPath}$`));
}

test('teacher grade is visible to student and linked parent', async ({ browser }) => {
    const fx = fixture();
    const studentFullName = `${fx.studentLastName} ${fx.studentFirstName}`;

    const teacherContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    await login(teacherPage, { login: fx.teacherLogin, password: fx.teacherPassword }, '/teacher');
    await expect(teacherPage.getByText('Главная', { exact: true }).first()).toBeVisible();
    await teacherPage.goto(`/journal?view=grades&classId=${fx.classId}&subjectId=${fx.subjectId}`);

    const teacherRow = teacherPage.getByRole('row').filter({ hasText: studentFullName });
    await expect(teacherRow).toBeVisible();

    await teacherPage
        .getByRole('button', { name: `Добавить оценку: ${studentFullName}, ${fx.gradeDate}` })
        .click();
    await expect(teacherPage.getByRole('heading', { name: 'Новая оценка' })).toBeVisible();
    await teacherPage.locator('button[data-grade="5"]').click();

    const mutationPromise = teacherPage.waitForResponse(response =>
        response.url().endsWith('/api/journal/grades') && response.request().method() === 'POST',
    );
    await teacherPage.getByRole('button', { name: 'Поставить оценку' }).click();
    const mutationResponse = await mutationPromise;
    expect(mutationResponse.ok()).toBe(true);
    const mutation = await mutationResponse.json() as { grade_id: number; grade_value: number };
    const gradeId = mutation.grade_id;
    expect(mutation.grade_value).toBe(5);

    await expect(teacherPage.getByText('Оценка выставлена', { exact: true })).toBeVisible();
    await expect(teacherRow.getByText('5', { exact: true }).first()).toBeVisible();

    await teacherPage.getByRole('button', { name: 'Добавить Д/З' }).first().click();
    await teacherPage.getByPlaceholder('Например: Параграф 15').fill('E2E домашнее задание');
    const homeworkPromise = teacherPage.waitForResponse(response =>
        response.url().endsWith('/api/homework') && response.request().method() === 'POST',
    );
    await teacherPage.getByRole('button', { name: 'Создать задание' }).click();
    const homeworkResponse = await homeworkPromise;
    expect(homeworkResponse.ok()).toBe(true);
    await teacherContext.close();

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await login(studentPage, { login: fx.studentLogin, password: fx.studentPassword }, '/student');
    await expect(studentPage.getByText('Главная', { exact: true }).first()).toBeVisible();
    await studentPage.goto('/schedule');

    const studentReadPromise = studentPage.waitForResponse(response =>
        response.url().endsWith('/api/student/grades') && response.request().method() === 'GET',
    );
    await studentPage.getByRole('button', { name: 'Успеваемость' }).click();
    const studentRead = await studentReadPromise;
    expect(studentRead.ok()).toBe(true);
    const studentBody = await studentRead.json() as {
        grades: Array<{ id: number; value: number; subject_id: number; subject_name: string }>;
    };
    expect(studentBody.grades).toContainEqual(
        expect.objectContaining({ id: gradeId, value: 5, subject_id: fx.subjectId, subject_name: fx.subjectName }),
    );

    const studentSubjectRow = studentPage.getByRole('row').filter({
        has: studentPage.getByText(fx.subjectName, { exact: true }),
    });
    await expect(studentSubjectRow.getByText('5', { exact: true }).first()).toBeVisible();
    await expect(studentSubjectRow.getByText('5.00', { exact: true })).toBeVisible();
    await studentPage.getByRole('button', { name: 'Дневник' }).click();
    const homeworkIndicator = studentPage.getByText('ДЗ', { exact: true });
    await expect(homeworkIndicator).toBeVisible();
    await homeworkIndicator.click();
    await expect(studentPage.getByText('E2E домашнее задание', { exact: true })).toBeVisible();
    await studentContext.close();

    const parentContext = await browser.newContext();
    const parentPage = await parentContext.newPage();
    await login(parentPage, { login: fx.parentLogin, password: fx.parentPassword }, '/parent');

    await expect(parentPage.getByRole('heading', { name: studentFullName })).toBeVisible();

    const parentReadPromise = parentPage.waitForResponse(response =>
        response.url().endsWith(`/api/parent/children/${fx.studentId}/grades`) && response.request().method() === 'GET',
    );
    await parentPage.getByRole('button', { name: 'Оценки', exact: true }).click();
    const parentRead = await parentReadPromise;
    expect(parentRead.ok()).toBe(true);
    const parentBody = await parentRead.json() as {
        grades: Array<{ id: number; value: number; subject_id: number; subject_name: string }>;
    };
    expect(parentBody.grades).toContainEqual(
        expect.objectContaining({ id: gradeId, value: 5, subject_id: fx.subjectId, subject_name: fx.subjectName }),
    );

    const parentGrade = parentPage.getByRole('article').filter({
        has: parentPage.getByText(fx.subjectName, { exact: true }),
    });
    await expect(parentGrade.getByText('5', { exact: true }).first()).toBeVisible();
    await parentContext.close();
});
