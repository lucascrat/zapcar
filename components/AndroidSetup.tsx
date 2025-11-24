import React from 'react';

interface AndroidSetupProps {
  onClose: () => void;
}

export const AndroidSetup: React.FC<AndroidSetupProps> = ({ onClose }) => {
  const javaCode = `
// MainActivity.java
package com.chegoja.driver;

import android.app.PictureInPictureParams;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Rational;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;
import android.media.RingtoneManager;
import android.media.MediaPlayer;
import android.media.AudioManager;

public class MainActivity extends AppCompatActivity {
    private WebView myWebView;
    private MediaPlayer alarmPlayer; // Usamos MediaPlayer para controle de loop

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
            startActivityForResult(intent, 0);
        }

        myWebView = new WebView(this);
        setContentView(myWebView);

        WebSettings webSettings = myWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false);

        myWebView.addJavascriptInterface(new WebAppInterface(this), "Android");
        
        myWebView.loadUrl("https://SEU-PROJETO.vercel.app"); 
        
        myWebView.setWebViewClient(new WebViewClient());
    }

    public class WebAppInterface {
        MainActivity mContext;

        WebAppInterface(MainActivity c) {
            mContext = c;
        }

        @JavascriptInterface
        public void showToast(String toast) {
            Toast.makeText(mContext, toast, Toast.LENGTH_LONG).show();
        }

        @JavascriptInterface
        public void triggerNativeAlert() {
            runOnUiThread(() -> {
                try {
                    // Para qualquer alarme anterior
                    if (alarmPlayer != null && alarmPlayer.isPlaying()) {
                        alarmPlayer.stop();
                        alarmPlayer.release();
                    }

                    Uri notificationSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    if (notificationSound == null) {
                        notificationSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                    }

                    alarmPlayer = new MediaPlayer();
                    alarmPlayer.setDataSource(mContext, notificationSound);
                    
                    // CRÍTICO: Garante que o som saia pelo canal de ALARME (volume máximo)
                     if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        alarmPlayer.setAudioAttributes(
                            new android.media.AudioAttributes.Builder()
                                .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                                .setUsage(android.media.AudioAttributes.USAGE_ALARM)
                                .build()
                        );
                    } else {
                        alarmPlayer.setAudioStreamType(AudioManager.STREAM_ALARM);
                    }

                    alarmPlayer.setLooping(true); // Toca continuamente
                    alarmPlayer.prepareAsync();
                    alarmPlayer.setOnPreparedListener(MediaPlayer::start);

                } catch (Exception e) {
                    e.printStackTrace();
                }
            });
        }

        @JavascriptInterface
        public void stopNativeAlert() {
             runOnUiThread(() -> {
                if (alarmPlayer != null && alarmPlayer.isPlaying()) {
                    alarmPlayer.stop();
                    alarmPlayer.release();
                    alarmPlayer = null;
                }
            });
        }

        @JavascriptInterface
        public void bringToFront() {
            Intent intent = new Intent(mContext, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        }

        @JavascriptInterface
        public void enterPictureInPictureMode() {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                mContext.runOnUiThread(() -> {
                    PictureInPictureParams params = new PictureInPictureParams.Builder()
                        .setAspectRatio(new Rational(9, 16))
                        .build();
                    mContext.enterPictureInPictureMode(params);
                });
            }
        }

        @JavascriptInterface
        public void startAudioMonitoring(String streamUrl, String driverName) {
            Intent serviceIntent = new Intent(mContext, AudioMonitoringService.class);
            serviceIntent.putExtra("STREAM_URL", streamUrl);
            serviceIntent.putExtra("DRIVER_NAME", driverName);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
        }

        @JavascriptInterface
        public void stopAudioMonitoring() {
            Intent serviceIntent = new Intent(mContext, AudioMonitoringService.class);
            stopService(serviceIntent);
        }
    }
}
  `;

  const serviceCode = `
// AudioMonitoringService.java (NOVO ARQUIVO)
package com.chegoja.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.media.MediaPlayer;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.io.IOException;

public class AudioMonitoringService extends Service implements MediaPlayer.OnPreparedListener {
    private static final int NOTIFICATION_ID = 1;
    private static final String CHANNEL_ID = "AudioMonitoringChannel";
    public static final String ACTION_STOP = "com.chegoja.driver.ACTION_STOP";
    private MediaPlayer mediaPlayer;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf(); // Para o serviço se a ação for STOP
            return START_NOT_STICKY;
        }

        String streamUrl = intent.getStringExtra("STREAM_URL");
        String driverName = intent.getStringExtra("DRIVER_NAME");

        startForeground(NOTIFICATION_ID, createNotification("Conectando a " + driverName + "..."));
        
        initMediaPlayer(streamUrl);
        
        return START_STICKY;
    }

    private void initMediaPlayer(String url) {
        if (mediaPlayer != null) {
            mediaPlayer.release();
        }
        mediaPlayer = new MediaPlayer();
        try {
            mediaPlayer.setDataSource(url);
            mediaPlayer.setOnPreparedListener(this);
            mediaPlayer.prepareAsync(); // Prepara em background
        } catch (IOException e) {
            e.printStackTrace();
            stopSelf();
        }
    }

    @Override
    public void onPrepared(MediaPlayer mp) {
        mp.start(); // Inicia a reprodução quando estiver pronto
        updateNotification("Monitorando áudio...");
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mediaPlayer != null) {
            if (mediaPlayer.isPlaying()) {
                mediaPlayer.stop();
            }
            mediaPlayer.release();
            mediaPlayer = null;
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel serviceChannel = new NotificationChannel(
                CHANNEL_ID, "Serviço de Monitoramento de Áudio",
                NotificationManager.IMPORTANCE_LOW
            );
            getSystemService(NotificationManager.class).createNotificationChannel(serviceChannel);
        }
    }

    private Notification createNotification(String text) {
        Intent stopIntent = new Intent(this, AudioMonitoringService.class);
        stopIntent.setAction(ACTION_STOP);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Monitoramento Ativo")
                .setContentText(text)
                .setSmallIcon(R.drawable.ic_hearing) // Você precisa adicionar um ícone 'ic_hearing'
                .addAction(R.drawable.ic_close, "Parar", stopPendingIntent)
                .build();
    }
    
    private void updateNotification(String text) {
        Notification notification = createNotification(text);
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification);
    }
}
  `;

  const manifestCode = `
<!-- AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.chegoja.driver">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"/>
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="ChegoJá Motorista"
        android:theme="@style/Theme.AppCompat.NoActionBar">
        
        <activity android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop"
            android:supportsPictureInPicture="true"
            android:configChanges="screenSize|smallestScreenSize|screenLayout|orientation">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- NOVO: Declaração do Serviço de Áudio -->
        <service android:name=".AudioMonitoringService"
                 android:foregroundServiceType="mediaPlayback" />

    </application>
</manifest>
  `;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="material-icons text-green-600">android</span>
            <h2 className="text-xl font-bold text-gray-800">Criar App Nativo com Super Permissões</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-gray-50 custom-scrollbar text-gray-800">
          <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-6 text-sm">
            <p className="font-bold text-blue-800">Recurso Atualizado: Alarme Contínuo</p>
            <p>Este código agora usa <strong>MediaPlayer</strong> para garantir que o alerta de chamada toque continuamente e no volume máximo de alarme do celular, mesmo em modo silencioso.</p>
          </div>

          <h3 className="font-bold text-lg mb-2">Passo 1: AndroidManifest.xml</h3>
          <p className="text-sm text-gray-600 mb-2">Verifique se todas as permissões necessárias, como `FOREGROUND_SERVICE` e `WAKE_LOCK`, estão presentes.</p>
          <div className="relative mb-6">
            <pre className="bg-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-x-auto select-all">
                {manifestCode}
            </pre>
          </div>

          <h3 className="font-bold text-lg mb-2">Passo 2: Crie/Atualize o arquivo AudioMonitoringService.java</h3>
          <p className="text-sm text-gray-600 mb-2">Este serviço gerencia o áudio de monitoramento em segundo plano.</p>
          <div className="relative mb-6">
            <pre className="bg-gray-800 text-yellow-300 p-4 rounded-lg text-xs overflow-x-auto select-all">
                {serviceCode}
            </pre>
          </div>

          <h3 className="font-bold text-lg mb-2">Passo 3: MainActivity.java (COM ALARME MELHORADO)</h3>
          <p className="text-sm text-gray-600 mb-2">Substitua sua MainActivity para incluir a lógica de alarme contínuo usando MediaPlayer.</p>
          <div className="relative mb-6">
            <pre className="bg-gray-800 text-blue-300 p-4 rounded-lg text-xs overflow-x-auto select-all">
                {javaCode}
            </pre>
          </div>
          
          <div className="text-center mt-4">
              <p className="text-sm text-gray-500">Com estas atualizações, o motorista não perderá mais nenhuma chamada.</p>
          </div>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 mr-2"
          >
            Fechar
          </button>
          <button 
            className="px-6 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 shadow-lg flex items-center gap-2"
            onClick={() => {
                alert("Copie o código acima e use no Android Studio. Se precisar de ajuda, peça a um desenvolvedor Android.");
            }}
          >
            <span className="material-icons text-sm">content_copy</span>
            Entendi
          </button>
        </div>
      </div>
    </div>
  );
};