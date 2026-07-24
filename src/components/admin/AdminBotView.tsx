import React, { useState, useEffect } from 'react';
import { WahaService } from '../../../services/wahaService';
import { Card, Button, Badge, Input } from '../../components/shared';

export const AdminBotView: React.FC = () => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [activeSession, setActiveSession] = useState<string>('default');
    const [apiKey, setApiKey] = useState(WahaService.getApiKey());

    useEffect(() => {
        loadData();
        const interval = setInterval(loadData, 10000); // Polling status
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            const sess = await WahaService.getSessions();
            setSessions(Array.isArray(sess) ? sess : []);
        } catch (error) {
            console.error("Erro ao carregar sessões WAHA:", error);
        }
        setLoading(false);
    };

    const handleStartSession = async () => {
        const name = prompt("Nome da sessão:", activeSession) || activeSession;
        await WahaService.startSession(name);
        alert("Comando de inicialização enviado. Aguarde alguns segundos.");
        await loadData();
    };

    const handleGetQR = async (sessionName: string) => {
        setQrCode(null);
        const blob = await WahaService.getSessionScreen(sessionName);
        if (blob) {
            const url = URL.createObjectURL(blob);
            setQrCode(url);
        } else {
            alert("Não foi possível obter o QR Code. A sessão pode já estar conectada ou em erro.");
        }
    };

    const handleSaveKey = () => {
        WahaService.setApiKey(apiKey);
        alert("Chave API salva localmente.");
        loadData();
    };

    if (loading) {
        return <div className="admin-loading">Carregando status do Bot...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">WhatsApp Bot / WAHA</h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie a conexão e o status do bot oficial</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={loadData}>
                        <span className="material-icons">refresh</span>
                    </Button>
                    <Button variant="primary" onClick={handleStartSession}>
                        <span className="material-icons">add</span>
                        Nova Sessão
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Connection Status */}
                <div className="lg:col-span-2 space-y-4">
                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Sessões Ativas</h3>
                        </div>
                        <div className="admin-table-wrapper">
                            <table className="admin-table">
                                <thead>
                                    <tr>
                                        <th>Sessão</th>
                                        <th>Status</th>
                                        <th>Motor</th>
                                        <th>Ações</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessions.length === 0 ? (
                                        <tr>
                                            <td colSpan={4} className="text-center py-8 text-gray-500">
                                                Nenhuma sessão encontrada no servidor WAHA.
                                            </td>
                                        </tr>
                                    ) : (
                                        sessions.map(s => (
                                            <tr key={s.name}>
                                                <td className="font-bold text-white">{s.name}</td>
                                                <td>
                                                    <Badge variant={s.status === 'RUNNING' ? 'success' : (s.status === 'SCAN_QR_CODE' ? 'warning' : 'danger')}>
                                                        {s.status}
                                                    </Badge>
                                                </td>
                                                <td className="text-xs text-gray-400">{s.engine || 'NOWEB'}</td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        {s.status === 'SCAN_QR_CODE' && (
                                                            <Button size="sm" variant="secondary" onClick={() => handleGetQR(s.name)}>
                                                                <span className="material-icons text-sm mr-1">qr_code</span>
                                                                Ver QR
                                                            </Button>
                                                        )}
                                                        <Button size="sm" variant="secondary" onClick={() => {
                                                            setActiveSession(s.name);
                                                            WahaService.setSessionName(s.name);
                                                            alert(`Sessão ${s.name} definida como padrão.`);
                                                        }}>
                                                            Ativar
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>

                    {qrCode && (
                        <Card className="flex flex-col items-center justify-center py-10 animate-in zoom-in duration-300">
                            <h4 className="text-white font-bold mb-4">Escaneie o QR Code</h4>
                            <div className="p-4 bg-white rounded-xl">
                                <img src={qrCode} alt="WhatsApp QR Code" className="w-64 h-64" />
                            </div>
                            <p className="text-xs text-gray-400 mt-4 text-center max-w-xs">
                                Abra o WhatsApp no seu celular {'>'} Aparelhos Conectados {'>'} Conectar um Aparelho.
                            </p>
                            <Button variant="secondary" className="mt-6" onClick={() => setQrCode(null)}>Fechar</Button>
                        </Card>
                    )}
                </div>

                {/* API Config */}
                <div className="space-y-4">
                    <Card>
                        <div className="admin-card-header">
                            <h3 className="admin-card-title">Configuração do Servidor</h3>
                        </div>
                        <div className="admin-card-body space-y-4">
                            <div className="admin-form-group">
                                <label className="admin-form-label">WAHA API Key</label>
                                <Input
                                    type="password"
                                    value={apiKey}
                                    placeholder="wa_secret_key"
                                    onChange={e => setApiKey((e.target as HTMLInputElement).value)}
                                />
                            </div>
                            <Button variant="primary" className="w-full" onClick={handleSaveKey}>
                                Salvar Chave
                            </Button>

                            <div className="mt-6 pt-6 border-t border-gray-800">
                                <h4 className="text-xs font-bold text-gray-500 uppercase mb-4">Servidor Atual</h4>
                                <div className="p-3 bg-gray-900 rounded border border-gray-800 font-mono text-[10px] text-primary truncate">
                                    https://waha-waha.mxntxp.easypanel.host
                                </div>
                                <p className="text-[10px] text-gray-600 mt-2">
                                    Este servidor processa os comandos do bot e envia mensagens oficiais via WhatsApp.
                                </p>
                            </div>
                        </div>
                    </Card>

                    <Card className="bg-primary/5 border-primary/20">
                        <div className="admin-card-body">
                            <div className="flex gap-3">
                                <span className="material-icons text-primary">info</span>
                                <div className="text-xs text-gray-300 leading-relaxed">
                                    O Bot WhatsApp permite que os clientes peçam corridas diretamente pelo chat, sem precisar do app instalado. O Admin pode gerenciar as sessões aqui.
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default AdminBotView;
