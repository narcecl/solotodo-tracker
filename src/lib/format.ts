const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

const dateTime = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
});

const timeOnly = new Intl.DateTimeFormat('es-CL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
});

const weekdayOnly = new Intl.DateTimeFormat('es-CL', {
    weekday: 'long',
    timeZone: 'America/Santiago',
});

function startOfDayInSantiago(date: Date): Date {
    const santiagoParts = new Intl.DateTimeFormat('es-CL', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        timeZone: 'America/Santiago',
    }).formatToParts(date);

    const year = Number(santiagoParts.find((p) => p.type === 'year')!.value);
    const month = Number(santiagoParts.find((p) => p.type === 'month')!.value);
    const day = Number(santiagoParts.find((p) => p.type === 'day')!.value);

    return new Date(year, month - 1, day);
}

export function formatCLP(amount: number): string {
    return clp.format(amount);
}

export function formatDateTime(date: Date): string {
    return dateTime.format(date);
}

export function formatFriendlyDate(date: Date): string {
    const santiagoNow = new Date(
        new Date().toLocaleString('en-US', { timeZone: 'America/Santiago' })
    );

    const santiagoDate = new Date(
        date.toLocaleString('en-US', { timeZone: 'America/Santiago' })
    );

    const nowStart = startOfDayInSantiago(santiagoNow);
    const dateStart = startOfDayInSantiago(santiagoDate);

    const diffMs = nowStart.getTime() - dateStart.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    const time = timeOnly.format(date);

    if (diffDays === 0) {
        return `Hoy a las ${time}`;
    }

    if (diffDays === 1) {
        return `Ayer a las ${time}`;
    }

    if (diffDays >= 2 && diffDays <= 6) {
        const weekday = weekdayOnly.format(date);
        return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} a las ${time}`;
    }

    return formatDateTime(date);
}
