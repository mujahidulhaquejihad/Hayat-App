package app.hayat.daily;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HayatNative")
public class HayatNativePlugin extends Plugin {
    public static final String CHANNEL_ID = "hayat-namaz";

    @PluginMethod
    public void prepareAlarms(PluginCall call) {
        Context ctx = getContext();
        ensureChannel(ctx);
        boolean ignored = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
            ignored = pm.isIgnoringBatteryOptimizations(ctx.getPackageName());
            if (!ignored) {
                try {
                    Intent i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    i.setData(Uri.parse("package:" + ctx.getPackageName()));
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(i);
                } catch (Exception e) {
                    Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                    fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    ctx.startActivity(fallback);
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("batteryIgnored", ignored);
        ret.put("channel", CHANNEL_ID);
        call.resolve(ret);
    }

    private void ensureChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            CHANNEL_ID,
            "Namaz alarm",
            NotificationManager.IMPORTANCE_HIGH
        );
        ch.setDescription("Rings at salah time");
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[] { 0, 900, 80, 900, 80, 1400, 120, 900 });
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        ch.setShowBadge(true);
        try {
            ch.setBypassDnd(true);
        } catch (Exception ignored) {
            /* some OEMs block this */
        }
        Uri sound = Uri.parse(
            ContentResolver.SCHEME_ANDROID_RESOURCE + "://" + ctx.getPackageName() + "/raw/alarm"
        );
        AudioAttributes aa = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        ch.setSound(sound, aa);
        nm.createNotificationChannel(ch);
    }
}
