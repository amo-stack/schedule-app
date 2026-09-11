package com.zez.export;

import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "Export")
public class ExportPlugin extends Plugin {

    @PluginMethod()
    public void saveImageToGallery(PluginCall call) {
        String base64 = call.getString("base64");
        String filename = call.getString("filename");
        if (base64 == null) base64 = "";
        if (filename == null) filename = "timetable.png";
        if (base64.isEmpty()) {
            call.reject("没有图片数据");
            return;
        }
        if (!filename.toLowerCase().endsWith(".png")) {
            filename = filename + ".png";
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            Context ctx = getContext();
            Uri uri = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues values = new ContentValues();
                values.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
                values.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_DCIM + "/ScheduleApp");
                uri = ctx.getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IOException("MediaStore 插入失败");
                try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                    if (os == null) throw new IOException("无法打开输出流");
                    os.write(bytes);
                    os.flush();
                }
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DCIM), "ScheduleApp");
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("无法创建目录");
                File file = new File(dir, filename);
                try (FileOutputStream fos = new FileOutputStream(file)) {
                    fos.write(bytes);
                    fos.flush();
                }
                ctx.sendBroadcast(new Intent(Intent.ACTION_MEDIA_SCANNER_SCAN_FILE, Uri.fromFile(file)));
            }

            JSObject r = new JSObject();
            r.put("uri", uri != null ? uri.toString() : "");
            call.resolve(r);
        } catch (Exception e) {
            call.reject("保存到相册失败：" + e.getMessage(), e);
        }
    }

    @PluginMethod()
    public void shareImage(PluginCall call) {
        String base64 = call.getString("base64");
        String filename = call.getString("filename");
        if (base64 == null) base64 = "";
        if (filename == null) filename = "timetable_share.png";
        if (base64.isEmpty()) {
            call.reject("没有图片数据");
            return;
        }
        if (!filename.toLowerCase().endsWith(".png")) {
            filename = filename + ".png";
        }
        try {
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            File cacheDir = getContext().getCacheDir();
            File shareDir = new File(cacheDir, "export_share");
            shareDir.mkdirs();
            File file = new File(shareDir, filename);
            try (FileOutputStream fos = new FileOutputStream(file)) {
                fos.write(bytes);
                fos.flush();
            }
            String authority = getContext().getPackageName() + ".exportfileprovider";
            Uri uri = FileProvider.getUriForFile(getContext(), authority, file);
            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("image/png");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(shareIntent, "分享到"));
            JSObject r = new JSObject();
            r.put("ok", true);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("分享失败：" + e.getMessage(), e);
        }
    }
}
