import bcrypt from 'bcryptjs';

export class HashService {
    private readonly saltRounds: number = 10;

    async hash(password: string): Promise<string> {
        return bcrypt.hash(password, this.saltRounds);
    }

    async compare(password: string, hashedPassword: string): Promise<boolean> {
        return bcrypt.compare(password, hashedPassword);
    }
}

export const hashService = new HashService();
export default hashService;