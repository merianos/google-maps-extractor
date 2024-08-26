import crypto from 'crypto';

export const hashSHA256 = string => crypto.createHash('sha256').update(string).digest('hex');
