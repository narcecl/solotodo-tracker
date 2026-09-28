const clp = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });

const dateTime = new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Santiago',
});

export function formatCLP(amount: number): string {
    return clp.format(amount);
}

export function formatDateTime(date: Date): string {
    return dateTime.format(date);
}
