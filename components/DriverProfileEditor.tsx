
import React, { useState, useEffect } from 'react';
import { UserProfile, AppPaymentRequest } from '../types';
import { updateUserProfile, fetchUserProfile, createPaymentRequest, fetchMyPaymentRequests, uploadFile } from '../services/supabaseClient';
import { useVehicleCategories } from '../src/contexts/VehicleCategoriesContext';
import { PixKeyInput } from './PixKeyInput';
import { formatPixKeyForDisplay, getPixKeyTypeLabel, repairStoredPixKey } from '../utils/pixKey';
import { validateCPF } from '../utils/validateCPF';

interface DriverProfileEditorProps {
    currentUser: UserProfile;
    onClose: () => void;
    onUpdate: (updated: UserProfile) => void;
    initialTab?: 'profile' | 'pix' | 'withdraw';
}

export const DriverProfileEditor: React.FC<DriverProfileEditorProps> = ({ currentUser, onClose, onUpdate, initialTab }) => {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [activeTab, setActiveTab] = useState<'profile' | 'pix' | 'withdraw'>(initialTab || 'profile');
    const { activeCategories } = useVehicleCategories();

    // Profile Fields
    const [phone, setPhone] = useState(currentUser.phone || '');
    const [whatsapp, setWhatsapp] = useState(currentUser.whatsapp || '');
    const [vehicleModel, setVehicleModel] = useState(currentUser.vehicle_model || '');
    const [vehiclePlate, setVehiclePlate] = useState(currentUser.vehicle_plate || '');
    const [vehicleColor, setVehicleColor] = useState(currentUser.vehicle_color || '');
    const [vehicleType, setVehicleType] = useState<string>(currentUser.vehicle_type || 'car');

    // PIX Fields - pixKey guarda a chave já NORMALIZADA pela PixKeyInput
    // (celular em +55..., CPF só dígitos), que é o formato que a Efí exige.
    const [pixKey, setPixKey] = useState(currentUser.pix_key || '');
    const [pixKeyValid, setPixKeyValid] = useState(false);
    const [cpf, setCpf] = useState(currentUser.cpf || '');
    const [fullName, setFullName] = useState(currentUser.full_name || '');
    const [email, setEmail] = useState(currentUser.email || '');

    // Address (optional for PIX)
    const [addressStreet, setAddressStreet] = useState(currentUser.address_street || '');
    const [addressNumber, setAddressNumber] = useState(currentUser.address_number || '');
    const [addressNeighborhood, setAddressNeighborhood] = useState(currentUser.address_neighborhood || '');
    const [addressCity, setAddressCity] = useState(currentUser.address_city || '');
    const [addressZip, setAddressZip] = useState(currentUser.address_zip || '');

    // Withdrawal Fields
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [processingWithdraw, setProcessingWithdraw] = useState(false);
    const [pendingRequests, setPendingRequests] = useState<AppPaymentRequest[]>([]);
    const [rejectedRequests, setRejectedRequests] = useState<AppPaymentRequest[]>([]);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            const fresh = await fetchUserProfile(currentUser.id);
            if (fresh) {
                setPhone(fresh.phone || '');
                setWhatsapp(fresh.whatsapp || '');
                setVehicleModel(fresh.vehicle_model || '');
                setVehiclePlate(fresh.vehicle_plate || '');
                setVehicleColor(fresh.vehicle_color || '');
                setVehicleType(fresh.vehicle_type || 'car');
                setPixKey(fresh.pix_key || '');
                setCpf(fresh.cpf || '');
                setFullName(fresh.full_name || '');
                setEmail(fresh.email || '');
                setAddressStreet(fresh.address_street || '');
                setAddressNumber(fresh.address_number || '');
                setAddressNeighborhood(fresh.address_neighborhood || '');
                setAddressCity(fresh.address_city || '');
                setAddressZip(fresh.address_zip || '');
                onUpdate(fresh);
            }
            await loadPendingRequests();
            setLoading(false);
        };
        init();
    }, []);

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];

        try {
            setUploadingImage(true);
            const publicUrl = await uploadFile(file, 'images');
            if (publicUrl) {
                const success = await updateUserProfile(currentUser.id, { avatar_url: publicUrl });
                if (success) {
                    const updated = await fetchUserProfile(currentUser.id);
                    if (updated) onUpdate(updated);
                    // alert("Foto atualizada!"); // Feedback visual já é suficiente com a troca da imagem
                } else {
                    alert("Erro ao atualizar perfil.");
                }
            } else {
                alert("Erro ao enviar imagem. Tente novamente.");
            }
        } catch (err) {
            console.error(err);
            alert("Erro ao processar imagem.");
        } finally {
            setUploadingImage(false);
        }
    };

    // O banco só libera a transferência se a chave PIX pertencer ao CPF
    // informado, então os três dados precisam estar completos antes do saque -
    // sem isso o valor sai do saldo e volta minutos depois, sem o motorista
    // entender o motivo.
    const isCpfValid = validateCPF(cpf);
    const isFullNameValid = fullName.trim().split(/\s+/).filter(p => p.length >= 2).length >= 2;
    const podeSacar = isCpfValid && isFullNameValid && !!currentUser.pix_key;

    const loadPendingRequests = async () => {
        const requests = await fetchMyPaymentRequests(currentUser.id);
        // Filter pending requests - using any to avoid PaymentRequest type conflict with DOM PaymentRequest
        setPendingRequests(requests.filter((r: any) => r.status === 'pending'));
        // Saque recusado pelo banco (chave inexistente, conta bloqueada...) some
        // da lista de pendentes e o saldo volta - sem isso o motorista só vê o
        // dinheiro reaparecer e não entende o que houve nem o que corrigir.
        setRejectedRequests(
            requests.filter((r: any) => r.status === 'rejected' && r.payout_error)
                .slice(0, 3)
        );
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        const success = await updateUserProfile(currentUser.id, {
            phone,
            whatsapp,
            vehicle_model: vehicleModel,
            vehicle_plate: vehiclePlate.toUpperCase(),
            vehicle_color: vehicleColor,
            vehicle_type: vehicleType
        });

        if (success) {
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            alert('Dados atualizados com sucesso!');
        } else {
            alert('Erro ao atualizar dados. Tente novamente.');
        }
        setSaving(false);
    };

    const handleSavePix = async () => {
        // pixKey só tem conteúdo quando a PixKeyInput conseguiu normalizar - uma
        // chave malformada nunca chega ao banco (era o que quebrava o Pix Envio).
        if (!pixKeyValid || !pixKey.trim()) {
            alert('Confira a chave PIX: ela ainda está incompleta ou inválida.');
            return;
        }
        if (!isFullNameValid) {
            alert('Informe o nome completo do titular da conta (nome e sobrenome).');
            return;
        }
        if (!isCpfValid) {
            alert('Informe um CPF válido - precisa ser o do titular da chave PIX.');
            return;
        }

        setSaving(true);
        const success = await updateUserProfile(currentUser.id, {
            pix_key: pixKey,
            cpf,
            full_name: fullName.trim(),
            email,
            address_street: addressStreet,
            address_number: addressNumber,
            address_neighborhood: addressNeighborhood,
            address_city: addressCity,
            address_zip: addressZip
        });

        if (success) {
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            alert('Dados PIX atualizados com sucesso!');
        } else {
            alert('Erro ao atualizar dados. Tente novamente.');
        }
        setSaving(false);
    };

    const handleWithdraw = async () => {
        const amount = parseFloat(withdrawAmount);
        if (isNaN(amount) || amount <= 0) {
            alert('Por favor, insira um valor válido.');
            return;
        }

        if (!currentUser.pix_key) {
            alert('Configure sua chave PIX antes de solicitar saque.');
            setActiveTab('pix');
            return;
        }

        // Sem CPF/nome do titular o banco recusa a transferência ("chave não
        // pertence ao titular") depois de já ter descontado o saldo. Melhor
        // barrar aqui e mandar completar o cadastro.
        if (!podeSacar) {
            alert('Complete seus dados de recebimento antes de sacar:\n\n' +
                (!isFullNameValid ? '• Nome completo do titular da conta\n' : '') +
                (!isCpfValid ? '• CPF do titular da chave PIX\n' : '') +
                '\nO banco confere se a chave PIX é mesmo sua antes de liberar o dinheiro.');
            setActiveTab('pix');
            return;
        }

        const balance = currentUser.financial_balance || 0;
        if (amount > balance) {
            alert(`Saldo insuficiente. Seu saldo atual é R$ ${balance.toFixed(2)}`);
            return;
        }

        if (amount < 5) {
            alert('O valor mínimo para saque é R$ 5,00');
            return;
        }

        // Motorista cadastrado antes da validação de chave pode ter um celular
        // salvo sem o +55 - conserta na hora do saque em vez de deixar a Efí
        // recusar depois de já ter debitado o saldo.
        const payoutKey = repairStoredPixKey(currentUser.pix_key);

        if (!window.confirm(`Confirma saque de R$ ${amount.toFixed(2)} para a chave PIX:\n${getPixKeyTypeLabel(payoutKey)} ${formatPixKeyForDisplay(payoutKey)}?`)) {
            return;
        }

        setProcessingWithdraw(true);
        const result = await createPaymentRequest(
            currentUser.id,
            'driver_payout',
            amount,
            0,
            payoutKey
        );

        if (result.success) {
            alert(result.message);
            setWithdrawAmount('');
            // Refresh balance
            const updated = await fetchUserProfile(currentUser.id);
            if (updated) {
                onUpdate(updated);
            }
            loadPendingRequests();
        } else {
            alert(result.message);
        }
        setProcessingWithdraw(false);
    };

    const formatCPF = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})$/);
        if (match) {
            let formatted = '';
            if (match[1]) formatted += match[1];
            if (match[2]) formatted += '.' + match[2];
            if (match[3]) formatted += '.' + match[3];
            if (match[4]) formatted += '-' + match[4];
            return formatted;
        }
        return value;
    };

    const formatPhone = (value: string) => {
        const cleaned = value.replace(/\D/g, '');
        const match = cleaned.match(/^(\d{0,2})(\d{0,5})(\d{0,4})$/);
        if (match) {
            let formatted = '';
            if (match[1]) formatted += '(' + match[1];
            if (match[2]) formatted += ') ' + match[2];
            if (match[3]) formatted += '-' + match[3];
            return formatted;
        }
        return value;
    };

    return (
        <div className="fixed inset-0 z-[200] bg-black/95 flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-whatsapp-panel p-4 flex items-center gap-4 border-b border-white/10 shrink-0">
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-white transition"
                >
                    <span className="material-icons">close</span>
                </button>
                <div className="flex-1">
                    <h1 className="text-white font-bold text-lg">Meus Dados</h1>
                    <p className="text-gray-400 text-xs">Configure seu perfil e recebimentos</p>
                </div>

                <div className="flex items-center gap-2">
                    {/* Header Action Button */}
                    {activeTab === 'profile' && (
                        <button
                            onClick={handleSaveProfile}
                            disabled={saving}
                            className="bg-whatsapp-green text-black px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition disabled:opacity-50"
                        >
                            {saving ? '...' : 'Salvar'}
                        </button>
                    )}
                    {activeTab === 'pix' && (
                        <button
                            onClick={handleSavePix}
                            disabled={saving || !pixKeyValid || !isCpfValid || !isFullNameValid}
                            className="bg-teal-500 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition disabled:opacity-50"
                        >
                            {saving ? '...' : 'Salvar'}
                        </button>
                    )}
                    {activeTab === 'withdraw' && (
                        <button
                            onClick={handleWithdraw}
                            disabled={processingWithdraw || !podeSacar || !withdrawAmount || parseFloat(withdrawAmount) <= 0}
                            className="bg-green-600 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider active:scale-95 transition disabled:opacity-50"
                        >
                            {processingWithdraw ? '...' : 'Sacar'}
                        </button>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-whatsapp-panel/80 border-b border-white/5 shrink-0">
                {[
                    { id: 'profile', label: 'Perfil', icon: 'person' },
                    { id: 'pix', label: 'PIX / Recebimento', icon: 'pix' },
                    { id: 'withdraw', label: 'Sacar', icon: 'payments' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`flex-1 py-3 flex items-center justify-center gap-2 text-sm font-bold transition-all border-b-2 ${activeTab === tab.id
                            ? 'text-whatsapp-green border-whatsapp-green bg-whatsapp-green/5'
                            : 'text-gray-400 border-transparent hover:text-white'
                            }`}
                    >
                        <span className="material-icons text-sm">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 custom-scrollbar pb-24">
                {activeTab === 'profile' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* Avatar Section */}
                        <div className="bg-whatsapp-panel/40 p-6 rounded-2xl border border-white/5 text-center">
                            <div className="relative inline-block mx-auto mb-4">
                                <img
                                    src={currentUser.avatar_url || 'https://via.placeholder.com/100'}
                                    alt="Avatar"
                                    className={`w-24 h-24 rounded-full border-4 border-whatsapp-green/30 object-cover transition ${uploadingImage ? 'opacity-50 blur-sm' : ''}`}
                                />
                                {uploadingImage && (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="material-icons animate-spin text-white">sync</span>
                                    </div>
                                )}
                                <label
                                    htmlFor="avatar-upload"
                                    className={`absolute bottom-0 right-0 bg-whatsapp-green text-white p-2 rounded-full cursor-pointer hover:bg-green-500 transition shadow-lg border-2 border-[#1a2c38] ${uploadingImage ? 'pointer-events-none opacity-50' : ''}`}
                                >
                                    <span className="material-icons text-sm">photo_camera</span>
                                </label>
                                <input
                                    id="avatar-upload"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleImageUpload}
                                    disabled={uploadingImage}
                                />
                            </div>
                            <h2 className="text-white font-bold text-xl">{currentUser.username}</h2>
                            <p className="text-gray-400 text-sm">Motorista desde {new Date(currentUser.created_at || '').toLocaleDateString('pt-BR')}</p>
                        </div>

                        {/* Contact Info */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-accent-400 text-sm">contact_phone</span>
                                Contato
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Telefone</label>
                                <input
                                    type="tel"
                                    value={phone}
                                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">WhatsApp</label>
                                <input
                                    type="tel"
                                    value={whatsapp}
                                    onChange={(e) => setWhatsapp(formatPhone(e.target.value))}
                                    placeholder="(00) 00000-0000"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                />
                            </div>
                        </div>

                        {/* Vehicle Info */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-orange-400 text-sm">directions_car</span>
                                Veículo
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-2 block">Tipo de Veículo</label>
                                <div className="flex flex-wrap gap-3">
                                    {activeCategories.map(category => (
                                        <button
                                            key={category.id}
                                            type="button"
                                            onClick={() => setVehicleType(category.slug)}
                                            className={`flex-1 min-w-[100px] py-3 rounded-xl flex items-center justify-center gap-2 font-bold transition ${vehicleType === category.slug
                                                ? 'bg-accent-500 text-white'
                                                : 'bg-black/30 text-gray-400 border border-white/10'
                                                }`}
                                        >
                                            {category.icon_url ? (
                                                <img src={category.icon_url} alt="" className="w-5 h-5 object-contain" />
                                            ) : (
                                                <span className="material-icons">{category.slug === 'motorcycle' ? 'two_wheeler' : 'directions_car'}</span>
                                            )}
                                            {category.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="col-span-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Modelo</label>
                                    <input
                                        type="text"
                                        value={vehicleModel}
                                        onChange={(e) => setVehicleModel(e.target.value)}
                                        placeholder="Ex: Honda Civic 2020"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Placa</label>
                                    <input
                                        type="text"
                                        value={vehiclePlate}
                                        onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                                        placeholder="ABC1D23"
                                        maxLength={7}
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition font-mono uppercase"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Cor</label>
                                    <input
                                        type="text"
                                        value={vehicleColor}
                                        onChange={(e) => setVehicleColor(e.target.value)}
                                        placeholder="Ex: Prata"
                                        className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'pix' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* Summary Info */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-3">
                            <div className="flex items-center gap-3 text-white">
                                <div className="w-10 h-10 bg-teal-500/10 rounded-full flex items-center justify-center">
                                    <span className="material-icons text-teal-500">pix</span>
                                </div>
                                <div>
                                    <p className="font-bold">Chave PIX</p>
                                    <p className="text-xs text-gray-400">Para recebimento de bônus e corridas online</p>
                                </div>
                            </div>
                        </div>

                        {/* PIX Settings */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            {/* Nome e CPF do TITULAR da chave. O banco confere
                                se a chave PIX pertence a esse CPF antes de
                                liberar a transferência - chave certa com CPF de
                                outra pessoa faz o saque ser recusado. */}
                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">
                                    Nome completo do titular da conta
                                </label>
                                <input
                                    type="text"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="Como está no seu banco"
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-teal-500 outline-none transition"
                                />
                                {fullName.trim() && !isFullNameValid && (
                                    <p className="text-[11px] text-red-400 mt-1">Informe nome e sobrenome.</p>
                                )}
                            </div>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">
                                    CPF do titular
                                </label>
                                <input
                                    type="tel"
                                    inputMode="numeric"
                                    value={cpf}
                                    onChange={(e) => setCpf(formatCPF(e.target.value))}
                                    placeholder="000.000.000-00"
                                    maxLength={14}
                                    className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border outline-none transition"
                                    style={{ borderColor: cpf.trim() ? (isCpfValid ? 'rgba(37,211,102,0.6)' : 'rgba(248,113,113,0.6)') : 'rgba(255,255,255,0.1)' }}
                                />
                                {cpf.trim() && !isCpfValid ? (
                                    <p className="text-[11px] text-red-400 mt-1">
                                        CPF inválido - confira os dígitos.
                                    </p>
                                ) : (
                                    <p className="text-[10px] text-gray-500 mt-1">
                                        Precisa ser o CPF do dono da chave PIX abaixo.
                                    </p>
                                )}
                            </div>

                            <PixKeyInput
                                label="Chave PIX para Recebimentos"
                                value={currentUser.pix_key}
                                onChange={setPixKey}
                                onValidChange={setPixKeyValid}
                            />

                            {!podeSacar && (
                                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex gap-2">
                                    <span className="material-icons text-yellow-500 text-sm">info</span>
                                    <p className="text-[11px] text-yellow-200 leading-snug">
                                        Preencha nome completo, CPF e chave PIX para conseguir sacar.
                                        O banco confere os três antes de liberar a transferência.
                                    </p>
                                </div>
                            )}

                            <div className="pt-2 border-t border-white/5">
                                <h4 className="text-white font-bold text-sm mb-3">Endereço de Cobrança</h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="col-span-2">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Rua / Logradouro</label>
                                        <input
                                            type="text"
                                            value={addressStreet}
                                            onChange={(e) => setAddressStreet(e.target.value)}
                                            placeholder="Nome da rua"
                                            className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Número</label>
                                        <input
                                            type="text"
                                            value={addressNumber}
                                            onChange={(e) => setAddressNumber(e.target.value)}
                                            placeholder="123"
                                            className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Bairro</label>
                                        <input
                                            type="text"
                                            value={addressNeighborhood}
                                            onChange={(e) => setAddressNeighborhood(e.target.value)}
                                            placeholder="Nome do bairro"
                                            className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Cidade</label>
                                        <input
                                            type="text"
                                            value={addressCity}
                                            onChange={(e) => setAddressCity(e.target.value)}
                                            placeholder="Nome da cidade"
                                            className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">CEP</label>
                                        <input
                                            type="text"
                                            value={addressZip}
                                            onChange={(e) => setAddressZip(e.target.value)}
                                            placeholder="00000-000"
                                            maxLength={9}
                                            className="w-full bg-black/30 text-white px-4 py-3 rounded-xl border border-white/10 focus:border-whatsapp-green outline-none transition"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'withdraw' && (
                    <div className="max-w-lg mx-auto space-y-6">
                        {/* Balance Card */}
                        <div className="bg-gradient-to-br from-green-500/20 to-emerald-500/10 p-6 rounded-2xl border border-green-500/30 text-center">
                            <p className="text-gray-400 text-sm uppercase font-bold mb-1">Saldo Disponível</p>
                            <p className="text-4xl font-black text-green-500">R$ {(currentUser.financial_balance || 0).toFixed(2)}</p>
                            {currentUser.pix_key ? (
                                <p className="text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
                                    <span className="material-icons text-xs text-teal-400">pix</span>
                                    {getPixKeyTypeLabel(currentUser.pix_key)}: {formatPixKeyForDisplay(currentUser.pix_key)}
                                </p>
                            ) : (
                                <p className="text-xs text-red-400 mt-2">
                                    ⚠️ Configure sua chave PIX na aba "PIX / Recebimento"
                                </p>
                            )}
                            {currentUser.pix_key && !podeSacar && (
                                <button
                                    onClick={() => setActiveTab('pix')}
                                    className="text-xs text-yellow-400 mt-2 underline"
                                >
                                    ⚠️ Falta {!isFullNameValid ? 'seu nome completo' : ''}
                                    {!isFullNameValid && !isCpfValid ? ' e ' : ''}
                                    {!isCpfValid ? 'seu CPF' : ''} — toque para completar
                                </button>
                            )}
                        </div>

                        {/* Pending Requests */}
                        {pendingRequests.length > 0 && (
                            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-2xl">
                                <h4 className="text-yellow-500 font-bold text-sm mb-2 flex items-center gap-2">
                                    <span className="material-icons text-sm">schedule</span>
                                    Saques Pendentes
                                </h4>
                                {pendingRequests.map(req => (
                                    <div key={req.id} className="flex justify-between items-center bg-black/20 p-3 rounded-xl mt-2">
                                        <div>
                                            <p className="text-white font-bold">R$ {req.amount_money.toFixed(2)}</p>
                                            <p className="text-[10px] text-gray-400">{new Date(req.created_at).toLocaleString('pt-BR')}</p>
                                        </div>
                                        <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-2 py-1 rounded-full font-bold">Aguardando</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Saques recusados pelo banco - com o motivo, pra o
                            motorista saber o que corrigir (quase sempre chave
                            PIX não cadastrada no banco dele). */}
                        {rejectedRequests.length > 0 && (
                            <div className="bg-red-500/10 border border-red-500/30 p-4 rounded-2xl">
                                <h4 className="text-red-400 font-bold text-sm mb-2 flex items-center gap-2">
                                    <span className="material-icons text-sm">error_outline</span>
                                    Saque não concluído
                                </h4>
                                {rejectedRequests.map(req => (
                                    <div key={req.id} className="bg-black/20 p-3 rounded-xl mt-2">
                                        <div className="flex justify-between items-center">
                                            <p className="text-white font-bold">R$ {req.amount_money.toFixed(2)}</p>
                                            <span className="text-[10px] bg-green-500/20 text-green-400 px-2 py-1 rounded-full font-bold">
                                                Valor devolvido
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-red-300 mt-2 leading-snug">{req.payout_error}</p>
                                        <p className="text-[10px] text-gray-500 mt-1">
                                            {new Date(req.created_at).toLocaleString('pt-BR')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Withdraw Form */}
                        <div className="bg-whatsapp-panel/40 p-5 rounded-2xl border border-white/5 space-y-4">
                            <h3 className="text-white font-bold flex items-center gap-2">
                                <span className="material-icons text-green-400 text-sm">payments</span>
                                Solicitar Saque
                            </h3>

                            <div>
                                <label className="text-[10px] text-gray-500 uppercase font-bold mb-1 block">Valor do Saque (R$)</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">R$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="5"
                                        max={currentUser.financial_balance || 0}
                                        value={withdrawAmount}
                                        onChange={(e) => setWithdrawAmount(e.target.value)}
                                        placeholder="0,00"
                                        className="w-full bg-black/30 text-white text-2xl font-bold pl-12 pr-4 py-4 rounded-xl border border-white/10 focus:border-green-500 outline-none transition text-center"
                                    />
                                </div>
                                <p className="text-[10px] text-gray-500 mt-1">Mínimo: R$ 5,00</p>
                            </div>

                            {/* Quick Amount Buttons */}
                            <div className="grid grid-cols-4 gap-2">
                                {[10, 25, 50, 100].map(amount => (
                                    <button
                                        key={amount}
                                        onClick={() => setWithdrawAmount(amount.toString())}
                                        disabled={(currentUser.financial_balance || 0) < amount}
                                        className="py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-sm font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
                                    >
                                        R$ {amount}
                                    </button>
                                ))}
                            </div>

                            {/* All Balance Button */}
                            <button
                                onClick={() => setWithdrawAmount((currentUser.financial_balance || 0).toString())}
                                disabled={!currentUser.financial_balance || currentUser.financial_balance < 5}
                                className="w-full py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-sm transition disabled:opacity-30"
                            >
                                Sacar Todo Saldo
                            </button>
                        </div>

                        {/* Info Note */}
                        <p className="text-xs text-gray-500 text-center">
                            O saque será processado manualmente em até 24 horas úteis. Você receberá uma notificação quando for concluído.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
