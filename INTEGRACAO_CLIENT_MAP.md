# Integração do ClientMapModal - Cliente Ver Motorista

## Componente Criado
✅ `components/ClientMapModal.tsx` - Modal para cliente visualizar localização do motorista em tempo real

## Funcionalidades
- 🗺️ Mapa interativo do Google Maps
- 🏍️ Ícone personalizado (moto ou carro) baseado em `vehicle_type`
- 📍 Atualização em tempo real via Supabase Realtime
- ℹ️ Informações do motorista (nome, veículo)
- 🧭 Botão "Abrir" para navegar no Google Maps externo
- 🌙 Tema escuro consistente

## Passos para Integração no ChatWindow.tsx

### 1. Adicionar Import (linha ~8)
```tsx
import { ClientMapModal } from './ClientMapModal';
```

### 2. Adicionar State (linha ~24, após outros states)
```tsx
const [showClientMapModal, setShowClientMapModal] = useState(false);
```

### 3. Adicionar Botão no Header (para CLIENTES apenas)
Encontre a seção do header mobile (por volta da linha 550-600) e adicione:

```tsx
{currentUser.role === UserRole.CLIENT && chatPartner && (
  <button
    onClick={() => setShowClientMapModal(true)}
    className="p-2 hover:bg-whatsapp-hover rounded-full transition"
    title="Ver Localização do Motorista"
  >
    <span className="material-icons text-xl">location_on</span>
  </button>
)}
```

### 4. Renderizar Modal (antes do fechamento do componente, linha ~830)
```tsx
{/* Client Map Modal - Ver Motorista */}
{showClientMapModal && chatPartner && (
  <ClientMapModal
    driver={chatPartner}
    onClose={() => setShowClientMapModal(false)}
  />
)}
```

## Resultado
Quando um CLIENTE clicar no botão de localização no header:
1. Abre um modal em tela cheia
2. Mostra o mapa com a localização do motorista
3. Ícone animado (🏍️ ou 🚗) atualiza em tempo real
4. Pode abrir no Google Maps para navegação

## Observações
- ✅ API do Google Maps já configurada (documento obsoleto — app migrado para Mapbox, chave removida)
- ✅ Componente já criado e pronto para uso
- ✅ Suporte a Realtime já implementado
- ⚠️ Certifique-se de que motoristas tenham `lat` e `lng` no perfil
