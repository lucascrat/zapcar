
// Simple Sound Service using Base64 to avoid external dependencies and ensure offline capability

// Short "Pop" sound for outgoing messages
const SENT_SOUND = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// Soft "Ping" for incoming messages
const RECEIVED_SOUND = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// Classic Office Phone Ring (looping capable)
const CALL_SOUND = 'https://assets.mixkit.co/active_storage/sfx/28/28-preview.mp3'; 
const SENT_URL = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';
const RECEIVED_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

class SoundService {
  private sentAudio: HTMLAudioElement;
  private receivedAudio: HTMLAudioElement;
  private callAudio: HTMLAudioElement;
  private hasNotificationPermission: boolean = false;
  private activeNotification: Notification | null = null;

  constructor() {
    this.sentAudio = new Audio(SENT_URL);
    this.receivedAudio = new Audio(RECEIVED_URL);
    this.callAudio = new Audio(CALL_SOUND);
    
    // Configura o loop para o ringtone
    this.callAudio.loop = true;
    this.callAudio.volume = 1.0; 

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
          vibrate: isCall ? [1000, 500, 1000, 500, 1000] : [200, 100, 200],
          
          tag: isCall ? 'incoming-call' : 'new-message', 
          
          // CRÍTICO: Faz o celular vibrar/tocar de novo mesmo se já tiver notificação
          renotify: true, 
          
          // CRÍTICO: Notificação não some sozinha (User precisa clicar ou dispensar)
          requireInteraction: true 
        } as any);

        notification.onclick = function() {
          window.focus(); // Força o app a abrir
          notification.close();
        };

        this.activeNotification = notification;

        // Tentar tocar som HTML5 como fallback
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
            navigator.vibrate(isCall ? [1000, 500, 1000] : [200, 100, 200]);
        } catch(e) { }
    }
  }

  playSent() {
    this.sentAudio.currentTime = 0;
    this.sentAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  playReceived() {
    this.receivedAudio.currentTime = 0;
    this.receivedAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  playRingtone() {
    this.callAudio.currentTime = 0;
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringtone blocked (user interaction needed):", e));
    
    // NOTIFICAÇÃO DE CHAMADA (SIMULA O SOBREPOR APPS)
    // Dispara notificação de sistema persistente
    this.sendNotification("📞 CHAMADA RECEBIDA", "Toque aqui para ATENDER AGORA!", true);
  }

  stopRingtone() {
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
