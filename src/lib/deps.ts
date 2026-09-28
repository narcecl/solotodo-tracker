import { Resend } from 'resend';
import type { CheckDeps } from './check-prices';
import { priceRepo } from './db/repo';
import { DEFAULT_ALERT_FROM, createAlertSender } from './email';
import { createSolotodoClient } from './solotodo';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Falta la variable de entorno ${name}`);
    return value;
}

export function createCheckDeps(): CheckDeps {
    return {
        repo: priceRepo,
        solotodo: createSolotodoClient(),
        sendAlert: (alert) =>
            createAlertSender(new Resend(requireEnv('RESEND_API_KEY')), {
                to: requireEnv('ALERT_EMAIL'),
                from: process.env.ALERT_FROM || DEFAULT_ALERT_FROM,
            })(alert),
        logError: (message, error) => console.error(`[check-prices] ${message}:`, error),
    };
}
