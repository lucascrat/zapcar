/**
 * Hashing de senhas com Web Crypto (SHA-256 + salt por usuário).
 * Formato armazenado: "sha256$<salt-hex>$<hash-hex>"
 *
 * Mantém compatibilidade com contas antigas que ainda têm a senha em
 * texto puro na coluna `password`: verifyPassword() reconhece o formato
 * legado e o login (ver services/supabaseClient.ts) faz o upgrade
 * automático para o novo formato assim que a senha é validada.
 */

const HASH_PREFIX = 'sha256';

async function sha256Hex(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function randomSaltHex(byteLength = 16): string {
    const bytes = new Uint8Array(byteLength);
    crypto.getRandomValues(bytes);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export function isHashedPassword(stored: string | null | undefined): boolean {
    if (!stored) return false;
    const parts = stored.split('$');
    return parts.length === 3 && parts[0] === HASH_PREFIX;
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomSaltHex();
    const hash = await sha256Hex(salt + password);
    return `${HASH_PREFIX}$${salt}$${hash}`;
}

/**
 * Compara a senha informada com o valor armazenado.
 * Aceita tanto o novo formato (hash+salt) quanto o formato legado
 * (texto puro), para não quebrar o login de contas já cadastradas.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
    if (!stored) return false;

    if (isHashedPassword(stored)) {
        const [, salt, hash] = stored.split('$');
        const candidate = await sha256Hex(salt + password);
        return candidate === hash;
    }

    // Conta legada: senha ainda em texto puro.
    return stored === password;
}
