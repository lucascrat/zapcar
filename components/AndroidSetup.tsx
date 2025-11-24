
import React from 'react';

interface AndroidSetupProps {
  onClose: () => void;
}

export const AndroidSetup: React.FC<AndroidSetupProps> = ({ onClose }) => {
  const javaCode = `
// MainActivity.java
package com.chegoja.driver;

import android.content.Intent;
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
import android.media.Ringtone;
import android.media.RingtoneManager;

public class MainActivity extends AppCompatActivity {
    private WebView myWebView;
    private Ringtone ringtone;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // Solicita permissão de sobreposição (Overlay)
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

        // Ponte Javascript -> Java
        myWebView.addJavascriptInterface(new WebAppInterface(this), "Android");
        
        // Substitua pela URL do seu projeto publicado na Vercel
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
            // Toca som de alarme do sistema (muito alto)
            try {
                Uri notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
                if (notification == null) notification = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
                
                if (ringtone == null) {
                    ringtone = RingtoneManager.getRingtone(getApplicationContext(), notification);
                }
                if (!ringtone.isPlaying()) {
                    ringtone.play();
                }
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        @JavascriptInterface
        public void stopNativeAlert() {
            if (ringtone != null && ringtone.isPlaying()) {
                ringtone.stop();
            }
        }

        @JavascriptInterface
        public void bringToFront() {
            // Traz o app para frente (Sobreposição)
            Intent intent = new Intent(mContext, MainActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        }
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
            <h2 className="text-xl font-bold text-gray-800">Criar App Nativo com Super Permissões</h2>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="p-6 overflow-y-auto bg-gray-50 custom-scrollbar text-gray-800">
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-4 mb-6 text-sm">
            <p className="font-bold text-yellow-800">Por que preciso disso?</p>
            <p>Navegadores (Chrome/Safari) bloqueiam sons automáticos e não podem abrir sozinhos quando uma mensagem chega. Para ter um app que <strong>toca alarme alto</strong> e <strong>abre na frente do GPS</strong>, você precisa encapsular este site em um App Android Nativo.</p>
          </div>

          <h3 className="font-bold text-lg mb-2">Passo 1: Crie um projeto no Android Studio</h3>
          <p className="text-sm text-gray-600 mb-4">Inicie um projeto "Empty Activity" com Java.</p>

          <h3 className="font-bold text-lg mb-2">Passo 2: AndroidManifest.xml</h3>
          <p className="text-sm text-gray-600 mb-2">Adicione estas permissões para permitir sobreposição e GPS.</p>
          <div className="relative mb-6">
            <pre className="bg-gray-800 text-green-400 p-4 rounded-lg text-xs overflow-x-auto select-all">
                {manifestCode}
            </pre>
          </div>

          <h3 className="font-bold text-lg mb-2">Passo 3: MainActivity.java</h3>
          <p className="text-sm text-gray-600 mb-2">Este código cria o navegador e a "Ponte" para o site controlar o celular.</p>
          <div className="relative mb-6">
            <pre className="bg-gray-800 text-blue-300 p-4 rounded-lg text-xs overflow-x-auto select-all">
                {javaCode}
            </pre>
          </div>
          
          <div className="text-center mt-4">
              <p className="text-sm text-gray-500">Ao rodar este app no seu celular, o site detectará automaticamente o <code>window.Android</code> e ativará os recursos avançados.</p>
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
