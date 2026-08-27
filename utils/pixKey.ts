/**
 * Chave PIX: detecção de tipo, máscara de digitação e normalização pro formato
 * que o BACEN/Efí exigem no Pix Envio.
 *
 * POR QUE ISSO EXISTE: o campo de chave PIX era texto livre. Um motorista com
 * chave de CELULAR digitava "85981201088" e era salvo assim - mas o Pix Envio
 * da Efí só aceita telefone em E.164 ("+5585981201088"). O saque falhava lá na
 * ponta, depois de já ter debitado o saldo, com uma mensagem da Efí que não
 * dizia nada pro motorista. Aqui o formato é resolvido na hora da digitação.
 *
 * Formatos aceitos pela Efí (`favorecido.chave`):
 *   CPF     11 dígitos, sem pontuação      12345678909
 *   CNPJ    14 dígitos, sem pontuação      12345678000195
 *   Celular E.164 com +55                  +5585981201088
 *   E-mail  minúsculo, até 77 caracteres   fulano@email.com
 *   EVP     UUID minúsculo com hífens      123e4567-e89b-12d3-a456-426655440000
 */

import { validateCPF } from './validateCPF';

export type PixKeyType = 'cpf' | 'cnpj' | 'phone' | 'email' | 'random';

const digits = (v: string): string => (v || '').replace(/\D/g, '');

// DDDs que existem de verdade no Brasil - evita aceitar "00" ou "10" como
// telefone e mandar pra Efí uma chave que ela vai recusar.
const VALID_DDD = new Set([
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24, 27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46, 47, 48, 49,
    51, 53, 54, 55,
    61, 62, 63, 64, 65, 66, 67, 68, 69,
    71, 73, 74, 75, 77, 79,
    81, 82, 83, 84, 85, 86, 87, 88, 89,
    91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export const PIX_KEY_TYPES: { id: PixKeyType; label: string; icon: string; placeholder: string; hint: string }[] = [
    { id: 'cpf', label: 'CPF', icon: 'badge', placeholder: '000.000.000-00', hint: 'Seu CPF, o mesmo cadastrado no banco.' },
    { id: 'phone', label: 'Celular', icon: 'smartphone', placeholder: '(00) 00000-0000', hint: 'Celular com DDD, já cadastrado como chave no seu banco.' },
    { id: 'email', label: 'E-mail', icon: 'mail', placeholder: 'voce@email.com', hint: 'E-mail cadastrado como chave no seu banco.' },
    { id: 'random', label: 'Aleatória', icon: 'key', placeholder: '00000000-0000-0000-0000-000000000000', hint: 'Copie e cole a chave aleatória do app do seu banco.' },
];

/** Um celular brasileiro válido pra PIX: DDD real + 9 + 8 dígitos. */
const isMobile = (d: string): boolean =>
    d.length === 11 && VALID_DDD.has(Number(d.slice(0, 2))) && d[2] === '9';

/**
 * Descobre o tipo da chave a partir do que o usuário digitou/colou.
 * Retorna null enquanto não dá pra decidir (campo ainda incompleto).
 *
 * O caso ambíguo é 11 dígitos, que serve tanto pra CPF quanto pra celular.
 * Desempate: o dígito verificador do CPF. Um celular passar por acaso na
 * validação de CPF é raro (~1%), e pra esse caso o usuário troca o tipo na mão.
 */
export const detectPixKeyType = (raw: string): PixKeyType | null => {
    const value = (raw || '').trim();
    if (!value) return null;

    if (value.includes('@')) return 'email';
    if (UUID_RE.test(value)) return 'random';
    // UUID sendo digitado/colado sem hífen ainda é chave aleatória
    if (/^[0-9a-f]{32}$/i.test(value)) return 'random';

    const d = digits(value);
    if (!d) return null;

    // "+55..." só pode ser telefone
    if (value.trim().startsWith('+')) return 'phone';
    if (d.length === 13 && d.startsWith('55')) return 'phone';
    if (d.length === 14) return 'cnpj';
    if (d.length === 11) return validateCPF(d) ? 'cpf' : (isMobile(d) ? 'phone' : 'cpf');
    return null;
};

/** Máscara de digitação: o que aparece no campo enquanto a pessoa escreve. */
export const formatPixKeyInput = (raw: string, type: PixKeyType): string => {
    const value = raw || '';

    if (type === 'email') return value.trim().toLowerCase();

    if (type === 'random') {
        const hex = value.toLowerCase().replace(/[^0-9a-f]/g, '').slice(0, 32);
        const parts = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)];
        return parts.filter(Boolean).join('-');
    }

    if (type === 'cpf') {
        const d = digits(value).slice(0, 11);
        if (d.length <= 3) return d;
        if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
        if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
        return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
    }

    if (type === 'cnpj') {
        const d = digits(value).slice(0, 14);
        if (d.length <= 2) return d;
        if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
        if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
        if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
        return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
    }

    // phone - descarta o +55 que a pessoa possa ter colado e mascara o resto
    let d = digits(value);
    if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};

/**
 * Converte pro formato exato que vai pro banco e pra Efí.
 * Retorna '' se a chave não estiver completa/válida - quem chama decide o que
 * fazer (nunca salvar chave meia-boca, senão o saque falha lá na frente).
 */
export const normalizePixKey = (raw: string, type: PixKeyType): string => {
    const value = (raw || '').trim();
    if (!value) return '';

    switch (type) {
        case 'email': {
            const email = value.toLowerCase();
            return EMAIL_RE.test(email) && email.length <= 77 ? email : '';
        }
        case 'random': {
            const hex = value.toLowerCase().replace(/[^0-9a-f]/g, '');
            if (hex.length !== 32) return '';
            return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
        }
        case 'cpf': {
            const d = digits(value);
            return validateCPF(d) ? d : '';
        }
        case 'cnpj': {
            const d = digits(value);
            return d.length === 14 ? d : '';
        }
        case 'phone': {
            let d = digits(value);
            if (d.length === 13 && d.startsWith('55')) d = d.slice(2);
            return isMobile(d) ? `+55${d}` : '';
        }
        default:
            return '';
    }
};

/** Mensagem de erro pra mostrar embaixo do campo (null = está tudo certo). */
export const getPixKeyError = (raw: string, type: PixKeyType): string | null => {
    const value = (raw || '').trim();
    if (!value) return 'Informe sua chave PIX.';
    if (normalizePixKey(value, type)) return null;

    switch (type) {
        case 'email': return 'E-mail inválido.';
        case 'random': return 'A chave aleatória tem 32 caracteres (formato 8-4-4-4-12). Copie do app do seu banco.';
        case 'cpf': return digits(value).length < 11 ? 'CPF incompleto.' : 'CPF inválido - confira os dígitos.';
        case 'cnpj': return 'CNPJ deve ter 14 dígitos.';
        case 'phone': {
            const d = digits(value);
            if (d.length < 11) return 'Celular incompleto - use DDD + 9 dígitos.';
            if (!VALID_DDD.has(Number(d.slice(0, 2)))) return 'DDD inválido.';
            return 'Celular inválido - o número deve começar com 9 depois do DDD.';
        }
        default: return 'Chave inválida.';
    }
};

/**
 * Deixa uma chave já salva legível na tela (admin, confirmação de saque).
 * Aceita tanto o formato normalizado quanto o legado sem formatação.
 */
export const formatPixKeyForDisplay = (stored?: string | null): string => {
    const value = (stored || '').trim();
    if (!value) return '';
    const type = detectPixKeyType(value);
    if (!type) return value;
    if (type === 'email' || type === 'random') return value;
    return formatPixKeyInput(value, type);
};

/** Rótulo curto do tipo, pra badge na UI ("Celular", "CPF"...). */
export const getPixKeyTypeLabel = (stored?: string | null): string => {
    const type = detectPixKeyType((stored || '').trim());
    if (!type) return 'Chave';
    if (type === 'cnpj') return 'CNPJ';
    return PIX_KEY_TYPES.find(t => t.id === type)?.label || 'Chave';
};

/**
 * Conserta chaves salvas antes desta validação existir. Hoje só o celular
 * precisa: era gravado como "85981201088" e a Efí exige "+5585981201088".
 * Retorna a chave normalizada, ou a original se não der pra melhorar.
 */
export const repairStoredPixKey = (stored?: string | null): string => {
    const value = (stored || '').trim();
    if (!value) return '';
    const type = detectPixKeyType(value);
    if (!type) return value;
    return normalizePixKey(value, type) || value;
};
