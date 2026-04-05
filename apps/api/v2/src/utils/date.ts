
export const TIMEZONE = 'Asia/Kolkata';

export function getLocalDateString(date: Date = new Date()): string {
    return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export function getLocalDateTimeString(date: Date = new Date()): string {
    const d = new Date(date.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function toLocalDateString(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export function toLocalDateTimeString(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);

    const localDate = new Date(d.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const year = localDate.getFullYear();
    const month = String(localDate.getMonth() + 1).padStart(2, '0');
    const day = String(localDate.getDate()).padStart(2, '0');
    const hours = String(localDate.getHours()).padStart(2, '0');
    const minutes = String(localDate.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function formatDateTime(date: Date | string): string {
    if (!date) return '';
    const d = new Date(date);
    return d.toLocaleString('en-IN', {
        timeZone: TIMEZONE,
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}