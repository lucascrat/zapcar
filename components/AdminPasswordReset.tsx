import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

interface AdminPasswordResetProps {
    onDone: () => void;
}

// Tela mostrada quando o usuário chega pelo link de redefinição de senha
// enviado por e-mail (supabase.auth.resetPasswordForEmail). O Supabase já
// autentica uma sessão temporária de recuperação nesse momento - aqui só
// coletamos a senha nova e chamamos updateUser.
export const AdminPasswordReset: React.FC<AdminPasswordResetProps> = ({ onDone }) => {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const handleSubmit = async () => {
        setError(null);

        if (password.length < 6) {
            setError('A senha precisa ter pelo menos 6 caracteres.');
            return;
        }
        if (password !== confirmPassword) {
            setError('As senhas não coincidem.');
            return;
        }

        setIsLoading(true);
        try {
            const { error: updateError } = await supabase.auth.updateUser({ password });
            if (updateError) {
                setError(updateError.message || 'Erro ao definir a nova senha.');
                setIsLoading(false);
                return;
            }
            setSuccess(true);
            // Encerra a sessão de recuperação - o admin faz login normal com a senha nova
            await supabase.auth.signOut();
        } catch (e: any) {
            setError(e?.message || 'Erro inesperado ao definir a nova senha.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white fixed inset-0 w-full h-full flex flex-col items-center justify-center px-4 z-50">
            <div className="w-full max-w-sm flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-accent-50 flex items-center justify-center mb-4">
                    <span className="material-icons text-accent-600 text-3xl">
                        {success ? 'check_circle' : 'lock_reset'}
                    </span>
                </div>

                {success ? (
                    <>
                        <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">Senha redefinida!</h2>
                        <p className="text-sm text-gray-500 mb-8 text-center">
                            Sua senha de administrador foi alterada. Faça login novamente com a senha nova.
                        </p>
                        <button
                            onClick={onDone}
                            className="w-full h-14 bg-accent-600 active:bg-accent-700 text-white text-base font-bold uppercase tracking-wide rounded-xl shadow-lg transition-all active:scale-95"
                        >
                            Ir para o Login
                        </button>
                    </>
                ) : (
                    <>
                        <h2 className="text-xl font-bold text-gray-900 mb-1 text-center">Nova senha de administrador</h2>
                        <p className="text-sm text-gray-500 mb-6 text-center">
                            Defina sua nova senha de acesso ao painel.
                        </p>

                        <div className="w-full flex flex-col gap-4">
                            <div className="relative w-full">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="Nova senha"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    disabled={isLoading}
                                    className="w-full h-14 pl-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-gray-400 hover:text-accent-600"
                                >
                                    <span className="material-icons">{showPassword ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>

                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Confirme a nova senha"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                disabled={isLoading}
                                className="w-full h-14 pl-4 pr-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-accent-600 focus:ring-2 focus:ring-accent-600/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                            />

                            {error && (
                                <p className="text-sm text-red-600 font-medium text-center">{error}</p>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={isLoading}
                                className={`w-full mt-2 h-14 bg-accent-600 active:bg-accent-700 text-white text-base font-bold uppercase tracking-wide rounded-xl shadow-lg flex justify-center items-center transition-all active:scale-95 ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {isLoading ? (
                                    <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                ) : 'Salvar Nova Senha'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
