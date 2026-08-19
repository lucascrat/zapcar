import React, { useState, useEffect } from 'react';
import { UserProfile, UserRole } from '../../../types';
import { supabase, handleDbError, PROFILE_SAFE_COLUMNS } from '../../../services/supabaseClient';
import { Badge, Button, Input, Card } from '../shared';

export const AdminClientsView: React.FC = () => {
    const [clients, setClients] = useState<UserProfile[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        loadClients();
    }, []);

    const loadClients = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select(PROFILE_SAFE_COLUMNS)
                .eq('role', UserRole.CLIENT)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClients(data || []);
        } catch (error) {
            handleDbError(error, "loadClients");
        } finally {
            setIsLoading(false);
        }
    };

    const filteredClients = clients.filter(c =>
        (c.username?.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone?.includes(searchTerm))
    );

    const handleDelete = async (id: string) => {
        if (!window.confirm("Deseja realmente excluir este cliente?")) return;

        try {
            const { error } = await supabase.rpc('admin_delete_user', { user_id_param: id });
            if (error) throw error;
            setClients(prev => prev.filter(c => c.id !== id));
            alert("Cliente removido!");
        } catch (error) {
            alert("Erro ao remover cliente");
        }
    };

    return (
        <div className="admin-clients-view">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-white mb-1">Gestão de Clientes</h2>
                    <p className="text-sm text-gray-500">Total: {clients.length} clientes registrados</p>
                </div>
                <div className="flex gap-3">
                    <div className="relative w-full md:w-64">
                        <Input
                            placeholder="Buscar por nome ou celular..."
                            value={searchTerm}
                            onChange={(e: any) => setSearchTerm(e.target ? e.target.value : e)}
                            icon="search"
                        />
                    </div>
                    <Button variant="outline" onClick={loadClients} loading={isLoading}>
                        <span className="material-icons">refresh</span>
                    </Button>
                </div>
            </div>

            <Card>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-white/5 text-gray-500 text-xs uppercase tracking-wider">
                                <th className="px-4 py-3 font-medium">Cliente</th>
                                <th className="px-4 py-3 font-medium">Contato</th>
                                <th className="px-4 py-3 font-medium">Saldo (Coins)</th>
                                <th className="px-4 py-3 font-medium">Cadastro</th>
                                <th className="px-4 py-3 font-medium text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green mx-auto"></div>
                                    </td>
                                </tr>
                            ) : filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                                        Nenhum cliente encontrado
                                    </td>
                                </tr>
                            ) : (
                                filteredClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-white/5 transition-colors group">
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-3">
                                                {client.avatar_url ? (
                                                    <img src={client.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border border-white/10" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold">
                                                        {client.username?.[0]?.toUpperCase()}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{client.username}</p>
                                                    <p className="text-xs text-gray-500 truncate max-w-[150px]">{client.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-sm text-gray-300">{client.phone || 'N/A'}</p>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div className="flex items-center gap-1">
                                                <span className="material-icons text-amber-500 text-sm">monetization_on</span>
                                                <span className="text-sm font-medium text-white">{client.wallet_coins || 0}</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <p className="text-xs text-gray-400">
                                                {client.created_at ? new Date(client.created_at).toLocaleDateString('pt-BR') : 'N/A'}
                                            </p>
                                        </td>
                                        <td className="px-4 py-4 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="outline" size="sm" title="Editar">
                                                    <span className="material-icons text-xs">edit</span>
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => handleDelete(client.id)} className="hover:bg-red-500/20 hover:border-red-500/50">
                                                    <span className="material-icons text-xs text-red-400">delete</span>
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
        </div>
    );
};
