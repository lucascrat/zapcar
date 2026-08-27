/**
 * PixKeyInput - campo de chave PIX com tipo, máscara e validação.
 *
 * Substitui o input de texto livre que existia no cadastro do motorista. O tipo
 * (CPF / Celular / E-mail / Aleatória) é detectado sozinho conforme a pessoa
 * digita, e o valor entregue ao pai (`onChange`) já vem NORMALIZADO no formato
 * que a Efí exige no Pix Envio - celular vira "+5585981201088", CPF vira só os
 * 11 dígitos, etc. Enquanto a chave está incompleta/inválida, `onChange` recebe
 * '' e `onValidChange(false)`, pra tela conseguir travar o botão de salvar.
 *
 * Ver utils/pixKey.ts pro detalhe de cada formato.
 */

import React, { useState, useEffect } from 'react';
import {
    PIX_KEY_TYPES,
    PixKeyType,
    detectPixKeyType,
    formatPixKeyInput,
    normalizePixKey,
    getPixKeyError,
} from '../utils/pixKey';

interface PixKeyInputProps {
    /** Chave já salva (formato normalizado ou legado). */
    value?: string | null;
    /** Recebe a chave normalizada, ou '' enquanto estiver inválida. */
    onChange: (normalizedKey: string) => void;
    /** Avisa se a chave atual está válida - use pra habilitar o botão de salvar. */
    onValidChange?: (isValid: boolean) => void;
    label?: string;
    /** 'driver' = telas do app (tema WhatsApp), 'admin' = painel. */
    variant?: 'driver' | 'admin';
    autoFocus?: boolean;
}

export const PixKeyInput: React.FC<PixKeyInputProps> = ({
    value,
    onChange,
    onValidChange,
    label = 'Chave PIX',
    variant = 'driver',
    autoFocus = false,
}) => {
    const initial = (value || '').trim();
    const [type, setType] = useState<PixKeyType>(() => {
        const detected = detectPixKeyType(initial);
        return detected === 'cnpj' ? 'cpf' : (detected || 'phone');
    });
    const [text, setText] = useState(() => {
        const detected = detectPixKeyType(initial);
        return initial ? formatPixKeyInput(initial, detected === 'cnpj' ? 'cpf' : (detected || 'phone')) : '';
    });
    // Só mostra erro depois que a pessoa mexeu no campo - não recebe alguém com
    // um "CPF incompleto" em vermelho antes de digitar o primeiro caractere.
    const [touched, setTouched] = useState(false);
    // A pessoa escolheu o tipo clicando? Se sim, a escolha dela ganha da
    // detecção automática no caso ambíguo (11 dígitos = CPF ou celular).
    const [typePicked, setTypePicked] = useState(false);

    const error = text.trim() ? getPixKeyError(text, type) : null;
    const normalized = normalizePixKey(text, type);
    const isValid = !!normalized;

    useEffect(() => { onValidChange?.(isValid); }, [isValid, onValidChange]);

    // Emite a chave já normalizada assim que a tela abre com uma chave salva.
    // Sem isto, quem abre a tela e clica em Salvar sem tocar no campo manteria
    // o valor legado (ex: celular sem o +55) - justamente o que quebrava o
    // Pix Envio. Só dispara no mount: depois quem manda é o onChange.
    useEffect(() => {
        if (normalized) onChange(normalized);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const emit = (nextText: string, nextType: PixKeyType) => {
        setText(nextText);
        setType(nextType);
        onChange(normalizePixKey(nextText, nextType));
    };

    const handleType = (raw: string) => {
        // O tipo se ajusta sozinho ao que a pessoa digita/cola. E-mail, chave
        // aleatória e CNPJ são inconfundíveis, então sempre trocam o tipo -
        // inclusive por cima de uma chave que já estava válida (motorista
        // trocando de chave cola por cima da antiga o tempo todo).
        //
        // O único caso ambíguo é 11 dígitos, que serve tanto pra CPF quanto pra
        // celular: aí, se a pessoa escolheu o tipo na mão, a escolha dela vale;
        // senão o desempate é pelo dígito verificador do CPF.
        const detected = detectPixKeyType(raw);
        const ambiguous = detected === 'cpf' || detected === 'phone';
        const nextType = (detected && !(ambiguous && typePicked)) ? detected : type;
        emit(formatPixKeyInput(raw, nextType), nextType);
    };

    const handlePickType = (nextType: PixKeyType) => {
        setTouched(true);
        setTypePicked(true);
        // Reaproveita o que já estava digitado, remascarado pro novo tipo.
        emit(formatPixKeyInput(text, nextType), nextType);
    };

    // O botão "CPF" cobre CPF e CNPJ (detectado pelo tamanho) - quando vira
    // CNPJ, a dica e o placeholder acompanham em vez de continuar falando CPF.
    const meta = type === 'cnpj'
        ? { ...PIX_KEY_TYPES[0], placeholder: '00.000.000/0000-00', hint: 'CNPJ da empresa, cadastrado como chave no banco.' }
        : (PIX_KEY_TYPES.find(t => t.id === type) || PIX_KEY_TYPES[0]);
    const isAdmin = variant === 'admin';

    const inputClass = isAdmin
        ? 'admin-form-input'
        : 'w-full bg-black/30 text-white px-4 py-3 rounded-xl border outline-none transition';

    const inputBorder = isAdmin
        ? undefined
        : (touched && error
            ? 'rgba(248,113,113,0.6)'
            : isValid
                ? 'rgba(37,211,102,0.6)'
                : 'rgba(255,255,255,0.1)');

    return (
        <div className="space-y-2">
            <label className={isAdmin
                ? 'admin-form-label'
                : 'text-[10px] text-gray-500 uppercase font-bold block'}>
                {label}
            </label>

            {/* Seletor de tipo */}
            <div className="grid grid-cols-4 gap-2">
                {PIX_KEY_TYPES.map(t => {
                    const active = type === t.id || (type === 'cnpj' && t.id === 'cpf');
                    return (
                        <button
                            key={t.id}
                            type="button"
                            onClick={() => handlePickType(t.id)}
                            className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border transition-all ${active
                                ? 'bg-green-500/15 border-green-500 text-green-400'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'}`}
                        >
                            <span className="material-icons" style={{ fontSize: '16px' }}>{t.icon}</span>
                            <span className="text-[9px] font-bold uppercase leading-none">{t.label}</span>
                        </button>
                    );
                })}
            </div>

            <div className="relative">
                <input
                    type={type === 'email' ? 'email' : type === 'random' ? 'text' : 'tel'}
                    inputMode={type === 'email' || type === 'random' ? 'text' : 'numeric'}
                    autoFocus={autoFocus}
                    value={text}
                    onChange={(e) => handleType(e.target.value)}
                    onBlur={() => setTouched(true)}
                    placeholder={meta.placeholder}
                    maxLength={type === 'email' ? 77 : type === 'random' ? 36 : 18}
                    className={inputClass}
                    style={inputBorder ? { borderColor: inputBorder } : undefined}
                />
                {isValid && (
                    <span
                        className="material-icons absolute right-3 top-1/2 -translate-y-1/2 text-green-500 pointer-events-none"
                        style={{ fontSize: '20px' }}
                    >
                        check_circle
                    </span>
                )}
            </div>

            {touched && error ? (
                <p className="text-[11px] text-red-400 font-medium flex items-center gap-1">
                    <span className="material-icons" style={{ fontSize: '13px' }}>error_outline</span>
                    {error}
                </p>
            ) : (
                <p className="text-[10px] text-gray-500">{meta.hint}</p>
            )}
        </div>
    );
};

export default PixKeyInput;
