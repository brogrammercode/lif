import admin from 'firebase-admin';
import config from '../../core/config.js';

let app: admin.app.App;

if (!admin.apps.length) {
    app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId: config.FIREBASE_PROJECT_ID,
            clientEmail: config.FIREBASE_CLIENT_EMAIL,
            privateKey: config.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
} else {
    app = admin.app();
}

export const firebaseAdmin = app;
export const messaging = app.messaging();