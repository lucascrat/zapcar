// Sounds Service
// Sons mais altos e distintos para simular apps de transporte (99/Uber)

// Alarme de chamada (Personalizado)
const CALL_SOUND_URL = '/ubb.mp3'; 

// Som de toque específico para o painel de Admin (Telefone Clássico)
const ADMIN_CALL_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-phone-old-ring-933.mp3';

// FIX: Updated to a louder, clearer chime for better perceptibility, especially for drivers.
// Notificação recebida (Som de alerta mais alto e claro)
const RECEIVED_URL = 'https://assets.mixkit.co/sfx/preview/mixkit-alert-quick-chime-766.mp3';

// Som de envio (Swoosh)
const SENT_URL = 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3';

class SoundService {
  private sentAudio: HTMLAudioElement;
  private receivedAudio: HTMLAudioElement;
  private callAudio: HTMLAudioElement;
  private adminCallAudio: HTMLAudioElement; // Novo áudio para admin
  private hasNotificationPermission: boolean = false;
  private activeNotification: Notification | null = null;

  constructor() {
    this.sentAudio = new Audio(SENT_URL);
    this.receivedAudio = new Audio(RECEIVED_URL);
    this.callAudio = new Audio(CALL_SOUND_URL);
    this.adminCallAudio = new Audio(ADMIN_CALL_URL); // Inicializa novo áudio
    
    // Configura volume máximo para chamadas
    this.callAudio.loop = true;
    this.callAudio.volume = 1.0; 
    
    // Configura som de admin
    this.adminCallAudio.loop = true;
    this.adminCallAudio.volume = 0.8; // Um pouco mais baixo para não atrapalhar
    
    // Configura volume para mensagens
    this.receivedAudio.volume = 1.0;

    // Preload
    this.sentAudio.load();
    this.receivedAudio.load();
    this.callAudio.load();
    this.adminCallAudio.load();
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
    // Isso cumpre o requisito: "abrir se receber mensagens"
    if (window.Android && window.Android.showToast) {
       window.Android.showToast(`${title}: ${body}`);
       
       // SE TIVER A FUNÇÃO BRING TO FRONT, CHAMA ELA PARA MENSAGENS E CHAMADAS
       if (window.Android.bringToFront) {
           console.log("Chamando Android.bringToFront()...");
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
    this.receivedAudio.currentTime = 0;
    this.receivedAudio.play().catch(e => console.log("Audio blocked:", e));
  }

  // NOVO MÉTODO: Toca um alerta mais alto para mensagens de texto de motoristas
  playMessageAlert() {
    // COMMENT: This function prioritizes the native Android bridge for sounds.
    // The native code (AndroidSetup.tsx) uses the ALARM audio channel,
    // ensuring the sound is loud and bypasses the device's notification volume settings.
    // This is the most reliable way to alert a driver.
    if (window.Android && window.Android.triggerNativeMessageSound) {
        window.Android.triggerNativeMessageSound();
        return; 
    }
    
    // COMMENT: The web audio API is used as a fallback if the native bridge is not available.
    // The sound file has been updated to be a louder, clearer chime.
    this.receivedAudio.currentTime = 0;
    this.receivedAudio.play().catch(e => console.log("Audio blocked:", e));
    if (navigator.vibrate) {
        navigator.vibrate([200, 100, 200, 100, 200]); // Padrão mais longo
    }
  }

  playRingtone() {
    // COMMENT: Similar to message alerts, the ringtone prioritizes the native Android bridge.
    // This allows the ringtone to play indefinitely at maximum volume via the ALARM channel,
    // and forces the app to the foreground, which is crucial for incoming calls.
    if (window.Android && window.Android.triggerNativeAlert) {
        window.Android.triggerNativeAlert();
        if (window.Android.bringToFront) {
            window.Android.bringToFront(); // Abre o app na cara do motorista
        }
        return; // Não toca o som web duplicado
    }

    // 2. WEB STANDARD (Navegador)
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

  // Novos métodos para a simulação de chamada do Admin
  playAdminCallSound() {
    this.adminCallAudio.currentTime = 0;
    this.adminCallAudio.play().catch(e => console.log("Admin sound blocked", e));
  }

  stopAdminCallSound() {
    this.adminCallAudio.pause();
    this.adminCallAudio.currentTime = 0;
  }
}

export const soundService = new SoundService();