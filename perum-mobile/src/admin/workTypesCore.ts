import type { components } from '@perum/api-schema/tenant';

export type JournalWorkTypes = components['schemas']['JournalWorkTypesOut'];
export type JournalWorkType = components['schemas']['JournalWorkTypeOut'];

export function workTypesPath() { return '/journal/work-types'; }

export function workTypeWeightLabel(workType: JournalWorkType) { return `Вес: ${String(workType.weight)}`; }
