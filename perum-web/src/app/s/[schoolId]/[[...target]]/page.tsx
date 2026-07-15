import Link from 'next/link';

const targets: Record<string, string> = { messages: 'Сообщения', support: 'Поддержка школы', home: 'Главная' };

export default async function SchoolLinkPage({ params }: { params: Promise<{ schoolId: string; target?: string[] }> }) {
  const { schoolId, target } = await params;
  const destination = target?.[0] ?? 'home';
  const validId = /^[0-9a-f-]{36}$/i.test(schoolId);
  const validTarget = destination in targets && (target?.length ?? 0) <= 1;
  if (!validId || !validTarget) return <main style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}><h1>Ссылка недоступна</h1><p>Проверьте адрес или запросите новую ссылку в школе.</p></main>;
  return <main style={{ padding: 32, maxWidth: 560, margin: '0 auto' }}><h1>{targets[destination]}</h1><p>Откройте ссылку в мобильном приложении PERUM. Если приложение не установлено, войдите через адрес вашей школы.</p><Link href="/login">Перейти ко входу</Link></main>;
}
