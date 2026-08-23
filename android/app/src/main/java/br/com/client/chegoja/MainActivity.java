package br.com.client.chegoja;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.WindowManager;
import android.app.PictureInPictureParams;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // Extras pendentes de uma notificação (corrida/chat) que abriu o app - só
    // conseguimos rodar o JS depois que o WebView terminar de carregar, então
    // guardamos aqui e disparamos com um pequeno atraso em onStart().
    private Intent pendingNotificationIntent;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleNotificationIntent(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNotificationIntent(intent);
    }

    private void handleNotificationIntent(Intent intent) {
        if (intent == null) return;
        String type = intent.getStringExtra("type");
        if (type == null) return;

        if ("new_ride".equals(type)) {
            // Igual uma chamada chegando: mostra por cima da tela de bloqueio e
            // acorda a tela, mesmo se o app estava totalmente fechado.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                setShowWhenLocked(true);
                setTurnScreenOn(true);
                KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
                if (km != null) km.requestDismissKeyguard(this, null);
            } else {
                getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                );
            }
        }

        pendingNotificationIntent = intent;
        dispatchPendingNotificationEvent();
    }

    // Dispara o evento JS correspondente (openRide/openChat) assim que o
    // WebView estiver pronto. Com o app totalmente fechado (force-stop / morto
    // pelo sistema), o boot frio + restauração de sessão + montagem do React
    // pode demorar mais que um único atraso curto, então tenta em algumas
    // janelas de tempo até conseguir (disparar o evento 2x é inofensivo: os
    // handlers de openRide/openChat só re-buscam dados e reabrem a mesma tela).
    private static final long[] DISPATCH_RETRY_DELAYS_MS = {1200, 2800, 4500};

    private void dispatchPendingNotificationEvent() {
        for (long delay : DISPATCH_RETRY_DELAYS_MS) {
            new Handler(Looper.getMainLooper()).postDelayed(() -> tryDispatchNotificationEvent(), delay);
        }
    }

    private void tryDispatchNotificationEvent() {
        if (pendingNotificationIntent == null || this.bridge == null || this.bridge.getWebView() == null) return;
        String type = pendingNotificationIntent.getStringExtra("type");
        String js = null;
        if ("new_ride".equals(type)) {
            String rideId = pendingNotificationIntent.getStringExtra("ride_id");
            if (rideId != null) {
                js = "window.dispatchEvent(new CustomEvent('openRide', { detail: { rideId: '" + escapeJs(rideId) + "' } }))";
            }
        } else if ("chat_message".equals(type)) {
            String senderId = pendingNotificationIntent.getStringExtra("sender_id");
            if (senderId != null) {
                js = "window.dispatchEvent(new CustomEvent('openChat', { detail: { partnerId: '" + escapeJs(senderId) + "' } }))";
            }
        }
        if (js != null) {
            this.bridge.getWebView().evaluateJavascript(js, null);
        }
    }

    private String escapeJs(String s) {
        return s.replace("\\", "\\\\").replace("'", "\\'");
    }

    @Override
    public void onStart() {
        super.onStart();
        // Injeta a interface JS "Android" no WebView do Capacitor
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(this), "Android");
        }
        // Não reagenda dispatchPendingNotificationEvent() aqui: onCreate/onNewIntent
        // já programaram as tentativas (ver DISPATCH_RETRY_DELAYS_MS) e onStart roda
        // logo em seguida, então evita disparar o evento em duplicidade.
    }

    public class WebAppInterface {
        MainActivity mActivity;

        WebAppInterface(MainActivity c) {
            mActivity = c;
        }

        @JavascriptInterface
        public void enterPipMode() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    // Define a proporção da janela PiP (Vertical 3:4)
                    Rational aspectRatio = new Rational(3, 4);
                    PictureInPictureParams params = new PictureInPictureParams.Builder()
                            .setAspectRatio(aspectRatio)
                            .build();
                    mActivity.enterPictureInPictureMode(params);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
        }

        @JavascriptInterface
        public void bringToFront() {
            // Traz a atividade para o topo
            android.content.Intent intent = new android.content.Intent(mActivity, MainActivity.class);
            intent.setFlags(android.content.Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    | android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
            mActivity.startActivity(intent);
        }

        @JavascriptInterface
        public void showToast(String toast) {
            android.widget.Toast.makeText(mActivity, toast, android.widget.Toast.LENGTH_SHORT).show();
        }

        @JavascriptInterface
        public void triggerNativeMessageSound() {
            try {
                android.net.Uri notification = android.media.RingtoneManager
                        .getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION);
                android.media.Ringtone r = android.media.RingtoneManager.getRingtone(mActivity.getApplicationContext(),
                        notification);
                r.play();
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void triggerNativeAlert() {
            // Placeholder for continuous ringtone if needed, or just play notification
            triggerNativeMessageSound();
        }

        @JavascriptInterface
        public void stopNativeAlert() {
            // Placeholder
        }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode,
            android.content.res.Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);

        if (!isInPictureInPictureMode) {
            // Voltou para tela cheia (saiu do PiP)
            // Executa JS para disparar evento
            if (this.bridge != null && this.bridge.getWebView() != null) {
                this.bridge.getWebView().evaluateJavascript("window.dispatchEvent(new CustomEvent('pipExit'))", null);
            }
        }
    }
}
