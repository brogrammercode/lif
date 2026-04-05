import { messaging } from "./connection.js";

class PushService {
    async send(token: string, title: string, body: string, data?: any) {
        try {
            const stringifiedData: Record<string, string> = {};
            if (data) {
                Object.keys(data).forEach(key => {
                    stringifiedData[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
                });
            }

            await messaging.send({
                token,
                notification: {
                    title,
                    body,
                },
                data: stringifiedData,
            });
            return true;
        } catch (error) {
            console.error("Error sending push notification:", error);
            return false;
        }
    }

    async sendMulticast(tokens: string[], title: string, body: string, data?: any) {
        try {
            if (!tokens.length) return { successCount: 0, failureCount: 0 };

            const stringifiedData: Record<string, string> = {};
            if (data) {
                Object.keys(data).forEach(key => {
                    stringifiedData[key] = typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]);
                });
            }

            const response = await messaging.sendEachForMulticast({
                tokens,
                notification: {
                    title,
                    body,
                },
                data: stringifiedData,
            });
            return response;
        } catch (error) {
            console.error("Error sending multicast push notification:", error);
            return { successCount: 0, failureCount: tokens.length };
        }
    }
}

const pushService = new PushService();
export default pushService;