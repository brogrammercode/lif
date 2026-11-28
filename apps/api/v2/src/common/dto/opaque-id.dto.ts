import { z } from 'zod';

export const opaqueIdSchema = z.string().min(1).max(100);
