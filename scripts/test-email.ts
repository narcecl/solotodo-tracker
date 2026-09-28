import { Resend } from 'resend';
import { createAlertSender, DEFAULT_ALERT_FROM } from '../src/lib/email';
import type { PriceChangeAlert } from '../src/lib/types';

process.loadEnvFile('.env.local');

const apiKey = process.env.RESEND_API_KEY;
const to = process.env.ALERT_EMAIL;
const from = process.env.ALERT_FROM || DEFAULT_ALERT_FROM;

if (!apiKey || !to) {
    console.error('Faltan RESEND_API_KEY o ALERT_EMAIL en .env.local');
    process.exit(1);
}

const alert: PriceChangeAlert = {
    label: 'SSD 2TB (prueba)',
    listingUrl: 'https://www.solotodo.cl/ssd-m2-pcie-nvme',
    products: [
        {
            productId: 127681,
            name: 'A-DATA XPG',
            slug: 'a-data-xpg',
            normalPrice: 400889,
            offerPrice: 379990,
            position: 0,
            previousNormalPrice: 420000,
            kind: 'down',
        },
        {
            productId: 3,
            name: 'WD Black',
            slug: 'wd-black',
            normalPrice: 450000,
            offerPrice: 440000,
            position: 1,
            previousNormalPrice: 430000,
            kind: 'up',
        },
    ],
};

const sendAlert = createAlertSender(new Resend(apiKey), { to, from });

sendAlert(alert)
    .then(() => console.log('Email enviado correctamente a', to))
    .catch((err) => {
        console.error('Error al enviar email:', err);
        process.exit(1);
    });
