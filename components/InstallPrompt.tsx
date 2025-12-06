
import React, { useState, useEffect } from 'react';

export const InstallPrompt: React.FC = () => {
  const [showPrompt, setShowPrompt] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    // 1. Verifica se já está rodando como app (Standalone)
    const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true;

    if (isInStandaloneMode) {
      setIsStandalone(true);
      return;
    }

    // 2. Detecta se é iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const ios = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(ios);

    if (ios) {
      // No iOS, mostramos o prompt após um delay se não estiver instalado
      const hasSeenPrompt = sessionStorage.getItem('installPromptSeen');
      if (!hasSeenPrompt) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    } else {
      // 3. Android / Desktop (Chrome/Edge)
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);

        const hasSeenPrompt = sessionStorage.getItem('installPromptSeen');
        if (!hasSeenPrompt) {
          // Delay para não atrapalhar o login imediato
          setTimeout(() => setShowPrompt(true), 2000);
        }
      };

      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

      return () => {
        window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      };
    }
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setShowPrompt(false);
      }
      setDeferredPrompt(null);
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowPrompt(false);
      setIsClosing(false);
      sessionStorage.setItem('installPromptSeen', 'true');
    }, 400); // Tempo da animação de saída
  };

  if (!showPrompt || isStandalone) return null;

  return (
    <div className={`fixed inset-0 z-[9999] flex items-end md:items-center justify-center pointer-events-none transition-opacity duration-300 ${isClosing ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop (Dark overlay) */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto" onClick={handleClose}></div>

      {/* Content Card - Bottom Sheet on Mobile, Center Modal on Desktop */}
      <div
        className={`
          bg-white w-full md:w-[450px] 
          md:rounded-2xl rounded-t-2xl shadow-2xl 
          relative pointer-events-auto overflow-hidden flex flex-col 
          transition-transform duration-300 transform 
          ${isClosing ? 'translate-y-full md:scale-95' : 'translate-y-0 md:scale-100'} 
          animate-slide-up-mobile md:animate-fade-in
        `}
      >

        {/* Drag Handle for Mobile */}
        <div className="w-full flex justify-center pt-3 pb-1 md:hidden" onClick={handleClose}>
          <div className="w-12 h-1.5 bg-gray-300 rounded-full"></div>
        </div>

        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 p-2 rounded-full hover:bg-gray-100 transition hidden md:block"
        >
          <span className="material-icons">close</span>
        </button>

        <div className="p-6 pt-2 md:pt-6 flex flex-col items-center text-center">
          <div className="bg-whatsapp-green/10 p-4 rounded-full mb-4 ring-4 ring-whatsapp-green/5">
            <img
              src="/logo.png"
              alt="App Icon"
              className="w-12 h-12 object-contain"
            />
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-2">Instalar Aplicativo</h3>
          <p className="text-gray-500 text-sm mb-6 px-4 leading-relaxed">
            Para a melhor experiência com notificações e localização precisa, instale o <b>ChegoJá</b> na sua tela inicial.
          </p>

          {isIOS ? (
            <div className="bg-gray-50 p-4 rounded-xl w-full text-left space-y-4 border border-gray-100">
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span className="min-w-[32px] h-8 flex items-center justify-center bg-white border border-gray-200 rounded shadow-sm">
                  <span className="material-icons text-blue-500 text-lg">ios_share</span>
                </span>
                <span>1. Toque no botão <b>Compartilhar</b>.</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-700">
                <span className="min-w-[32px] h-8 flex items-center justify-center bg-white border border-gray-200 rounded shadow-sm">
                  <span className="material-icons text-gray-800 text-lg">add_box</span>
                </span>
                <span>2. Selecione <b>Adicionar à Tela de Início</b>.</span>
              </div>
              <button
                onClick={handleClose}
                className="w-full py-3 mt-2 text-blue-600 font-bold text-sm bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                Entendi
              </button>
            </div>
          ) : (
            <div className="w-full space-y-3">
              <button
                onClick={handleInstallClick}
                className="w-full bg-whatsapp-green hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-lg transition flex items-center justify-center gap-2 active:scale-95 touch-manipulation"
              >
                <span className="material-icons">download</span>
                Instalar Agora
              </button>
              <button
                onClick={handleClose}
                className="w-full text-gray-400 font-medium text-sm py-2 hover:text-gray-600"
              >
                Agora não
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
