package br.com.client.chegoja;

import android.os.Bundle;
import android.os.Build;
import android.util.Rational;
import android.app.PictureInPictureParams;
import android.webkit.JavascriptInterface;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onStart() {
        super.onStart();
        // Injeta a interface JS "Android" no WebView do Capacitor
        if (this.bridge != null && this.bridge.getWebView() != null) {
            this.bridge.getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
            this.bridge.getWebView().addJavascriptInterface(new WebAppInterface(this), "Android");
        }
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
