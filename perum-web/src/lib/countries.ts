// Страны для выбора локации ноды. Флаг рендерится из ISO-кода через emoji.
export interface Country {
    code: string;   // ISO 3166-1 alpha-2
    name: string;   // русское название
}

export const COUNTRIES: Country[] = [
    { code: 'RU', name: 'Россия' },
    { code: 'BY', name: 'Беларусь' },
    { code: 'KZ', name: 'Казахстан' },
    { code: 'UA', name: 'Украина' },
    { code: 'DE', name: 'Германия' },
    { code: 'NL', name: 'Нидерланды' },
    { code: 'FR', name: 'Франция' },
    { code: 'GB', name: 'Великобритания' },
    { code: 'PL', name: 'Польша' },
    { code: 'FI', name: 'Финляндия' },
    { code: 'SE', name: 'Швеция' },
    { code: 'US', name: 'США' },
    { code: 'CA', name: 'Канада' },
    { code: 'TR', name: 'Турция' },
    { code: 'AE', name: 'ОАЭ' },
    { code: 'SG', name: 'Сингапур' },
    { code: 'JP', name: 'Япония' },
    { code: 'HK', name: 'Гонконг' },
    { code: 'CN', name: 'Китай' },
    { code: 'IN', name: 'Индия' },
    { code: 'AM', name: 'Армения' },
    { code: 'GE', name: 'Грузия' },
    { code: 'AZ', name: 'Азербайджан' },
    { code: 'LV', name: 'Латвия' },
    { code: 'LT', name: 'Литва' },
    { code: 'EE', name: 'Эстония' },
    { code: 'CH', name: 'Швейцария' },
    { code: 'IT', name: 'Италия' },
    { code: 'ES', name: 'Испания' },
    { code: 'CZ', name: 'Чехия' },
];

// ISO-код → emoji-флаг (regional indicator symbols).
export function flagEmoji(code?: string | null): string {
    if (!code || code.length !== 2) return '🏳️';
    const cc = code.toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return '🏳️';
    const base = 0x1f1e6;
    return String.fromCodePoint(
        base + (cc.charCodeAt(0) - 65),
        base + (cc.charCodeAt(1) - 65),
    );
}

export function countryName(code?: string | null): string {
    if (!code) return '';
    return COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code;
}
