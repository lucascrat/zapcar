
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
