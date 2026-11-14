"""Customise the Capacitor Android project generated in CI: landscape, immersive fullscreen,
keep-screen-on, game icon, version from CI run number."""
import os, re, pathlib
from PIL import Image
root = pathlib.Path('android/app/src/main')
man = root / 'AndroidManifest.xml'
s = man.read_text()
s = s.replace('android:name=".MainActivity"', 'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"\n            android:hardwareAccelerated="true"', 1)
if 'android:largeHeap' not in s:
    s = s.replace('<application', '<application\n        android:largeHeap="true"', 1)
man.write_text(s)
pkg_dir = root / 'java' / 'com' / 'rezoxnemesis' / 'damanduo'
(pkg_dir / 'MainActivity.java').write_text('''package com.rezoxnemesis.damanduo;

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        hideBars();
        setRefresh(60f);
        // the game picks the panel refresh rate that matches its frame-rate setting (60 / 90 / 120 Hz): window.DDNative.refresh(hz)
        try {
            getBridge().getWebView().addJavascriptInterface(new Object() {
                @android.webkit.JavascriptInterface
                public void refresh(final float hz) { runOnUiThread(new Runnable() { public void run() { setRefresh(hz); } }); }
                @android.webkit.JavascriptInterface
                public String modes() { return refreshModes(); }
            }, "DDNative");
        } catch (Throwable e) { }
    }

    private String refreshModes() {
        StringBuilder sb = new StringBuilder();
        try {
            if (android.os.Build.VERSION.SDK_INT >= 23) {
                android.view.Display d = getWindowManager().getDefaultDisplay();
                android.view.Display.Mode cur = d.getMode();
                for (android.view.Display.Mode m : d.getSupportedModes())
                    if (m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight()) { if (sb.length() > 0) sb.append(','); sb.append(Math.round(m.getRefreshRate())); }
            }
        } catch (Throwable e) { }
        return sb.toString();
    }

    // choose the display mode (same resolution) whose refresh rate is the lowest one that is >= hz, or the highest available
    private void setRefresh(float hz) {
        try {
            if (android.os.Build.VERSION.SDK_INT < 23) return;
            android.view.Display d = getWindowManager().getDefaultDisplay();
            android.view.Display.Mode cur = d.getMode(), best = null, top = cur;
            for (android.view.Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                if (m.getRefreshRate() > top.getRefreshRate()) top = m;
                if (m.getRefreshRate() >= hz - 1f && (best == null || m.getRefreshRate() < best.getRefreshRate())) best = m;
            }
            if (best == null) best = top;
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.preferredDisplayModeId = best.getModeId();
            lp.preferredRefreshRate = best.getRefreshRate();
            getWindow().setAttributes(lp);
        } catch (Throwable e) { }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    private void hideBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        c.hide(WindowInsetsCompat.Type.systemBars());
        c.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
''')
styles = root / 'res' / 'values' / 'styles.xml'
if styles.exists():
    st = styles.read_text()
    st = re.sub(r'(<style name="AppTheme.NoActionBar"[^>]*>)', r'\1\n        <item name="android:windowFullscreen">true</item>\n        <item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>', st, 1)
    styles.write_text(st)
bg = root / 'res' / 'values' / 'ic_launcher_background.xml'
if bg.exists():
    bg.write_text('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#1B0F2E</color>\n</resources>\n')
icon = Image.open('build/icon.png').convert('RGBA')
for dens, size in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    d = root / 'res' / f'mipmap-{dens}'
    if not d.exists():
        continue
    for name in ('ic_launcher.png', 'ic_launcher_round.png'):
        icon.resize((size, size), Image.LANCZOS).save(d / name)
    fg = int(size * 108 / 48)
    canvas = Image.new('RGBA', (fg, fg), (0, 0, 0, 0))
    inner = icon.resize((int(fg * 0.72), int(fg * 0.72)), Image.LANCZOS)
    canvas.paste(inner, ((fg - inner.width) // 2, (fg - inner.height) // 2), inner)
    canvas.save(d / 'ic_launcher_foreground.png')
gradle = pathlib.Path('android/app/build.gradle')
g = gradle.read_text()
run = os.environ.get('GITHUB_RUN_NUMBER', '1')
ver = __import__('json').load(open('package.json'))['version']
g = re.sub(r'versionCode \d+', f'versionCode {run}', g)
g = re.sub(r'versionName "[^"]*"', f'versionName "{ver}"', g)
gradle.write_text(g)
print('android project patched', ver, run)
