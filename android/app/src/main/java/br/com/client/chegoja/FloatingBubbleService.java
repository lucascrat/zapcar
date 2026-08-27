package br.com.client.chegoja;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.IBinder;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

/**
 * Bolha flutuante (igual "chat head" do WhatsApp/Messenger) que substitui o
 * PiP nativo do Android como opção "discreta": o PiP oficial tem um tamanho
 * mínimo imposto pelo sistema/fabricante que o app não consegue reduzir (uma
 * janela grande e quadrada, não um ícone pequeno) - só desenhando a própria
 * janela por cima de tudo (SYSTEM_ALERT_WINDOW) dá pra controlar o tamanho de
 * verdade.
 *
 * Arrasta pra mover, toca (sem arrastar) pra reabrir o app e fechar a bolha.
 * Roda como foreground service pra não ser morta pelo Android enquanto o
 * motorista usa outro app - sem isso a bolha desaparece sozinha depois de um
 * tempo em segundo plano.
 */
public class FloatingBubbleService extends Service {

    public static final String ACTION_STOP = "br.com.client.chegoja.action.STOP_BUBBLE";
    private static final String CHANNEL_ID = "floating_bubble";
    private static final int NOTIFICATION_ID = 9001;
    private static final int BUBBLE_SIZE_DP = 56;

    // Toque vs arraste: se o dedo levantar perto de onde apertou e rápido o
    // suficiente, conta como toque (reabre o app) - senão foi um arraste.
    private static final int TAP_MOVE_THRESHOLD_PX_DP = 8;
    private static final long TAP_MAX_DURATION_MS = 250;

    // Sinaliza pro MainActivity.onStart() se a bolha estava ativa quando o app
    // voltou pra frente (pra disparar o mesmo reset de estado que o PiP antigo
    // usava - ver App.tsx handlePipExit) - só reresetamos se realmente estava.
    public static boolean wasActive = false;

    private WindowManager windowManager;
    private View bubbleView;
    private WindowManager.LayoutParams params;

    private float initialTouchX, initialTouchY;
    private int initialX, initialY;
    private long touchDownTime;
    private boolean moved;

    @Override
    public void onCreate() {
        super.onCreate();
        wasActive = true;
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        addBubble();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        return START_NOT_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        removeBubble();
    }

    private void addBubble() {
        if (bubbleView != null) return; // já existe, não duplica

        windowManager = (WindowManager) getSystemService(Context.WINDOW_SERVICE);
        float density = getResources().getDisplayMetrics().density;
        int sizePx = Math.round(BUBBLE_SIZE_DP * density);

        ImageView iv = new ImageView(this);
        iv.setImageResource(R.drawable.ic_car_bubble);
        iv.setBackgroundResource(R.drawable.bg_bubble_circle);
        int paddingPx = Math.round(12 * density);
        iv.setPadding(paddingPx, paddingPx, paddingPx, paddingPx);
        bubbleView = iv;

        int layoutFlag = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
                : WindowManager.LayoutParams.TYPE_PHONE;

        params = new WindowManager.LayoutParams(
                sizePx, sizePx,
                layoutFlag,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT
        );
        params.gravity = Gravity.TOP | Gravity.START;
        params.x = 0;
        params.y = Math.round(200 * density);

        final int touchSlopPx = Math.round(TAP_MOVE_THRESHOLD_PX_DP * density);

        bubbleView.setOnTouchListener((v, event) -> {
            switch (event.getAction()) {
                case MotionEvent.ACTION_DOWN:
                    initialX = params.x;
                    initialY = params.y;
                    initialTouchX = event.getRawX();
                    initialTouchY = event.getRawY();
                    touchDownTime = System.currentTimeMillis();
                    moved = false;
                    return true;

                case MotionEvent.ACTION_MOVE:
                    int dx = (int) (event.getRawX() - initialTouchX);
                    int dy = (int) (event.getRawY() - initialTouchY);
                    if (!moved && (Math.abs(dx) > touchSlopPx || Math.abs(dy) > touchSlopPx)) {
                        moved = true;
                    }
                    if (moved) {
                        params.x = initialX + dx;
                        params.y = initialY + dy;
                        try {
                            windowManager.updateViewLayout(bubbleView, params);
                        } catch (Exception ignored) {
                        }
                    }
                    return true;

                case MotionEvent.ACTION_UP:
                    long duration = System.currentTimeMillis() - touchDownTime;
                    if (!moved && duration < TAP_MAX_DURATION_MS) {
                        onBubbleTapped();
                    }
                    return true;
            }
            return false;
        });

        try {
            windowManager.addView(bubbleView, params);
        } catch (Exception e) {
            e.printStackTrace();
            stopSelf();
        }
    }

    private void onBubbleTapped() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK
                | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(intent);
        stopSelf();
    }

    private void removeBubble() {
        if (windowManager != null && bubbleView != null) {
            try {
                windowManager.removeView(bubbleView);
            } catch (Exception ignored) {
            }
            bubbleView = null;
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null && manager.getNotificationChannel(CHANNEL_ID) == null) {
                NotificationChannel channel = new NotificationChannel(
                        CHANNEL_ID,
                        "Ícone flutuante",
                        NotificationManager.IMPORTANCE_MIN
                );
                channel.setShowBadge(false);
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent stopIntent = new Intent(this, FloatingBubbleService.class);
        stopIntent.setAction(ACTION_STOP);
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT
                | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0);
        PendingIntent stopPendingIntent = PendingIntent.getService(this, 0, stopIntent, piFlags);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
        PendingIntent openPendingIntent = PendingIntent.getActivity(this, 0, openIntent, piFlags);

        return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(getApplicationInfo().icon)
                .setContentTitle("chegoja em segundo plano")
                .setContentText("Toque no ícone flutuante pra voltar ao app")
                .setContentIntent(openPendingIntent)
                .addAction(0, "Fechar bolha", stopPendingIntent)
                .setOngoing(true)
                .setPriority(Notification.PRIORITY_MIN)
                .build();
    }
}
