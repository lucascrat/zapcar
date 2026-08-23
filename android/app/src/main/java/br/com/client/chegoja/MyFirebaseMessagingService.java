package br.com.client.chegoja;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;
import java.util.Random;

/**
 * Substitui o MessagingService padrão do Capacitor (removido no AndroidManifest via
 * tools:node="remove") porque a Edge Function "send-notification" manda mensagens
 * "data-only" de propósito (sem o campo 'notification'), para funcionar mesmo com o
 * app fechado. O problema é que nem o Capacitor nem o Android exibem nada sozinhos
 * pra esse tipo de mensagem quando o app não está em primeiro plano - é obrigação do
 * app construir e mostrar a notificação manualmente, o que nunca foi implementado.
 * Essa classe faz isso: recebe a mensagem, repassa pro JS (mantém o comportamento
 * existente de som/badge quando o app está aberto) e SEMPRE posta uma notificação
 * real na barra de notificações/tela bloqueada, igual ao WhatsApp.
 *
 * Corridas (type=new_ride) recebem tratamento especial de "chamada": full-screen
 * intent, que acorda a tela e abre o app por cima da tela de bloqueio, igual uma
 * ligação chegando - o motorista não precisa desbloquear o celular manualmente
 * pra ver que tem corrida disponível.
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String RIDE_TYPE = "new_ride";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        // Mantém o fluxo de registro de token do plugin do Capacitor funcionando.
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        // Repassa a mensagem pro listener JS (pushNotificationReceived), preservando
        // o comportamento existente quando o app está em primeiro plano.
        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Exception e) {
            e.printStackTrace();
        }

        Map<String, String> data = remoteMessage.getData();
        if (data == null || data.isEmpty()) return;

        String title = data.get("title");
        String body = data.get("body");
        if (title == null && body == null) return;

        String sound = data.get("sound");
        boolean isRide = RIDE_TYPE.equals(data.get("type"));
        // "_v2": canais Android são imutáveis depois de criados (não dá pra corrigir o
        // som de um canal já existente) - versionado pra forçar recriação com o som
        // correto (res/raw/ubb.mp3) mesmo em aparelhos que já tinham o app instalado.
        String channelId = (isRide || "ubb".equals(sound)) ? "special_alert_v2" : "chegoja_rides";

        showSystemNotification(
                title != null ? title : "chegoja",
                body != null ? body : "",
                channelId,
                data,
                isRide
        );
    }

    private void showSystemNotification(String title, String body, String channelId, Map<String, String> data, boolean isRide) {
        Context ctx = getApplicationContext();
        NotificationManager manager = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;

        Uri channelSound = getChannelSoundUri(ctx, channelId);

        // Garante que o canal existe mesmo se o app nunca abriu o JS que os cria
        // (pushService.ts cria 'chegoja_rides' e 'special_alert' no login).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel existing = manager.getNotificationChannel(channelId);
            if (existing == null) {
                NotificationChannel channel = new NotificationChannel(
                        channelId,
                        "special_alert_v2".equals(channelId) ? "Alertas Especiais (Corridas)" : "Corridas e Alertas",
                        NotificationManager.IMPORTANCE_HIGH
                );
                channel.enableVibration(true);
                channel.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500, 1000});
                channel.setSound(channelSound, new AudioAttributes.Builder()
                        .setUsage(isRide ? AudioAttributes.USAGE_NOTIFICATION_RINGTONE : AudioAttributes.USAGE_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build());
                if (isRide) {
                    channel.setBypassDnd(true);
                    channel.enableLights(true);
                }
                manager.createNotificationChannel(channel);
            }
        }

        Intent intent = new Intent(ctx, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        if (data != null) {
            for (Map.Entry<String, String> entry : data.entrySet()) {
                intent.putExtra(entry.getKey(), entry.getValue());
            }
        }

        int requestCode = new Random().nextInt(Integer.MAX_VALUE);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent pendingIntent = PendingIntent.getActivity(ctx, requestCode, intent, piFlags);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx, channelId)
                .setSmallIcon(ctx.getApplicationInfo().icon)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(isRide ? NotificationCompat.CATEGORY_CALL : NotificationCompat.CATEGORY_MESSAGE)
                .setSound(channelSound)
                .setContentIntent(pendingIntent);

        if (isRide) {
            // Igual uma chamada chegando: acorda a tela e abre o app por cima da
            // tela de bloqueio, mesmo sem o usuário tocar na notificação.
            builder.setFullScreenIntent(pendingIntent, true);
        }

        manager.notify(requestCode, builder.build());
    }

    private Uri getChannelSoundUri(Context ctx, String channelId) {
        if ("special_alert_v2".equals(channelId)) {
            // res/raw/ubb.mp3 - mesmo alarme usado no app em primeiro plano (ubb.mp3).
            return Uri.parse(ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/ubb");
        }
        return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
    }
}
