import React, { useState, useEffect } from 'react';
import { DRIVER_PLANS } from '../constants';

interface DriverPlan {
    id: string;
    title: string;
    description: string;
    price: number;
    days: number;
}

interface PlansManagerProps {
    onClose: () => void;
}

export const PlansManager: React.FC<PlansManagerProps> = ({ onClose }) => {
    const [plans, setPlans] = useState<DriverPlan[]>(DRIVER_PLANS);
    const [editingPlan, setEditingPlan] = useState<DriverPlan | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    const handleEditPlan = (plan: DriverPlan) => {
        setEditingPlan({ ...plan });
    };

    const handleSavePlan = () => {
        if (!editingPlan) return;

        setPlans(prev => prev.map(p =>
            p.id === editingPlan.id ? editingPlan : p
        ));
        setEditingPlan(null);
        alert('Plano atualizado! (Nota: Esta alteração é apenas local. Para persistir, será necessário atualizar o arquivo constants.ts)');
    };

    const handleCancelEdit = () => {
        setEditingPlan(null);
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-whatsapp-dark rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-700 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <span className="material-icons text-yellow-500">monetization_on</span>
                            Gerenciar Planos de Recarga
                        </h2>
                        <p className="text-gray-400 text-sm mt-1">Configure os preços e durações dos planos para motoristas</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition p-2"
                    >
                        <span className="material-icons">close</span>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {plans.map(plan => (
                            <div
                                key={plan.id}
                                className="bg-whatsapp-panel rounded-lg p-6 border border-gray-700 hover:border-green-600 transition"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-white">{plan.title}</h3>
                                        <p className="text-gray-400 text-sm">{plan.description}</p>
                                    </div>
                                    <button
                                        onClick={() => handleEditPlan(plan)}
                                        className="text-blue-400 hover:text-blue-300 transition"
                                    >
                                        <span className="material-icons">edit</span>
                                    </button>
                                </div>

                                <div className="flex items-baseline gap-2 mb-2">
                                    <span className="text-3xl font-bold text-green-500">
                                        R$ {plan.price.toFixed(2)}
                                    </span>
                                    <span className="text-gray-400">/ {plan.days} {plan.days === 1 ? 'dia' : 'dias'}</span>
                                </div>

                                <div className="text-sm text-gray-500">
                                    ID: {plan.id}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Nota Informativa */}
                    <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700 rounded-lg">
                        <div className="flex gap-3">
                            <span className="material-icons text-yellow-500">info</span>
                            <div className="flex-1">
                                <h4 className="font-bold text-yellow-500 mb-1">Nota Importante</h4>
                                <p className="text-sm text-gray-300">
                                    Atualmente, os planos são definidos no arquivo <code className="bg-black/30 px-2 py-1 rounded">constants.ts</code>.
                                    Para persistir alterações, você precisará atualizar manualmente esse arquivo e fazer o deploy.
                                    Em uma versão futura, os planos serão armazenados no banco de dados.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal de Edição */}
            {editingPlan && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-10">
                    <div className="bg-whatsapp-panel rounded-lg p-6 max-w-md w-full border border-gray-700">
                        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <span className="material-icons text-blue-500">edit</span>
                            Editar Plano
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Título</label>
                                <input
                                    type="text"
                                    value={editingPlan.title}
                                    onChange={(e) => setEditingPlan({ ...editingPlan, title: e.target.value })}
                                    className="w-full bg-whatsapp-dark text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-green-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Descrição</label>
                                <input
                                    type="text"
                                    value={editingPlan.description}
                                    onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                                    className="w-full bg-whatsapp-dark text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-green-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Preço (R$)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editingPlan.price}
                                    onChange={(e) => setEditingPlan({ ...editingPlan, price: parseFloat(e.target.value) || 0 })}
                                    className="w-full bg-whatsapp-dark text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-green-600 focus:outline-none"
                                />
                            </div>

                            <div>
                                <label className="block text-gray-400 text-sm mb-2">Duração (dias)</label>
                                <input
                                    type="number"
                                    value={editingPlan.days}
                                    onChange={(e) => setEditingPlan({ ...editingPlan, days: parseInt(e.target.value) || 0 })}
                                    className="w-full bg-whatsapp-dark text-white px-4 py-2 rounded-lg border border-gray-700 focus:border-green-600 focus:outline-none"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleSavePlan}
                                className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                            >
                                <span className="material-icons text-sm">save</span>
                                Salvar
                            </button>
                            <button
                                onClick={handleCancelEdit}
                                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
