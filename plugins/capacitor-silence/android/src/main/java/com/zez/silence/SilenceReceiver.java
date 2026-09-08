package com.zez.silence;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioManager;
import android.os.Build;

public class SilenceReceiver extends BroadcastReceiver {
    private static final String PREFS = "silence_prefs";
    private static final String CHANNEL_ID = "class-reminder";

    @Override
    public void onReceive(Context context, Intent intent) {
        boolean enable = "com.zez.silence.ENABLE".equals(intent.getAction());
        NotificationManager nm =
                (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (nm == null || !nm.isNotificationPolicyAccessGranted()) return;
            if (enable) {
                prefs.edit().putInt("prev", nm.getCurrentInterruptionFilter()).apply();
                SilencePlugin.ensureChannel(nm);
                nm.setInterruptionFilter(NotificationManager.INTERRUPTION_FILTER_NONE);
            } else {
                int prev = prefs.getInt("prev", NotificationManager.INTERRUPTION_FILTER_ALL);
                nm.setInterruptionFilter(prev);
            }
        } else {
            AudioManager am = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
            if (am != null) {
                am.setRingerMode(enable ? AudioManager.RINGER_MODE_SILENT : AudioManager.RINGER_MODE_NORMAL);
            }
        }
    }
}
