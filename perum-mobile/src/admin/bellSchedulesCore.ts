import type { components } from '@perum/api-schema/tenant';

export type AdminBellSchedules = components['schemas']['AdminBellSchedulesOut'];
export type AdminBellScheduleItem = components['schemas']['AdminBellScheduleItemOut'];

export function bellSchedulesPath() { return '/admin/bell-schedules'; }

export function bellTimeLabel(item: AdminBellScheduleItem) {
  if (item.start_time && item.end_time) return `${item.start_time}–${item.end_time}`;
  return item.start_time ?? item.end_time ?? 'Время не задано';
}

export function splitBellSchedule(items: AdminBellScheduleItem[]) {
  return {
    weekdays: items.filter((item) => !item.is_saturday),
    saturday: items.filter((item) => item.is_saturday),
  };
}
