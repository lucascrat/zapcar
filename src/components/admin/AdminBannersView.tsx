/**
 * AdminBannersView - Gerenciamento de banners do app
 */

import React, { useState, useEffect } from 'react';
import { Card, Button } from '../../components/shared';
import { fetchBanners, addBanner, deleteBanner, uploadBannerImage } from '../../../services/supabaseClient';

interface Banner {
    id: string;
    image_url: string;
    link_url: string;
    order_index: number;
    is_active: boolean;
    created_at: string;
}

export const AdminBannersView: React.FC = () => {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newBannerUrl, setNewBannerUrl] = useState('');
    const [newBannerLink, setNewBannerLink] = useState('');
    const [bannerFile, setBannerFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    useEffect(() => {
        loadBanners();
    }, []);

    const loadBanners = async () => {
        setIsLoading(true);
        const data = await fetchBanners();
        // Ensure all properties exist
        const mapped = data.map((b: any) => ({
            ...b,
            order_index: b.order_index || 0,
            is_active: b.is_active !== undefined ? b.is_active : true
        }));
        setBanners(mapped);
        setIsLoading(false);
    };

    const handleAddBanner = async () => {
        if (!newBannerUrl.trim() && !bannerFile) {
            alert('Selecione um arquivo ou informe uma URL da imagem.');
            return;
        }

        setIsUploading(true);
        let imageUrl = newBannerUrl.trim();

        // If file is selected, upload it first
        if (bannerFile) {
            const uploadedUrl = await uploadBannerImage(bannerFile);
            if (!uploadedUrl) {
                alert('Erro ao fazer upload da imagem. Tente novamente.');
                setIsUploading(false);
                return;
            }
            imageUrl = uploadedUrl;
        }

        const ok = await addBanner(imageUrl, newBannerLink, banners.length);
        if (ok) {
            setNewBannerUrl('');
            setNewBannerLink('');
            setBannerFile(null);
            const fileInput = document.getElementById('banner-file-input') as HTMLInputElement;
            if (fileInput) fileInput.value = '';
            loadBanners();
        }
        setIsUploading(false);
    };

    const handleDeleteBanner = async (id: string) => {
        if (confirm('Deletar este banner?')) {
            const ok = await deleteBanner(id);
            if (ok) loadBanners();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setBannerFile(file);
            // Clear URL if file is selected
            setNewBannerUrl('');
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <span className="material-icons">image</span>
                    Gerenciamento de Banners
                </h2>
                <p className="text-sm text-gray-400 mt-1">Gerencie os banners exibidos no aplicativo</p>
            </div>

            {/* Add Banner Form */}
            <Card>
                <div className="admin-card-header">
                    <h3 className="admin-card-title">Adicionar Novo Banner</h3>
                </div>
                <div className="admin-card-body space-y-4">
                    <div className="admin-form-group">
                        <label className="admin-form-label">Upload de Imagem</label>
                        <input
                            id="banner-file-input"
                            type="file"
                            accept="image/*"
                            className="admin-form-input"
                            onChange={handleFileChange}
                        />
                        {bannerFile && (
                            <p className="text-xs text-gray-400 mt-2">
                                Arquivo selecionado: {bannerFile.name}
                            </p>
                        )}
                    </div>

                    <div className="text-center text-gray-500 text-sm">— OU —</div>

                    <div className="admin-form-group">
                        <label className="admin-form-label">URL da Imagem</label>
                        <input
                            type="text"
                            className="admin-form-input"
                            placeholder="https://exemplo.com/banner.jpg"
                            value={newBannerUrl}
                            onChange={(e) => {
                                setNewBannerUrl(e.target.value);
                                if (e.target.value) setBannerFile(null);
                            }}
                        />
                    </div>

                    <div className="admin-form-group">
                        <label className="admin-form-label">Link (Opcional)</label>
                        <input
                            type="text"
                            className="admin-form-input"
                            placeholder="https://exemplo.com/promocao"
                            value={newBannerLink}
                            onChange={(e) => setNewBannerLink(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            onClick={handleAddBanner}
                            loading={isUploading}
                        >
                            <span className="material-icons" style={{ fontSize: '18px' }}>add_photo_alternate</span>
                            {isUploading ? 'Enviando...' : 'Adicionar Banner'}
                        </Button>
                    </div>
                </div>
            </Card>

            {/* Banners List */}
            <div>
                <h3 className="text-lg font-semibold text-white mb-4">
                    Banners Ativos ({banners.length})
                </h3>

                {isLoading ? (
                    <div className="admin-empty-state">
                        <span className="material-icons">hourglass_empty</span>
                        <p className="admin-empty-state-title">Carregando...</p>
                    </div>
                ) : banners.length === 0 ? (
                    <div className="admin-empty-state">
                        <span className="material-icons">add_photo_alternate</span>
                        <p className="admin-empty-state-title">Nenhum banner cadastrado</p>
                        <p className="admin-empty-state-text">Adicione o primeiro banner acima</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {banners.map((banner) => (
                            <Card key={banner.id}>
                                <div className="admin-card-body">
                                    <div className="relative group">
                                        <img
                                            src={banner.image_url}
                                            alt="Banner"
                                            className="w-full h-48 object-cover rounded-lg mb-4"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).src = 'https://via.placeholder.com/800x400?text=Imagem+Indisponível';
                                            }}
                                        />
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                                            <button
                                                className="w-10 h-10 bg-red-500 hover:bg-red-600 rounded-lg flex items-center justify-center text-white"
                                                onClick={() => handleDeleteBanner(banner.id)}
                                                title="Excluir"
                                            >
                                                <span className="material-icons" style={{ fontSize: '20px' }}>delete</span>
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="material-icons text-gray-400" style={{ fontSize: '16px' }}>link</span>
                                            <span className="text-gray-300 truncate">
                                                {banner.link_url || 'Sem link'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="material-icons text-gray-400" style={{ fontSize: '16px' }}>calendar_today</span>
                                            <span className="text-gray-400">
                                                {new Date(banner.created_at).toLocaleDateString('pt-BR')}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminBannersView;
