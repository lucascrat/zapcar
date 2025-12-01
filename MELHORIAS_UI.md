# Melhorias de UI - Gaveta de Anexos e Áudios

## Objetivo
Restaurar a gaveta de anexos (drawer) e melhorar o design das mensagens de áudio usando o componente `AudioMessage`.

## Mudanças Necessárias no ChatWindow.tsx

### 1. Adicionar Import do AudioMessage (linha ~4)
```tsx
import { AudioRecorder } from './AudioRecorder';
import { AudioMessage } from './AudioMessage';
```

### 2. Adicionar State para Gaveta (linha ~24)
```tsx
const [isGettingLocation, setIsGettingLocation] = useState(false);
const [showAttachments, setShowAttachments] = useState(false); // ADICIONAR ESTA LINHA
```

### 3. Substituir Renderização de Áudio (por volta da linha 710-720)
**ANTES:**
```tsx
{msg.media_type === 'audio' && msg.media_url && (
   <div className="flex items-center gap-2 min-w-[200px] py-2 px-1">
      <div className="w-9 h-9 rounded-full bg-gray-500 flex items-center justify-center shrink-0">
         <span className="material-icons text-white text-lg">play_arrow</span>
      </div>
      <audio controls src={msg.media_url} className="w-full h-8" />
   </div>
)}
```

**DEPOIS:**
```tsx
{msg.media_type === 'audio' && msg.media_url && (
   <AudioMessage src={msg.media_url} />
)}
```

### 4. Adicionar Gaveta de Anexos (por volta da linha 760, ANTES dos botões de emoji)
```tsx
{/* Attachment Drawer */}
{showAttachments && (
  <div className="absolute bottom-16 left-2 bg-[#2a3942] rounded-2xl shadow-2xl p-3 flex flex-col gap-2 animate-fade-in z-20">
    <button
      onClick={() => {
        fileInputRef.current?.click();
        setShowAttachments(false);
      }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 rounded-lg transition"
    >
      <span className="material-icons text-blue-400">image</span>
      <span className="text-white text-sm">Foto</span>
    </button>
    <button
      onClick={() => {
        handleSendLocation();
        setShowAttachments(false);
      }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-700/50 rounded-lg transition"
    >
      <span className="material-icons text-green-400">location_on</span>
      <span className="text-white text-sm">Localização</span>
    </button>
  </div>
)}
```

### 5. Modificar Botão de Anexo (por volta da linha 770)
**ANTES:**
```tsx
<button 
  onClick={() => fileInputRef.current?.click()}
  className="p-2 text-gray-400 hover:bg-gray-700 rounded-full transition active:scale-90"
  disabled={isUploading}
  title="Enviar Foto"
>
  <span className="material-icons transform rotate-45">attach_file</span>
</button>
```

**DEPOIS:**
```tsx
<button 
  onClick={() => setShowAttachments(!showAttachments)}
  className="p-2 text-gray-400 hover:bg-gray-700 rounded-full transition active:scale-90"
  disabled={isUploading}
  title="Anexos"
>
  <span className="material-icons transform rotate-45">attach_file</span>
</button>
```

### 6. REMOVER Botão de Localização Individual (por volta da linha 785-795)
**REMOVER ESTE BLOCO:**
```tsx
{/* Location Button */}
<button 
  onClick={handleSendLocation}
  className={`p-2 text-gray-400 hover:bg-gray-700 rounded-full transition active:scale-90 ${isGettingLocation ? 'text-green-500 animate-pulse' : ''}`}
  disabled={isUploading || isGettingLocation}
  title="Enviar Localização Atual"
>
  <span className="material-icons">location_on</span>
</button>
```

## Resultado
- ✅ Áudios com player bonito e funcional (barra de progresso, tempo, botão play/pause)
- ✅ Gaveta de anexos organizada (Foto e Localização)
- ✅ Interface mais limpa e profissional
- ✅ Melhor UX (User Experience)

## Observações
- O componente `AudioMessage` já existe e está pronto
- A gaveta fecha automaticamente após selecionar uma opção
- O design segue o padrão WhatsApp
