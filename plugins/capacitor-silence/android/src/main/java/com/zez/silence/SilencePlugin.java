package com.zez.silence;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;

import org.json.JSONObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Silence")
public class SilencePlugin extends Plugin {
    private static final String PREFS = "silence_prefs";
    private static final String CHANNEL_ID = "class-reminder";
    private static final int REQ_BASE = 8000;

    private NotificationManager nm() {
        return (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
    }

    private AudioManager am() {
        return (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    private SharedPreferences prefs() {
        return getActivity().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @PluginMethod()
    public void canSilence(PluginCall call) {
        JSObject r = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            r.put("granted", nm().isNotificationPolicyAccessGranted());
        } else {
            r.put("granted", true);
        }
        call.resolve(r);
    }

    @PluginMethod()
    public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !nm().isNotificationPolicyAccessGranted()) {
            Intent intent = new Intent(Settings.ACTION_NOTIFICATION_POLICY_ACCESS_SETTINGS);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod()
    public void prepareChannel(PluginCall call) {
        ensureChannel(nm());
        call.resolve();
    }

    @PluginMethod()
    public void enable(PluginCall call) {
        apply(true);
        call.resolve();
    }

    @PluginMethod()
    public void disable(PluginCall call) {
        apply(false);
        call.resolve();
    }

    @PluginMethod()
    public void scheduleWindows(PluginCall call) {
        AlarmManager am = (AlarmManager) getContext().getSystemService(Context.ALARM_SERVICE);
        // 先取消上一轮已排的闹钟
        int prevCount = prefs().getInt("count", 0);
        for (int i = 0; i < prevCount; i++) {
            am.cancel(makePI(i, true));
            am.cancel(makePI(i, false));
        }
        int count = 0;
        JSArray windows = call.getArray("windows");
        if (windows != null) {
            long now = System.currentTimeMillis();
            for (int i = 0; i < windows.length(); i++) {
                JSONObject w = windows.optJSONObject(i);
                if (w == null) continue;
                long en = w.optLong("enableAt", 0);
                long dis = w.optLong("disableAt", 0);
                if (dis <= now) continue;
                if (en > now) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, en, makePI(count, true));
                }
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, dis, makePI(count, false));
                count++;
            }
        }
        prefs().edit().putInt("count", count).apply();
        call.resolve();
    }

    private PendingIntent makePI(int idx, boolean enable) {
        Intent intent = new Intent(getContext(), SilenceReceiver.class);
        intent.setAction(enable ? "com.zez.silence.ENABLE" : "com.zez.silence.DISABLE");
        int code = REQ_BASE + idx * 2 + (enable ? 0 : 1);
        return PendingIntent.getBroadcast(getContext(), code, intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private void apply(boolean on) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            NotificationManager m = nm();
            if (!m.isNotificationPolicyAccessGranted()) return;
            if (on) {
                prefs().edit().putInt("prev", m.getCurrentInterruptionFilter()).apply();
                ensureChannel(m);
                m.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE);
            } else {
                int prev = prefs().getInt("prev", NotificationManager.INTERRUPTION_FILTER_ALL);
                m.setInterruptionFilter(prev);
            }
        } else {
            am().setRingerMode(on ? AudioManager.RINGER_MODE_SILENT : AudioManager.RINGER_MODE_NORMAL);
        }
    }

    static void ensureChannel(NotificationManager m) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            android.app.NotificationChannel ch =
                    new android.app.NotificationChannel(CHANNEL_ID, "上课提醒",
                            NotificationManager.IMPORTANCE_HIGH);
            ch.setBypassDnd(true);
            ch.enableVibration(true);
            ch.setSound(sound, attrs);
            m.createNotificationChannel(ch);
        }
    }
}
