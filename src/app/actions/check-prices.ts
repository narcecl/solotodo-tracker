'use server';

import { refresh } from 'next/cache';
import { type CheckSummary, checkPrices } from '@/lib/check-prices';
import { createCheckDeps } from '@/lib/deps';
import { parseId } from '@/lib/validation';
import type { ActionResult } from './types';

async function runManualCheck(trackedUrlId?: number): Promise<ActionResult<CheckSummary>> {
    const summary = await checkPrices(createCheckDeps(), { source: 'manual', trackedUrlId });
    if (summary.checked === 0) return { ok: false, error: 'No se pudo actualizar ningún precio' };
    refresh();
    return { ok: true, data: summary };
}

export async function syncTrackedUrlAction(id: number): Promise<ActionResult<CheckSummary>> {
    const parsed = parseId(id);
    if (parsed === null) return { ok: false, error: 'No encontrada' };
    return runManualCheck(parsed);
}

export async function syncAllAction(): Promise<ActionResult<CheckSummary>> {
    return runManualCheck();
}
