export const str = (value: unknown, max: number): string => typeof value === 'string' ? value.trim().slice(0, max) : '';
