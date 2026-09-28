import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from 'drizzle-orm/pg-core';
import type { Params } from '../types';

export const trackedUrls = pgTable('tracked_urls', {
    id: serial('id').primaryKey(),
    url: text('url').notNull(),
    label: text('label').notNull(),
    categoryId: integer('category_id'),
    params: jsonb('params').$type<Params>().notNull().default({}),
    status: text('status', { enum: ['ok', 'needs_review'] }).notNull(),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const priceChecks = pgTable(
    'price_checks',
    {
        id: serial('id').primaryKey(),
        trackedUrlId: integer('tracked_url_id')
            .notNull()
            .references(() => trackedUrls.id, { onDelete: 'cascade' }),
        checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
        source: text('source', { enum: ['cron', 'manual'] }).notNull(),
        productId: integer('product_id').notNull(),
        productName: text('product_name').notNull(),
        productSlug: text('product_slug').notNull(),
        normalPrice: integer('normal_price').notNull(),
        offerPrice: integer('offer_price').notNull(),
        storeName: text('store_name'),
        storeUrl: text('store_url'),
    },
    (table) => [index('price_checks_tracked_url_checked_at_idx').on(table.trackedUrlId, table.checkedAt)],
);

export const urlCheckProducts = pgTable(
    'url_check_products',
    {
        id: serial('id').primaryKey(),
        priceCheckId: integer('price_check_id')
            .notNull()
            .references(() => priceChecks.id, { onDelete: 'cascade' }),
        productId: integer('product_id').notNull(),
        name: text('name').notNull(),
        slug: text('slug').notNull(),
        normalPrice: integer('normal_price').notNull(),
        offerPrice: integer('offer_price').notNull(),
        position: integer('position').notNull(),
    },
    // El índice único también sirve para buscar por price_check_id (primera columna)
    (table) => [unique('url_check_products_check_position_unique').on(table.priceCheckId, table.position)],
);
