import React, { useState, useEffect } from 'react';
import { StoreProduct, StoreOrder } from '../../../types';
import {
    fetchStoreProducts,
    fetchStoreOrders,
    updateStoreOrderStatus,
    createStoreProduct,
    updateStoreProduct,
    deleteStoreProduct,
    uploadStoreProductImage
} from '../../../services/supabaseClient';
import { Card, Button, Badge, Input, Modal } from '../../components/shared';

export const AdminStoreView: React.FC = () => {
    const [products, setProducts] = useState<StoreProduct[]>([]);
    const [orders, setOrders] = useState<StoreOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [view, setView] = useState<'products' | 'orders'>('products');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Partial<StoreProduct> | null>(null);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [p, o] = await Promise.all([
                fetchStoreProducts(),
                fetchStoreOrders()
            ]);
            setProducts(p);
            setOrders(o);
        } catch (error) {
            console.error("Erro ao carregar dados da loja:", error);
        }
        setLoading(false);
    };

    const handleSaveProduct = async () => {
        if (!editingProduct?.name || !editingProduct?.price_brl) {
            alert("Nome e Preço R$ são obrigatórios");
            return;
        }

        try {
            let error;
            if (editingProduct.id) {
                error = await updateStoreProduct(editingProduct.id, editingProduct);
            } else {
                error = await createStoreProduct(editingProduct);
            }

            if (error) {
                alert(`Erro: ${error}`);
            } else {
                setIsModalOpen(false);
                await loadData();
            }
        } catch (e) {
            alert("Erro inesperado.");
        }
    };

    const handleDeleteProduct = async (id: string) => {
        if (!window.confirm("Deseja realmente excluir este produto?")) return;
        const error = await deleteStoreProduct(id);
        if (error) alert(error);
        else await loadData();
    };

    const handleDeliverOrder = async (orderId: string) => {
        const success = await updateStoreOrderStatus(orderId, 'delivered');
        if (success) {
            alert("Pedido marcado como entregue!");
            await loadData();
        } else {
            alert("Erro ao atualizar pedido.");
        }
    };

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        const url = await uploadStoreProductImage(file);
        if (url) {
            setEditingProduct(prev => ({ ...prev, image_url: url }));
        } else {
            alert("Erro no upload da imagem.");
        }
        setUploading(false);
    };

    if (loading) {
        return <div className="admin-loading">Carregando loja...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white">Gestão da Loja / Shopping</h2>
                    <p className="text-sm text-gray-400 mt-1">Gerencie produtos e acompanhe pedidos dos usuários</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => {
                        setEditingProduct({ active: true, stock: 10, price_brl: 0, price_coins: 0 });
                        setIsModalOpen(true);
                    }}>
                        <span className="material-icons">add</span>
                        Novo Produto
                    </Button>
                    <Button variant="primary" onClick={loadData}>
                        <span className="material-icons">refresh</span>
                    </Button>
                </div>
            </div>

            <div className="admin-tabs">
                <button
                    className={`admin-tab ${view === 'products' ? 'active' : ''}`}
                    onClick={() => setView('products')}
                >
                    <span className="material-icons text-sm mr-1">inventory_2</span>
                    Produtos
                </button>
                <button
                    className={`admin-tab ${view === 'orders' ? 'active' : ''}`}
                    onClick={() => setView('orders')}
                >
                    <span className="material-icons text-sm mr-1">shopping_bag</span>
                    Pedidos {orders.filter(o => o.status === 'pending').length > 0 && (
                        <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full ml-1">
                            {orders.filter(o => o.status === 'pending').length}
                        </span>
                    )}
                </button>
            </div>

            {view === 'products' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.length === 0 ? (
                        <div className="col-span-full py-12 text-center text-gray-500">
                            Nenhum produto cadastrado.
                        </div>
                    ) : (
                        products.map(p => (
                            <Card key={p.id} className="overflow-hidden flex flex-col h-full">
                                <div className="h-40 bg-gray-900 flex items-center justify-center relative">
                                    {p.image_url ? (
                                        <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <span className="material-icons text-gray-700" style={{ fontSize: '48px' }}>image</span>
                                    )}
                                    <div className="absolute top-2 right-2 flex gap-1">
                                        <button
                                            className="p-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full transition-colors"
                                            onClick={() => {
                                                setEditingProduct(p);
                                                setIsModalOpen(true);
                                            }}
                                        >
                                            <span className="material-icons" style={{ fontSize: '18px' }}>edit</span>
                                        </button>
                                        <button
                                            className="p-1.5 bg-red-500/60 hover:bg-red-500/80 text-white rounded-full transition-colors"
                                            onClick={() => handleDeleteProduct(p.id)}
                                        >
                                            <span className="material-icons" style={{ fontSize: '18px' }}>delete</span>
                                        </button>
                                    </div>
                                    {!p.active && (
                                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                            <Badge variant="danger">Inativo</Badge>
                                        </div>
                                    )}
                                </div>
                                <div className="p-4 flex-grow flex flex-col">
                                    <h4 className="font-bold text-white mb-1">{p.name}</h4>
                                    <p className="text-xs text-gray-400 mb-4 line-clamp-2 h-8">{p.description}</p>

                                    <div className="mt-auto pt-4 border-t border-gray-800 flex justify-between items-end">
                                        <div>
                                            <div className="text-sm font-bold text-white">R$ {p.price_brl.toFixed(2)}</div>
                                            <div className="text-xs text-yellow-500 ">{p.price_coins} moedas</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] text-gray-500 uppercase font-bold">Estoque</div>
                                            <div className={`text-sm font-bold ${p.stock <= 2 ? 'text-red-500' : 'text-gray-300'}`}>
                                                {p.stock}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))
                    )}
                </div>
            ) : (
                <Card>
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                                <tr>
                                    <th>Pedido ID</th>
                                    <th>Usuário</th>
                                    <th>Produto</th>
                                    <th>Valor</th>
                                    <th>Pagamento</th>
                                    <th>Data</th>
                                    <th>Status</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {orders.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="text-center py-8 text-gray-500">
                                            Nenhum pedido realizado.
                                        </td>
                                    </tr>
                                ) : (
                                    orders.map(o => (
                                        <tr key={o.id}>
                                            <td className="font-mono text-[10px] text-gray-500">#{o.id.slice(0, 8)}</td>
                                            <td>
                                                <div className="flex items-center gap-2">
                                                    <div className="admin-avatar-sm">{(o.user as any)?.username?.charAt(0) || 'U'}</div>
                                                    <div className="text-xs">
                                                        <div className="text-white font-medium">{(o.user as any)?.username}</div>
                                                        <div className="text-gray-500">{(o.user as any)?.phone}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div className="text-xs font-medium text-white">{(o.product as any)?.name}</div>
                                            </td>
                                            <td>
                                                <div className="text-xs font-bold text-white">
                                                    {o.payment_method === 'pix' ? `R$ ${o.amount_money.toFixed(2)}` : `${o.amount_coins} moedas`}
                                                </div>
                                            </td>
                                            <td>
                                                <Badge variant={o.payment_method === 'pix' ? 'success' : 'warning'}>
                                                    {o.payment_method === 'pix' ? 'PIX' : 'Moedas'}
                                                </Badge>
                                            </td>
                                            <td>
                                                <div className="text-[11px] text-gray-400">
                                                    {new Date(o.created_at).toLocaleDateString()}
                                                </div>
                                            </td>
                                            <td>
                                                <Badge variant={o.status === 'delivered' ? 'success' : 'warning'}>
                                                    {o.status === 'delivered' ? 'Entregue' : 'Pendente'}
                                                </Badge>
                                            </td>
                                            <td>
                                                {o.status === 'pending' && (
                                                    <Button
                                                        variant="primary"
                                                        size="sm"
                                                        onClick={() => handleDeliverOrder(o.id)}
                                                    >
                                                        Entregar
                                                    </Button>
                                                )}
                                                {o.status === 'delivered' && o.delivered_at && (
                                                    <div className="text-[10px] text-gray-500">
                                                        {new Date(o.delivered_at).toLocaleDateString()}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Product Edit Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingProduct?.id ? 'Editar Produto' : 'Novo Produto'}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="admin-form-group col-span-2">
                            <label className="admin-form-label">Nome do Produto</label>
                            <Input
                                value={editingProduct?.name || ''}
                                onChange={e => setEditingProduct(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Ex: Capacetito Premium"
                            />
                        </div>
                        <div className="admin-form-group col-span-2">
                            <label className="admin-form-label">Descrição</label>
                            <textarea
                                className="admin-form-input min-h-[80px]"
                                value={editingProduct?.description || ''}
                                onChange={e => setEditingProduct(prev => ({ ...prev, description: e.target.value }))}
                                placeholder="Detalhes do produto..."
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">Preço (R$)</label>
                            <Input
                                type="number"
                                value={editingProduct?.price_brl?.toString() || '0'}
                                onChange={e => setEditingProduct(prev => ({ ...prev, price_brl: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">Preço (Moedas)</label>
                            <Input
                                type="number"
                                value={editingProduct?.price_coins?.toString() || '0'}
                                onChange={e => setEditingProduct(prev => ({ ...prev, price_coins: parseInt(e.target.value) || 0 }))}
                            />
                        </div>
                        <div className="admin-form-group">
                            <label className="admin-form-label">Estoque Atual</label>
                            <Input
                                type="number"
                                value={editingProduct?.stock?.toString() || '0'}
                                onChange={e => setEditingProduct(prev => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
                            />
                        </div>
                        <div className="admin-form-group flex items-center mt-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={editingProduct?.active}
                                    onChange={e => setEditingProduct(prev => ({ ...prev, active: e.target.checked }))}
                                />
                                <span className="text-sm text-white font-medium">Produto Ativo</span>
                            </label>
                        </div>
                    </div>

                    <div className="admin-form-group">
                        <label className="admin-form-label">Imagem do Produto</label>
                        <div className="flex items-center gap-4">
                            <div className="w-20 h-20 bg-gray-800 rounded flex items-center justify-center overflow-hidden border border-gray-700">
                                {editingProduct?.image_url ? (
                                    <img src={editingProduct.image_url} className="w-full h-full object-cover" />
                                ) : (
                                    <span className="material-icons text-gray-600">image</span>
                                )}
                            </div>
                            <div className="flex-grow">
                                <input
                                    type="file"
                                    id="product-img"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleImageUpload}
                                />
                                <label
                                    htmlFor="product-img"
                                    className="admin-form-input cursor-pointer flex items-center justify-center gap-2 hover:bg-gray-800 transition-colors"
                                >
                                    <span className="material-icons text-sm">upload</span>
                                    {uploading ? 'Enviando...' : 'Carregar Imagem'}
                                </label>
                                <p className="text-[10px] text-gray-500 mt-1">Formatos: PNG, JPG ou WEBP. Recomendado: 400x400.</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 mt-8">
                        <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
                        <Button variant="primary" onClick={handleSaveProduct}>Salvar Produto</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AdminStoreView;
