/**
 * AdminNotificationsView - View para envio de notificações globais
 */

import React, { useState } from 'react';
import { Button, Card, Input } from '../../components/shared';
import { sendBroadcast } from '../../../services/supabaseClient';
import { sendNotification } from '../../../services/notificationSender';

export const AdminNotificationsView: React.FC = () => {
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [imageUrl, setImageUrl] = useState('');
    const [sound, setSound] = useState('default');
    const [target, setTarget] = useState<'all' | 'driver' | 'client'>('all');
    const [sendPush, setSendPush] = useState(true);
    const [sendInApp, setSendInApp] = useState(true);
    const [isSending, setIsSending] = useState(false);

    const handleSend = async () => {
        if (!title.trim() || !message.trim()) {
            alert('Por favor, preencha o título e a mensagem.');
            return;
        }

        if (!sendPush && !sendInApp) {
            alert('Selecione pelo menos uma forma de envio (Push ou In-App).');
            return;
        }

        setIsSending(true);

        try {
            let successInApp = true;
            let pushResults: { success: boolean, count: number, error?: string } = { success: true, count: 0 };

            // 1. Send in-app broadcast (Mural)
            if (sendInApp) {
                successInApp = await sendBroadcast(title, message, target);
            }

            // 2. Send FCM push notifications via Edge Function
            if (sendPush) {
                // A RPC get_push_tokens só reconhece 'drivers'/'clients' (plural) para
                // filtro por papel - 'target' aqui é singular (usado pelo Mural/
                // sendBroadcast). Sem esse mapeamento, "Apenas Motoristas"/"Apenas
                // Clientes" batiam em nenhum branch da RPC e o push saía pra 0 pessoas
                // silenciosamente (a função ainda retornava sucesso).
                const pushTargetType = target === 'driver' ? 'drivers' : target === 'client' ? 'clients' : 'all';
                const fcmResult = await sendNotification(
                    title.trim(),
                    message.trim(),
                    pushTargetType,
                    {
                        imageUrl: imageUrl.trim() || undefined,
                        sound: sound.trim() || 'default'
                    }
                );

                pushResults = {
                    success: fcmResult.success,
                    count: fcmResult.sent || 0,
                    error: fcmResult.error || ''
                };
            }

            if (successInApp || pushResults.success) {
                let statusMsg = 'Notificação processada!\n';
                if (sendInApp) statusMsg += `\n✓ Mural do App: ${successInApp ? 'Enviado' : 'Erro'}`;
                if (sendPush) {
                    statusMsg += `\n✓ Push (FCM): ${pushResults.success ? (pushResults.count + ' enviados') : 'Erro (' + (pushResults.error || 'Falha') + ')'}`;
                }

                alert(statusMsg);

                if (successInApp) {
                    setTitle('');
                    setMessage('');
                    setImageUrl('');
                }
            } else {
                alert('Erro ao enviar notificações.');
            }
        } catch (error) {
            console.error('Error sending broadcast:', error);
            alert('Erro crítico ao processar envio.');
        }

        setIsSending(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span className="material-icons">campaign</span>
                    Enviar Notificação Global
                </h2>
                <p className="text-sm text-gray-400 mt-1">Envie mensagens para todos os usuários do aplicativo</p>
            </div>

            {/* Form Card */}
            <Card>
                <div className="admin-card-body space-y-6">
                    {/* Delivery Method */}
                    <div>
                        <label className="admin-form-label mb-3 block">Método de Envio</label>
                        <div className="flex gap-4">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sendPush}
                                    onChange={(e) => setSendPush(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm text-gray-300">Notificação Push (FCM)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={sendInApp}
                                    onChange={(e) => setSendInApp(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                <span className="text-sm text-gray-300">Mural In-App</span>
                            </label>
                        </div>
                    </div>

                    {/* Target Audience */}
                    <div>
                        <label className="admin-form-label">Destinatários</label>
                        <select
                            className="admin-form-input"
                            value={target}
                            onChange={(e) => setTarget(e.target.value as any)}
                        >
                            <option value="all">Todos os Usuários</option>
                            <option value="driver">Apenas Motoristas</option>
                            <option value="client">Apenas Clientes</option>
                        </select>
                    </div>

                    {/* Title */}
                    <div className="admin-form-group">
                        <label className="admin-form-label">Título da Notificação</label>
                        <input
                            type="text"
                            className="admin-form-input"
                            placeholder="Ex: Novo Sorteio!"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    </div>

                    {/* Message */}
                    <div className="admin-form-group">
                        <label className="admin-form-label">Mensagem</label>
                        <textarea
                            className="admin-form-input"
                            rows={4}
                            placeholder="Digite a mensagem que será enviada..."
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                        />
                    </div>

                    {/* Image URL (Optional) */}
                    <div className="admin-form-group">
                        <label className="admin-form-label">URL da Imagem (Opcional)</label>
                        <input
                            type="text"
                            className="admin-form-input"
                            placeholder="https://exemplo.com/imagem.jpg"
                            value={imageUrl}
                            onChange={(e) => setImageUrl(e.target.value)}
                        />
                        {imageUrl && (
                            <div className="mt-3">
                                <p className="text-xs text-gray-400 mb-2">Preview:</p>
                                <img
                                    src={imageUrl}
                                    alt="Preview"
                                    className="max-w-xs rounded-lg border border-gray-700"
                                    onError={() => alert('URL de imagem inválida')}
                                />
                            </div>
                        )}
                    </div>

                    {/* Sound */}
                    <div className="admin-form-group">
                        <label className="admin-form-label">Som da Notificação</label>
                        <select
                            className="admin-form-input"
                            value={sound}
                            onChange={(e) => setSound(e.target.value)}
                        >
                            <option value="default">Padrão</option>
                            <option value="success">Sucesso</option>
                            <option value="alert">Alerta</option>
                            <option value="coin">Moeda</option>
                        </select>
                    </div>

                    {/* Send Button */}
                    <div className="flex justify-end pt-4 border-t border-gray-700">
                        <Button
                            variant="primary"
                            onClick={handleSend}
                            loading={isSending}
                            size="lg"
                        >
                            <span className="material-icons" style={{ fontSize: '18px' }}>send</span>
                            {isSending ? 'Enviando...' : 'Enviar Notificação'}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Help/Info Card */}
            <Card variant="glass">
                <div className="admin-card-body">
                    <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
                        <span className="material-icons text-yellow-400" style={{ fontSize: '20px' }}>info</span>
                        Dicas de Uso
                    </h4>
                    <ul className="space-y-2 text-sm text-gray-300">
                        <li className="flex items-start gap-2">
                            <span className="material-icons text-xs text-gray-500 mt-0.5">check</span>
                            <span><strong>Push (FCM):</strong> Notificações aparecem mesmo com o app fechado</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-icons text-xs text-gray-500 mt-0.5">check</span>
                            <span><strong>Mural In-App:</strong> Mensagens ficam salvas no mural de notificações</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-icons text-xs text-gray-500 mt-0.5">check</span>
                            <span>Use imagens para tornar as notificações mais atrativas</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="material-icons text-xs text-gray-500 mt-0.5">check</span>
                            <span>Avisos importantes devem usar som "Alerta"</span>
                        </li>
                    </ul>
                </div>
            </Card>
        </div>
    );
};

export default AdminNotificationsView;
