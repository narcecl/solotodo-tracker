import { describe, expect, it, vi } from 'vitest';
import { buildAlertEmail, createAlertSender, type ResendLike } from '@/lib/email';
import type { PriceChangeAlert } from '@/lib/types';

const ALERT: PriceChangeAlert = {
    label: 'SSD 2TB',
    listingUrl: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    products: [
        {
            productId: 1,
            name: 'Kingston NV3 2 TB',
            slug: 'kingston-nv3',
            normalPrice: 300000,
            offerPrice: 290000,
            position: 0,
            previousNormalPrice: null,
            kind: 'new',
        },
        {
            productId: 127681,
            name: 'A-DATA XPG',
            slug: 'a-data-xpg',
            normalPrice: 400889,
            offerPrice: 379990,
            position: 1,
            previousNormalPrice: 420000,
            kind: 'down',
        },
        {
            productId: 3,
            name: 'WD Black',
            slug: 'wd-black',
            normalPrice: 450000,
            offerPrice: 440000,
            position: 2,
            previousNormalPrice: 430000,
            kind: 'up',
        },
        {
            productId: 4,
            name: 'Samsung 990',
            slug: 'samsung-990',
            normalPrice: 500000,
            offerPrice: 480000,
            position: 3,
            previousNormalPrice: 500000,
            kind: 'same',
        },
    ],
};

describe('buildAlertEmail', () => {
    it('usa el asunto con el label', () => {
        expect(buildAlertEmail(ALERT).subject).toBe('Hubo cambios de precio en SSD 2TB');
    });

    it('lista todos los productos en orden de position, con link a su ficha y al listado', () => {
        const email = buildAlertEmail(ALERT);
        for (const part of [email.html, email.text]) {
            expect(part).toContain('SSD 2TB');
            expect(part).toContain('https://www.solotodo.cl/ssd-m2-pcie-nvme');
            expect(part).toContain('https://www.solotodo.cl/products/127681-a-data-xpg');
            expect(part).toContain('$379.990');
            const order = ['Kingston NV3 2 TB', 'A-DATA XPG', 'WD Black', 'Samsung 990'].map((name) => part.indexOf(name));
            expect(order.every((index) => index >= 0)).toBe(true);
            expect(order).toEqual(order.toSorted((a, b) => a - b));
        }
    });

    it('ordena por position aunque los productos lleguen desordenados', () => {
        const email = buildAlertEmail({ ...ALERT, products: ALERT.products.toReversed() });
        expect(email.text.indexOf('Kingston NV3 2 TB')).toBeLessThan(email.text.indexOf('Samsung 990'));
    });

    it("marca bajadas y subidas con precio anterior y nuevo, y los nuevos con 'Nuevo'", () => {
        const { html, text } = buildAlertEmail(ALERT);
        expect(html).toContain('<s>$420.000</s>');
        expect(html).toContain('↓ $400.889');
        expect(html).toContain('<s>$430.000</s>');
        expect(html).toContain('↑ $450.000');
        expect(html).toContain('Nuevo');

        const line = (name: string) => text.split('\n').find((l) => l.includes(name))!;
        expect(line('A-DATA XPG')).toContain('$420.000 → $400.889 ↓');
        expect(line('WD Black')).toContain('$430.000 → $450.000 ↑');
        expect(line('Kingston NV3 2 TB')).toContain('(Nuevo)');
        expect(line('Samsung 990')).not.toMatch(/[↓↑]/);
    });

    it('escapa HTML en textos del usuario y de SoloTodo', () => {
        const [first, ...rest] = ALERT.products;
        const email = buildAlertEmail({
            ...ALERT,
            label: 'SSD <b>&</b>',
            products: [{ ...first, name: 'Disco "X" <script>' }, ...rest],
        });
        expect(email.html).not.toContain('<script>');
        expect(email.html).toContain('SSD &lt;b&gt;&amp;&lt;/b&gt;');
        expect(email.html).toContain('Disco &quot;X&quot; &lt;script&gt;');
    });
});

describe('createAlertSender', () => {
    function fakeResend(result: { error: { message: string } | null }) {
        const send = vi.fn<ResendLike['emails']['send']>(async () => result);
        return { resend: { emails: { send } } satisfies ResendLike, send };
    }

    it('envía con from/to configurados', async () => {
        const { resend, send } = fakeResend({ error: null });
        await createAlertSender(resend, { to: 'hola@narce.cl', from: 'Tracker <a@b.cl>' })(ALERT);
        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                from: 'Tracker <a@b.cl>',
                to: 'hola@narce.cl',
                subject: 'Hubo cambios de precio en SSD 2TB',
            }),
        );
    });

    it('lanza si Resend devuelve error sin lanzar', async () => {
        const { resend } = fakeResend({ error: { message: 'domain not verified' } });
        await expect(createAlertSender(resend, { to: 'hola@narce.cl', from: 'x@y.cl' })(ALERT)).rejects.toThrow('domain not verified');
    });
});
