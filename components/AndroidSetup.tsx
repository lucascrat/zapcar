
import React from 'react';

interface AndroidSetupProps {
  onClose: () => void;
}

export const AndroidSetup: React.FC<AndroidSetupProps> = ({ onClose }) => {
  const javaCode = `
// FILE: MainActivity.java
package com.chegoja.driver;

import android.content.Intent;
import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private WebView myWebView;
    private MediaPlayer mediaPlayer; // Usando MediaPlayer para Loop Infinito

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 1. Solicita permissão de sobreposição (Overlay) - CRUCIAL PARA ABRIR O APP SOZINHO
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this)) {
            Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()));
            startActivityForResult(intent, 0);
        }

        myWebView = new WebView(this);
        setContentView(myWebView);

        WebSettings webSettings = myWebView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setMediaPlaybackRequiresUserGesture(false); // Permite som automático

        // 2. Cria a Ponte Javascript -> Java
        myWebView.addJavascriptInterface(new WebAppInterface(this), "Android");
        
        // SUBSTITUA PELA URL DO SEU SITE (Deploy na Vercel)
        myWebView.loadUrl("https://SEU-PROJETO.vercel.app"); 
        
        myWebView.setWebViewClient(new WebViewClient());
    }

    // Classe que recebe os comandos do Site
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
            // ALARME DE CHAMADA (LOOP)
            try {
                if (mediaPlayer == null) {
                    Uri notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                    if (notification == null) notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                    
                    mediaPlayer = new MediaPlayer();
                    mediaPlayer.setDataSource(mContext, notification);
                    mediaPlayer.setAudioAttributes(new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ALARM) // Prioridade Alta
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build());
                    mediaPlayer.setLooping(true); // Toca sem parar até atender
                    mediaPlayer.prepare();
                }
                
                if (!mediaPlayer.isPlaying()) {
                    mediaPlayer.start();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void triggerNativeMessageSound() {
            // ALERTA DE MENSAGEM (SOM ÚNICO, MAS ALTO/ALARM)
            try {
                Uri notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
                if (notification == null) notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                
                MediaPlayer mp = new MediaPlayer();
                mp.setDataSource(mContext, notification);
                // Define como USAGE_ALARM para garantir volume alto mesmo se notificação estiver baixa
                mp.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM) 
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                mp.setLooping(false); // Toca apenas uma vez
                mp.prepare();
                mp.start();
                // Libera recursos após tocar
                mp.setOnCompletionListener(new MediaPlayer.OnCompletionListener() {
                    @Override
                    public void onCompletion(MediaPlayer mp) {
                        mp.release();
                    }
                });
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void stopNativeAlert() {
            try {
                if (mediaPlayer != null && mediaPlayer.isPlaying()) {
                    mediaPlayer.stop();
                    mediaPlayer.release();
                    mediaPlayer = null; // Reseta para próxima chamada
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void bringToFront() {
            // COMANDO MÁGICO: Traz o app para frente (Sobreposição)
            try {
                Intent intent = new Intent(mContext, MainActivity.class);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); 
                intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
                intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP); // Garante limpeza
                mContext.startActivity(intent);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
    }
}
  `;

  const manifestCode = `
<!-- FILE: AndroidManifest.xml -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.chegoja.driver">

    <!-- PERMISSÕES NECESSÁRIAS -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/> <!-- Sobrepor Apps -->
    <uses-permission android:name="android.permission.WAKE_LOCK" /> <!-- Manter tela ligada -->
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="ChegoJá Motorista"
        android:theme="@style/Theme.AppCompat.NoActionBar">
        
        <activity android:name=".MainActivity"
            android:exported="true"
            android:launchMode="singleTop">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
  `;

  return (
    <div className="fixed inset-0 z-[200] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="bg-white w-full max-w-3xl rounded-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="material-icons text-green-600">android</span>
            <h2 className="text-xl font-bold text-gray-800">Código do App Nativo (Atualizado)</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-gray-50 custom-scrollbar text-gray-800">
          <div className="bg-blue-100 border-l-4 border-blue-500 p-4 mb-6 text-sm">
            <p className="font-bold text-blue-800">Instruções:</p>
            <p>Copie os códigos abaixo e cole em um projeto <strong>Android Studio (Java)</strong>. Este código cria a "ponte" necessária para que o site comande o celular (Tocar alarme, Abrir sozinho).</p>
          </div>

          <h3 className="font-bold text-lg mb-2 text-whatsapp-dark">1. AndroidManifest.xml</h3>
          <p className="text-sm text-gray-600 mb-2">Define as permissões de sobreposição e GPS.</p>
          <div className="relative mb-6 group">
            <pre className="bg-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-x-auto select-all shadow-inner">
                {manifestCode}
            </pre>
          </div>

          <h3 className="font-bold text-lg mb-2 text-whatsapp-dark">2. MainActivity.java</h3>
          <p className="text-sm text-gray-600 mb-2">Lógica para abrir o app ao receber mensagem (bringToFront) e tocar alarme.</p>
          <div className="relative mb-6 group">
            <pre className="bg-gray-800 text-blue-300 p-4 rounded-lg text-xs overflow-x-auto select-all shadow-inner">
                {javaCode}
            </pre>
          </div>
          
          <div className="bg-gray-200 p-3 rounded text-xs text-center text-gray-600">
              Nota: Lembre-se de substituir <code>https://SEU-PROJETO.vercel.app</code> pela URL real do seu site publicado.
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
                // Em um cenário real, isso poderia copiar para o clipboard
                alert("Códigos disponíveis para cópia!");
            }}
          >
            <span className="material-icons text-sm">check</span>
            Ok, Entendi
          </button>
        </div>
      </div>
    </div>
  );
};
