

// Simple Sound Service using Base64 to avoid external dependencies and ensure offline capability

// Short "Pop" sound for outgoing messages
const SENT_SOUND = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// Soft "Ping" for incoming messages
const RECEIVED_SOUND = 'data:audio/mp3;base64,//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//NExAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// Digital Phone Ring (short loop)
const CALL_SOUND = 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3'; // Using CDN for longer audio to keep file size small, fallback handled below.
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
    this.callAudio.loop = true;

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

    const permission = await Notification.requestPermission();
    this.hasNotificationPermission = permission === "granted";
  }

  // Envia notificação que aparece sobre outros apps
  sendNotification(title: string, body: string, icon?: string) {
    if (this.hasNotificationPermission && document.hidden) {
      try {
        // Tentar vibrar dispositivo se suportado (Mobile)
        if (navigator.vibrate) {
            navigator.vibrate([200, 100, 200]);
        }

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
    this.callAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  stopRingtone() {
    this.callAudio.pause();
    this.callAudio.currentTime = 0;
  }
}

export const soundService = new SoundService();