import React, { useState, useRef } from 'react';
import { UserProfile, UserRole, DriverStatus } from '../types';
import { InstallPrompt } from './InstallPrompt';
import {
    checkUserExists,
    registerClientWithPhoto,
    registerDriver,
    loginDriver,
    loginAdmin,
    supabase
} from '../services/supabaseClient';
import { APP_NAME } from '../constants';

const APP_VERSION = "6.2 (Stable)";

interface LoginFlowProps {
    onLoginSuccess: (user: UserProfile) => void;
}

export const LoginFlow: React.FC<LoginFlowProps> = ({ onLoginSuccess }) => {
    const [loginMode, setLoginMode] = useState<'client' | 'driver' | 'admin'>('client');
    const [isRegisteringDriver, setIsRegisteringDriver] = useState(false);
    const [entryName, setEntryName] = useState('');
    const [entryPhone, setEntryPhone] = useState('');
    const [entryAvatarFile, setEntryAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

    const [entryVehicleType, setEntryVehicleType] = useState<'car' | 'motorcycle'>('car');
    const [entryVehicleModel, setEntryVehicleModel] = useState('');
    const [entryVehiclePlate, setEntryVehiclePlate] = useState('');
    const [entryVehicleColor, setEntryVehicleColor] = useState('');

    const [entryPassword, setEntryPassword] = useState('');
    const [showEntryPassword, setShowEntryPassword] = useState(false);
    const [authPassword, setAuthPassword] = useState('');
    const [showAuthPassword, setShowAuthPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const avatarInputRef = useRef<HTMLInputElement>(null);

    const resetForm = () => {
        setEntryName('');
        setEntryPhone('');
        setAvatarPreview(null);
        setEntryAvatarFile(null);
        setAuthPassword('');
        setEntryPassword('');
        setEntryVehicleModel('');
        setEntryVehiclePlate('');
        setEntryVehicleColor('');
    };

    const formatPhoneNumber = (value: string) => {
        const numbers = value.replace(/\D/g, '');
        let formatted = numbers;
        if (numbers.length > 0) {
            formatted = `(${numbers.slice(0, 2)}`;
            if (numbers.length > 2) {
                formatted += `) ${numbers.slice(2, 7)}`;
            }
            if (numbers.length > 7) {
                formatted += `-${numbers.slice(7, 11)}`;
            }
        }
        return formatted;
    };

    const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEntryPhone(formatPhoneNumber(e.target.value));
    };

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Revogar URL anterior para evitar memory leak
            if (avatarPreview) {
                URL.revokeObjectURL(avatarPreview);
            }
            setEntryAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleCheckUser = async (field: 'username' | 'phone', value: string) => {
        if (!value) return;
        if (loginMode === 'client' || (loginMode === 'driver' && isRegisteringDriver)) {
            const exists = await checkUserExists(field, value);
            if (exists) {
                if (loginMode === 'client' && field === 'phone') {
                    alert("Este telefone já possui cadastro. Se for você, o login será feito automaticamente.");
                } else {
                    alert(`Este ${field === 'username' ? 'nome de usuário' : 'telefone'} já está em uso. Por favor, tente outro.`);
                }
            }
        }
    };

    const [isSendingReset, setIsSendingReset] = useState(false);

    const handleForgotPassword = async () => {
        if (!entryName.trim() || !entryName.includes('@')) {
            alert('Digite o e-mail do administrador no campo acima antes de pedir a redefinição.');
            return;
        }
        setIsSendingReset(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(entryName.trim(), {
                redirectTo: window.location.origin
            });
            if (error) {
                alert('Erro ao enviar e-mail de redefinição: ' + error.message);
            } else {
                alert('Se esse e-mail tiver uma conta de administrador, enviamos um link de redefinição de senha. Confira sua caixa de entrada (e o spam).');
            }
        } catch (e: any) {
            alert('Erro ao enviar e-mail de redefinição: ' + (e?.message || 'tente novamente.'));
        } finally {
            setIsSendingReset(false);
        }
    };

    const handleLogin = async () => {
        if (!entryName.trim()) return;
        setIsLoading(true);

        try {
            let user: UserProfile | null = null;

            if (loginMode === 'client') {
                if (!entryPhone.trim()) {
                    alert("Por favor, insira seu telefone.");
                    setIsLoading(false);
                    return;
                }
                try {
                    user = await registerClientWithPhoto(entryName, entryPhone, entryAvatarFile || undefined);
                } catch (err: any) {
                    alert("Erro ao entrar: " + (err.message || "Verifique sua conexão."));
                    setIsLoading(false);
                    return;
                }
            } else if (loginMode === 'driver') {
                if (isRegisteringDriver) {
                    if (!entryVehicleModel || !entryVehiclePlate || !entryPassword) {
                        alert("Por favor, preencha todos os campos obrigatórios, incluindo a senha.");
                        setIsLoading(false);
                        return;
                    }
                    const registerTask = registerDriver(
                        entryName,
                        entryPassword,
                        entryVehicleType,
                        entryVehicleModel,
                        entryVehiclePlate,
                        entryVehicleColor,
                        entryAvatarFile || undefined,
                        entryPhone
                    );
                    const newUser = await Promise.race([
                        registerTask,
                        new Promise<null>((resolve) => setTimeout(() => resolve(null), 15000))
                    ]);
                    if (newUser) {
                        user = newUser;
                        if ((window as any).Android?.requestPermissions) {
                            (window as any).Android.requestPermissions();
                        }
                    } else {
                        alert("O servidor não respondeu ao cadastro. Tente novamente em instantes.");
                    }
                } else {
                    if (!authPassword) {
                        alert("Por favor, digite sua senha.");
                        setIsLoading(false);
                        return;
                    }
                    const loggedInUser = await loginDriver(entryName, authPassword);
                    if (!loggedInUser) {
                        alert(`Usuário ou senha incorretos. Verifique suas credenciais.`);
                        setIsLoading(false);
                        return;
                    }
                    user = loggedInUser;
                    if ((window as any).Android?.requestPermissions) {
                        (window as any).Android.requestPermissions();
                    }
                }
            } else if (loginMode === 'admin') {
                if (!entryName.trim() || !authPassword) {
                    alert("Informe o e-mail e a senha do administrador.");
                    setIsLoading(false);
                    return;
                }

                const result = await loginAdmin(entryName, authPassword);

                if (!result.ok || !result.profile) {
                    if (result.reason === 'not_admin') {
                        alert("Esta conta não tem permissão de administrador.");
                    } else if (result.reason === 'error') {
                        alert("Erro ao entrar: " + (result.message || 'tente novamente.'));
                    } else {
                        alert("Credenciais de administrador incorretas.");
                    }
                    setIsLoading(false);
                    return;
                }

                user = result.profile;
            }

            if (user) {
                onLoginSuccess(user);
            }
        } catch (e) {
            console.error("Login Error", e);
            alert("Ocorreu um erro inesperado. Tente novamente.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="bg-white fixed inset-0 w-full h-full flex flex-col items-center justify-between overflow-y-auto px-4 py-6 z-50 overscroll-none">
            <InstallPrompt />

            <div className="w-full flex justify-end gap-3 px-2 pt-2 z-20 absolute top-4 right-4">
                <button
                    onClick={() => { setLoginMode('driver'); setIsRegisteringDriver(false); resetForm(); }}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all active:scale-95 ${loginMode === 'driver' ? 'bg-whatsapp-green text-white ring-2 ring-whatsapp-green ring-offset-2' : 'bg-white border border-gray-200 text-gray-400'}`}
                >
                    <span className="material-icons text-xl">directions_car</span>
                </button>

                <button
                    onClick={() => { setLoginMode('admin'); setEntryName(''); setAuthPassword(''); }}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm transition-all active:scale-95 ${loginMode === 'admin' ? 'bg-accent-600 text-white ring-2 ring-accent-600 ring-offset-2' : 'bg-white border border-gray-200 text-gray-400'}`}
                >
                    <span className="material-icons text-xl">admin_panel_settings</span>
                </button>

                {loginMode !== 'client' && (
                    <button
                        onClick={() => { setLoginMode('client'); resetForm(); }}
                        className="w-12 h-12 rounded-xl flex items-center justify-center bg-white border border-gray-200 text-gray-400 shadow-sm transition-all active:scale-95"
                    >
                        <span className="material-icons text-xl">person</span>
                    </button>
                )}
            </div>

            <div className="chegoja-login-content flex-1 w-full max-w-sm flex flex-col items-center justify-center mt-12 mb-8">
                <div className="relative mb-6 group cursor-pointer" onClick={() => avatarInputRef.current?.click()}>
                    <div className="chegoja-login-avatar w-32 h-32 rounded-full overflow-hidden border-4 border-gray-50 shadow-lg bg-gray-100 flex items-center justify-center">
                        {avatarPreview ? (
                            <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
                        )}
                    </div>
                    {(loginMode === 'client' || (loginMode === 'driver' && isRegisteringDriver)) && (
                        <div className="absolute bottom-1 right-1 bg-whatsapp-green text-white p-2 rounded-full border-2 border-white shadow-md flex items-center justify-center">
                            <span className="material-icons text-sm">edit</span>
                        </div>
                    )}
                    <input type="file" ref={avatarInputRef} title="Foto de Perfil" className="hidden" accept="image/*" onChange={handleAvatarChange} />
                </div>

                <h2 className="text-2xl font-bold text-gray-900 mb-1 text-center w-full">
                    {loginMode === 'client' ? 'Bem-vindo(a)' : loginMode === 'driver' ? (isRegisteringDriver ? 'Novo Motorista' : 'Motorista') : 'Administrativo'}
                </h2>
                <p className="text-sm text-gray-500 mb-8 text-center max-w-[260px]">
                    {loginMode === 'client'
                        ? 'Conecte-se para solicitar corridas.'
                        : loginMode === 'driver'
                            ? (isRegisteringDriver ? 'Preencha seus dados para começar.' : 'Faça login para trabalhar.')
                            : 'Acesso restrito para gestão.'}
                </p>

                <div className="w-full max-w-sm flex flex-col gap-4">
                    <div className="relative w-full">
                        <input
                            type={loginMode === 'admin' ? 'email' : 'text'}
                            autoComplete={loginMode === 'admin' ? 'username' : 'off'}
                            placeholder={loginMode === 'client' ? "Seu Nome Completo" : loginMode === 'admin' ? "E-mail do administrador" : "Nome de Usuário"}
                            value={entryName}
                            onChange={e => setEntryName(e.target.value)}
                            onBlur={() => { if (loginMode !== 'admin') handleCheckUser('username', entryName); }}
                            maxLength={loginMode === 'admin' ? 120 : 20}
                            disabled={isLoading}
                            className="w-full h-14 pl-4 pr-16 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                        />
                        <div className="absolute right-4 top-0 h-full flex items-center justify-center pointer-events-none text-gray-400">
                            <span className="material-icons">{loginMode === 'admin' ? 'mail' : 'person'}</span>
                        </div>
                    </div>

                    {loginMode === 'client' && (
                        <div className="relative w-full">
                            <input
                                type="tel"
                                placeholder="Seu Telefone (Whatsapp)"
                                value={entryPhone}
                                onChange={handlePhoneChange}
                                onBlur={() => handleCheckUser('phone', entryPhone)}
                                maxLength={15}
                                disabled={isLoading}
                                className="w-full h-14 pl-4 pr-16 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                            />
                            <div className="absolute right-4 top-0 h-full flex items-center justify-center pointer-events-none text-gray-400">
                                <span className="material-icons">phone</span>
                            </div>
                        </div>
                    )}

                    {loginMode === 'driver' && isRegisteringDriver && (
                        <>
                            <div className="relative w-full">
                                <input
                                    type={showEntryPassword ? 'text' : 'password'}
                                    placeholder="Sua Senha"
                                    value={entryPassword}
                                    onChange={e => setEntryPassword(e.target.value)}
                                    className="w-full h-14 pl-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowEntryPassword(!showEntryPassword)}
                                    className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-gray-400 hover:text-whatsapp-green active:text-whatsapp-dark"
                                >
                                    <span className="material-icons">{showEntryPassword ? 'visibility_off' : 'visibility'}</span>
                                </button>
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={() => setEntryVehicleType('car')}
                                    className={`flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 ${entryVehicleType === 'car' ? 'bg-whatsapp-green text-white border-whatsapp-green shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <span className="material-icons text-lg">directions_car</span> Carro
                                </button>
                                <button
                                    onClick={() => setEntryVehicleType('motorcycle')}
                                    className={`flex-1 h-12 rounded-xl border flex items-center justify-center gap-2 font-bold text-sm transition-all active:scale-95 ${entryVehicleType === 'motorcycle' ? 'bg-whatsapp-green text-white border-whatsapp-green shadow-sm' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <span className="material-icons text-lg">two_wheeler</span> Moto
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 w-full">
                                <input
                                    type="text"
                                    placeholder="Modelo"
                                    value={entryVehicleModel}
                                    onChange={e => setEntryVehicleModel(e.target.value)}
                                    className="col-span-2 h-14 pl-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base font-medium"
                                />
                                <input
                                    type="text"
                                    placeholder="Placa"
                                    value={entryVehiclePlate}
                                    onChange={e => setEntryVehiclePlate(e.target.value)}
                                    className="h-14 pl-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base font-medium uppercase"
                                />
                                <input
                                    type="text"
                                    placeholder="Cor"
                                    value={entryVehicleColor}
                                    onChange={e => setEntryVehicleColor(e.target.value)}
                                    className="h-14 pl-4 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base font-medium"
                                />
                            </div>
                        </>
                    )}

                    {((loginMode === 'driver' && !isRegisteringDriver) || loginMode === 'admin') && (
                        <div className="relative w-full">
                            <input
                                type={showAuthPassword ? 'text' : 'password'}
                                placeholder="Senha de Acesso"
                                value={authPassword}
                                onChange={e => setAuthPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                                disabled={isLoading}
                                className="w-full h-14 pl-4 pr-12 rounded-xl border border-gray-200 bg-gray-50 focus:bg-white focus:border-whatsapp-green focus:ring-2 focus:ring-whatsapp-green/20 transition-all outline-none text-base text-gray-900 placeholder-gray-400 font-medium"
                            />
                            <button
                                type="button"
                                onClick={() => setShowAuthPassword(!showAuthPassword)}
                                className="absolute right-0 top-0 h-full w-12 flex items-center justify-center text-gray-400 hover:text-whatsapp-green active:text-whatsapp-dark"
                            >
                                <span className="material-icons">{showAuthPassword ? 'visibility_off' : 'visibility'}</span>
                            </button>
                        </div>
                    )}

                    <button
                        onClick={handleLogin}
                        disabled={isLoading}
                        className={`w-full mt-2 h-14 text-white text-base font-bold uppercase tracking-wide rounded-xl shadow-lg flex justify-center items-center transition-all transform active:scale-95 hover:shadow-xl ${loginMode === 'admin' ? 'bg-accent-600 active:bg-accent-700' : 'bg-whatsapp-green active:bg-whatsapp-dark'} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <span className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                        ) : (
                            loginMode === 'client' ? 'Entrar Agora' : (isRegisteringDriver ? 'Concluir' : 'Autenticar')
                        )}
                    </button>

                    {loginMode === 'admin' && (
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            disabled={isSendingReset}
                            className="mt-1 text-accent-600 font-semibold text-sm hover:underline py-2 px-4 rounded-lg hover:bg-accent-50 active:bg-accent-100 transition-colors self-center disabled:opacity-60"
                        >
                            {isSendingReset ? 'Enviando...' : 'Esqueci minha senha'}
                        </button>
                    )}
                </div>

                {loginMode === 'driver' && (
                    <button
                        onClick={() => { setIsRegisteringDriver(!isRegisteringDriver); resetForm(); }}
                        className="mt-6 text-whatsapp-green font-semibold text-sm hover:underline py-2 px-4 rounded-lg hover:bg-green-50 active:bg-green-100 transition-colors"
                        disabled={isLoading}
                    >
                        {isRegisteringDriver ? 'Já tenho conta? Fazer Login' : 'Criar conta de Motorista'}
                    </button>
                )}
            </div>

            <div className="w-full py-4 text-center">
                <p className="text-[10px] text-gray-300 font-mono tracking-widest uppercase selection:bg-none pointer-events-none">
                    {APP_NAME} v{APP_VERSION}
                </p>
            </div>
        </div>
    );
};
