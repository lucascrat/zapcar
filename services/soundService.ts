

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

  // Envia notificação que aparece sobre outros apps
  sendNotification(title: string, body: string, icon?: string) {
    if (document.hidden) {
       // Tentar vibrar dispositivo se suportado (Mobile) mesmo sem notificação visual garantida
       if (navigator.vibrate) {
           try {
             navigator.vibrate([200, 100, 200]);
           } catch(e) {
             console.log("Vibration blocked or not supported");
           }
       }
    }

    if (this.hasNotificationPermission && document.hidden) {
      try {
        const notification = new Notification(title, {
          body: body,
          icon: icon || 'https://cdn-icons-png.flaticon.com/512/733/733585.png',
          vibrate: [200, 100, 200],
          tag: 'urban-trans-msg' // Substitui notificações antigas para não acumular
        } as any);

        notification.onclick = function() {
          window.focus();
          notification.close();
        };
      } catch (e) {
        console.error("Erro ao enviar notificação:", e);
      }
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
    // Garante que o loop está ativado toda vez que toca
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringtone blocked (user interaction needed):", e));
    
    if (navigator.vibrate) {
        // Continuous vibration pattern for ringing
        navigator.vibrate([1000, 500, 1000, 500, 1000, 500]);
    }
  }

  stopRingtone() {
    this.callAudio.pause();
    this.callAudio.currentTime = 0;
    if (navigator.vibrate) {
        navigator.vibrate(0); // Stop vibration
    }
  }
}

export const soundService = new SoundService();