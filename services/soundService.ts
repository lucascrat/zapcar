
// Sounds Service
// Sons mais altos e distintos para simular apps de transporte (99/Uber)

// Alarme de chamada (Siren style)
const CALL_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2859/2859-preview.mp3'; 

// Notificação recebida (Clear distinct ping)
const RECEIVED_URL = 'https://assets.mixkit.co/active_storage/sfx/1862/1862-preview.mp3';

// Som de envio (Swoosh)
const SENT_URL = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';

class SoundService {
  private sentAudio: HTMLAudioElement;
  private receivedAudio: HTMLAudioElement;
  private callAudio: HTMLAudioElement;
  private hasNotificationPermission: boolean = false;
  private activeNotification: Notification | null = null;

  constructor() {
    this.sentAudio = new Audio(SENT_URL);
    this.receivedAudio = new Audio(RECEIVED_URL);
    this.callAudio = new Audio(CALL_SOUND_URL);
    
    // Configura volume máximo para chamadas
    this.callAudio.loop = true;
    this.callAudio.volume = 1.0; 
    
    // Configura volume para mensagens
    this.receivedAudio.volume = 1.0;

    // Preload
    this.sentAudio.load();
    this.receivedAudio.load();
    this.callAudio.load();
  }

  // Solicita permissão para notificações do sistema (Pop-up/Banner)
  async requestPermission() {
    if (!("Notification" in window)) {
      console.warn("Este navegador não suporta notificações de desktop");
      return;
    }

    if (Notification.permission === "granted") {
      this.hasNotificationPermission = true;
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      this.hasNotificationPermission = permission === "granted";
    } catch (e) {
      console.error("Erro solicitando permissão notificação:", e);
    }
  }

  // Envia notificação que aparece sobre outros apps e toca som do sistema
  sendNotification(title: string, body: string, isCall: boolean = false) {
    // 1. TENTA NATIVO ANDROID (Se estiver dentro do APK Wrapper)
    if (window.Android && window.Android.showToast) {
       window.Android.showToast(`${title}: ${body}`);
       if (isCall && window.Android.bringToFront) {
           window.Android.bringToFront(); // Força o app a abrir na frente de tudo
       }
    }

    // 2. WEB STANDARD
    if (this.hasNotificationPermission) {
      try {
        if (this.activeNotification) {
          this.activeNotification.close();
        }

        // CONFIGURAÇÃO PARA "FURAR" O MODO SILENCIOSO E APARECER NA TELA
        const notification = new Notification(title, {
          body: body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
          
          // Vibração Agressiva: Longa para chamadas, curta para mensagens
          vibrate: isCall ? [2000, 500, 2000, 500, 2000] : [200, 100, 200],
          
          tag: isCall ? 'incoming-call' : 'new-message', 
          
          // CRÍTICO: Faz o celular vibrar/tocar de novo mesmo se já tiver notificação
          renotify: true, 
          
          // CRÍTICO: Notificação não some sozinha (User precisa clicar ou dispensar)
          requireInteraction: true 
        } as any);

        notification.onclick = function() {
          window.focus(); // Força o app a abrir (Browser)
          if (window.Android && window.Android.bringToFront) {
             window.Android.bringToFront(); // Força o app a abrir (Nativo)
          }
          notification.close();
        };

        this.activeNotification = notification;

        // Se for mensagem, toca o som também (para garantir em mobile)
        if (!isCall) {
           this.receivedAudio.play().catch(() => {});
        }

      } catch (e) {
        console.error("Erro ao enviar notificação de sistema:", e);
      }
    }
    
    // Fallback de vibração via navegador
    if (navigator.vibrate) {
        try {
            navigator.vibrate(isCall ? [2000, 1000, 2000, 1000, 2000] : [200, 100, 200]);
        } catch(e) { }
    }
  }

  playSent() {
    this.sentAudio.currentTime = 0;
    this.sentAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  playReceived() {
    // Tenta tocar som nativo do Android se disponível
    if (window.Android && window.Android.triggerNativeAlert) {
        // Para mensagens curtas, talvez não queira o alarme longo, mas por segurança vamos usar
        // O ideal seria ter triggerNativeNotificationSound
    }
    
    this.receivedAudio.currentTime = 0;
    this.receivedAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  playRingtone() {
    // 1. TENTA NATIVO (Muito mais confiável para acordar o motorista)
    if (window.Android && window.Android.triggerNativeAlert) {
        window.Android.triggerNativeAlert();
        window.Android.bringToFront(); // Abre o app na cara do motorista
        return; // Não toca o som web duplicado
    }

    // 2. WEB STANDARD
    this.callAudio.currentTime = 0;
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringtone blocked (user interaction needed):", e));
    
    // NOTIFICAÇÃO DE CHAMADA (SIMULA O SOBREPOR APPS)
    this.sendNotification("📞 NOVA CORRIDA / CHAMADA", "Toque aqui para ATENDER AGORA!", true);
  }

  stopRingtone() {
    // 1. PARA NATIVO
    if (window.Android && window.Android.stopNativeAlert) {
        window.Android.stopNativeAlert();
    }

    // 2. PARA WEB
    this.callAudio.pause();
    this.callAudio.currentTime = 0;
    if (this.activeNotification) {
        this.activeNotification.close();
        this.activeNotification = null;
    }
    if (navigator.vibrate) {
        navigator.vibrate(0); // Stop vibration
    }
  }
}

export const soundService = new SoundService();
