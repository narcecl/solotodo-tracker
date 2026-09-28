import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

let client: postgres.Sql | null = null;
let db: PostgresJsDatabase<typeof schema> | null = null;

export function getDb(): PostgresJsDatabase<typeof schema> {
    if (!db) {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error('Falta la variable de entorno DATABASE_URL');
        // prepare: false → compatible con el transaction pooler de Supabase (puerto 6543)
        client = postgres(url, { prepare: false });
        db = drizzle({ client, schema });
    }
    return db;
}

export async function closeDb(): Promise<void> {
    await client?.end();
    client = null;
    db = null;
}
