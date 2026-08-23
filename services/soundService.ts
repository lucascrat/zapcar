// Sounds Service
// Sons mais altos e distintos para simular apps de transporte (99/Uber)

// Alarme de chamada / nova corrida (Personalizado) - SÓ para chamadas reais,
// nunca reutilizar em mensagens de chat: motorista confundia "chegou
// mensagem" com "chegou corrida" porque os dois tocavam o mesmo arquivo.
const CALL_SOUND_URL = '/ubb.mp3';

// Som de toque específico para o painel de Admin (Telefone Clássico)
const ADMIN_CALL_URL = '/ubb.mp3';

// The global `pushalert` variable is now declared on the Window interface in `types.ts`

class SoundService {
  private callAudio: HTMLAudioElement;
  private adminCallAudio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private hasNotificationPermission: boolean = false;
  private activeNotification: Notification | null = null;

  constructor() {
    this.callAudio = new Audio(CALL_SOUND_URL);
    this.adminCallAudio = new Audio(ADMIN_CALL_URL);

    this.callAudio.loop = true;
    this.callAudio.volume = 1.0;

    this.adminCallAudio.loop = true;
    this.adminCallAudio.volume = 0.8;

    this.callAudio.load();
    this.adminCallAudio.load();

    // Verifica permissão nativa no início (com verificação segura para Capacitor/Mobile)
    try {
      if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined') {
        this.hasNotificationPermission = Notification.permission === "granted";
      }
    } catch (e) {
      console.warn("Notification API not available (Capacitor/Mobile environment)");
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
    // 2. Fallback para a API nativa do navegador (com verificação segura para Capacitor/Mobile)
    else {
      console.warn("PushAlert não carregado, tentando API de Notificação nativa.");
      try {
        if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined') {
          if (Notification.permission !== "granted") {
            try {
              const permission = await Notification.requestPermission();
              this.hasNotificationPermission = permission === "granted";
            } catch (e) {
              console.error("Erro ao solicitar permissão nativa:", e);
            }
          } else {
            this.hasNotificationPermission = Notification.permission === "granted";
          }
        } else {
          console.warn("Notification API not available (Capacitor/Mobile environment)");
        }
      } catch (e) {
        console.warn("Notification API not accessible:", e);
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
    // 3. FALLBACK: API de Notificação Padrão do Navegador (com verificação segura para Capacitor/Mobile)
    else if (this.hasNotificationPermission) {
      try {
        if (typeof window !== 'undefined' && 'Notification' in window && typeof Notification !== 'undefined') {
          console.warn("Fallback: Enviando notificação via API nativa do navegador.");
          const notification = new Notification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/3097/3097180.png',
            vibrate: isCall ? [2000, 500, 2000] : [200, 100, 200],
            tag: isCall ? 'incoming-call' : 'new-message',
            renotify: true,
            requireInteraction: isCall
          } as any);

          notification.onclick = () => window.focus();
        }
      } catch (e) {
        console.warn("Notification API not available or blocked:", e);
      }
    }

    // Vibração via navegador (funciona em conjunto com a notificação)
    if (navigator.vibrate) {
      try {
        navigator.vibrate(isCall ? [2000, 500, 2000, 500, 2000] : [200, 100, 200]);
      } catch (e) { }
    }
  }

  // ── Sons de MENSAGEM (chat) ──────────────────────────────────────────────
  // Sintetizados via Web Audio API (sem arquivo) de propósito: precisam soar
  // claramente diferentes do alarme de chamada/corrida (ubb.mp3), que é um
  // som insistente de "atenda agora". Mensagem é só um blip curto e educado.

  private getAudioContext(): AudioContext | null {
    try {
      if (!this.audioCtx) {
        const Ctx = window.AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return null;
        this.audioCtx = new Ctx();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch (e) {
      console.warn("[SoundService] Web Audio API indisponível:", e);
      return null;
    }
  }

  private playChime(notes: { freq: number; start: number; duration: number }[], volume = 0.18) {
    const ctx = this.getAudioContext();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      notes.forEach(({ freq, start, duration }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t0 = now + start;
        const t1 = t0 + duration;
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(volume, t0 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t1);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t0);
        osc.stop(t1 + 0.02);
      });
    } catch (e) {
      console.log("[SoundService] Falha ao tocar chime:", e);
    }
  }

  // Blip curto e ascendente - mensagem ENVIADA (chat de suporte, etc.)
  playSent() {
    this.playChime([
      { freq: 720, start: 0, duration: 0.09 },
      { freq: 980, start: 0.07, duration: 0.09 },
    ], 0.15);
  }

  // "Ding" de dois tons - mensagem RECEBIDA
  playReceived() {
    this.playChime([
      { freq: 1046, start: 0, duration: 0.12 },
      { freq: 784, start: 0.1, duration: 0.16 },
    ], 0.2);
  }

  playMessageAlert() {
    if (window.Android && window.Android.triggerNativeMessageSound) {
      window.Android.triggerNativeMessageSound();
      return;
    }
    this.playReceived();
    if (navigator.vibrate) {
      // Padrão curto e único - bem diferente da vibração de chamada,
      // que é longa e repetida (ver playRingtone).
      navigator.vibrate([120, 60, 120]);
    }
  }

  playRingtone() {
    console.log("[SoundService] playRingtone chamado");

    // Sempre tocar o áudio web (backup)
    this.callAudio.currentTime = 0;
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringtone blocked:", e));

    // Vibração via navegador (funciona em PWA e web)
    if (navigator.vibrate) {
      console.log("[SoundService] Vibrando via navigator.vibrate");
      navigator.vibrate([1000, 300, 1000, 300, 1000, 300, 1000]);
    }

    // Android nativo: trazer para frente e disparar alerta
    if (window.Android) {
      if (window.Android.triggerNativeAlert) {
        console.log("[SoundService] Chamando triggerNativeAlert");
        window.Android.triggerNativeAlert();
      }
      if (window.Android.bringToFront) {
        console.log("[SoundService] Chamando bringToFront");
        window.Android.bringToFront();
      }
    }

    // Notificação do sistema
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

  // Som de "Chamando..." (Para quem liga)
  playRingback() {
    console.log("Playing Ringback");
    this.callAudio.currentTime = 0;
    this.callAudio.loop = true;
    this.callAudio.play().catch(e => console.log("Ringback blocked:", e));
  }
}

export const soundService = new SoundService();
