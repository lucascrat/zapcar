// Sounds Service
// Sons mais altos e distintos para simular apps de transporte (99/Uber)

// Alarme de chamada (Personalizado)
const CALL_SOUND_URL = '/ubb.mp3';

// Som de toque específico para o painel de Admin (Telefone Clássico)
const ADMIN_CALL_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-phone-old-ring-933.mp3';

// Notificação recebida (Som de alerta mais alto e claro)
const RECEIVED_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3';

// Som de envio (Swoosh)
const SENT_URL = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';

// The global `pushalert` variable is now declared on the Window interface in `types.ts`

class SoundService {
  private sentAudio: HTMLAudioElement;
  private receivedAudio: HTMLAudioElement;
  private callAudio: HTMLAudioElement;
  private adminCallAudio: HTMLAudioElement;
  private hasNotificationPermission: boolean = false;
  private activeNotification: Notification | null = null;

  constructor() {
    this.sentAudio = new Audio(SENT_URL);
    this.receivedAudio = new Audio(RECEIVED_URL);
    this.callAudio = new Audio(CALL_SOUND_URL);
    this.adminCallAudio = new Audio(ADMIN_CALL_URL);

    this.callAudio.loop = true;
    this.callAudio.volume = 1.0;

    this.adminCallAudio.loop = true;
    this.adminCallAudio.volume = 0.8;

    this.receivedAudio.volume = 1.0;

    this.sentAudio.load();
    this.receivedAudio.load();
    this.callAudio.load();
    this.adminCallAudio.load();

    // Verifica permissão nativa no início
    if ("Notification" in window) {
      this.hasNotificationPermission = Notification.permission === "granted";
    }
  }

  async requestPermission() {
    // 1. Tenta usar o prompt do PushAlert, que é mais completo
    // FIX: Use window.pushalert consistently to avoid type errors and ambiguity. This relies on the global type definition in types.ts.
    if (typeof window.pushalert !== 'undefined' && window.pushalert.isInitialized && window.pushalert.isInitialized()) {
      console.log("Usando PushAlert para solicitar permissão.");
      (window.pushalert = window.pushalert || []).push(['prompt']);
      // Assumimos que o usuário vai aceitar. A biblioteca gerencia o estado.
      this.hasNotificationPermission = true;
    }
    // 2. Fallback para a API nativa do navegador
    else {
      console.warn("PushAlert não carregado, usando API de Notificação nativa.");
      if ("Notification" in window && Notification.permission !== "granted") {
        try {
          const permission = await Notification.requestPermission();
          this.hasNotificationPermission = permission === "granted";
        } catch (e) {
          console.error("Erro ao solicitar permissão nativa:", e);
        }
      } else {
        this.hasNotificationPermission = Notification.permission === "granted";
      }
    }
  }

  sendNotification(title: string, body: string, isCall: boolean = false) {
    // 1. PRIORIDADE MÁXIMA: Ponte Nativa Android
    if (window.Android && window.Android.bringToFront) {
      console.log("Disparando notificação e abrindo app via Android Bridge.");
      window.Android.showToast(`${title}: ${body}`);
      window.Android.bringToFront();
    }
    // 2. SEGUNDA OPÇÃO: PushAlert (Robusto para PWA)
    // FIX: Use window.pushalert consistently to avoid type errors and ambiguity. This relies on the global type definition in types.ts.
    else if (typeof window.pushalert !== 'undefined' && window.pushalert.isInitialized && window.pushalert.isInitialized()) {
      console.log("Enviando notificação via PushAlert.");
      try {
        (window.pushalert = window.pushalert || []).push([
          'send',
          {
            title: title,
            message: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
            requireInteraction: isCall, // Exige interação se for chamada
          }
        ]);
      } catch (e) {
        console.error("Falha ao enviar via PushAlert:", e);
      }
    }
    // 3. FALLBACK: API de Notificação Padrão do Navegador
    else if (this.hasNotificationPermission) {
      console.warn("Fallback: Enviando notificação via API nativa do navegador.");
      try {
        const notification = new Notification(title, {
          body: body,
          icon: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
          vibrate: isCall ? [2000, 500, 2000] : [200, 100, 200],
          tag: isCall ? 'incoming-call' : 'new-message',
          renotify: true,
          requireInteraction: isCall
        } as any);

        notification.onclick = () => window.focus();
      } catch (e) {
        console.error("Falha ao enviar notificação nativa:", e);
      }
    }

    // Vibração via navegador (funciona em conjunto com a notificação)
    if (navigator.vibrate) {
      try {
        navigator.vibrate(isCall ? [2000, 500, 2000, 500, 2000] : [200, 100, 200]);
      } catch (e) { }
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

  playMessageAlert() {
    if (window.Android && window.Android.triggerNativeMessageSound) {
      window.Android.triggerNativeMessageSound();
      return;
    }
    this.receivedAudio.currentTime = 0;
    this.receivedAudio.play().catch(e => console.log("Audio blocked:", e));
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  }

  playRingtone() {
    if (window.Android && window.Android.triggerNativeAlert) {
      window.Android.triggerNativeAlert();
      if (window.Android.bringToFront) {
        window.Android.bringToFront();
      }
      return;
    }

    this.callAudio.currentTime = 0;
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringtone blocked:", e));

    this.sendNotification("📞 NOVA CORRIDA / CHAMADA", "Toque aqui para ATENDER AGORA!", true);
  }

  stopRingtone() {
    if (window.Android && window.Android.stopNativeAlert) {
      window.Android.stopNativeAlert();
    }
    this.callAudio.pause();
    this.callAudio.currentTime = 0;
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  }

  playAdminCallSound() {
    this.adminCallAudio.currentTime = 0;
    this.adminCallAudio.play().catch(e => console.log("Admin sound blocked", e));
  }

  stopAdminCallSound() {
    this.adminCallAudio.pause();
    this.adminCallAudio.currentTime = 0;
  }

  playPipExitSound() {
    console.log("Playing PiP Exit Sound (ubb.mp3)");
    this.callAudio.currentTime = 0;
    this.callAudio.loop = false;
    this.callAudio.play().catch(e => console.log("Audio blocked:", e));
    if (navigator.vibrate) {
      navigator.vibrate([500, 200, 500]);
    }
  }
}

export const soundService = new SoundService();
