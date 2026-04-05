import nodemailer, { Transporter } from "nodemailer";
import config from "../../core/config.js";

class EmailClient {
    private transporter: Transporter | null = null;

    private async getTransporter(): Promise<Transporter> {
        if (!this.transporter) {
            this.transporter = nodemailer.createTransport({
                service: "gmail",
                host: "smtp.gmail.com",
                port: 587,
                secure: false,
                auth: {
                    user: config.MAIL_USER,
                    pass: config.GOOGLE_APP_PASSWORD.replace(/\s+/g, ""),
                },
            });
        }
        return this.transporter;
    }

    async sendEmail(to: string, subject: string, text?: string, html?: string): Promise<void> {
        const transporter = await this.getTransporter();

        const mailOptions = {
            from: config.MAIL_USER,
            to,
            subject,
            text: text || "",
            html: html || "",
        };

        await transporter.sendMail(mailOptions);
    }
}

const emailClient = new EmailClient();
export default emailClient;