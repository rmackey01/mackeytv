package tv.mackey.launcher

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * MackeyTV: a full-screen web view showing the 3D video store.
 * The store calls MackeyTV.play(url, service, title) and this hands the movie to the streaming app.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView
    private var usingOffline = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 8, 12))
            isFocusable = true
            isFocusableInTouchMode = true
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.userAgentString = settings.userAgentString + " MackeyTV/" + BuildConfig.VERSION_NAME
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    // only the store itself loads in here; anything else goes to the right app
                    val u = request.url
                    if (u.host == Uri.parse(BuildConfig.STORE_URL).host || u.scheme == "file") return false
                    play(u.toString(), "", "")
                    return true
                }
                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    // no internet or the site is down: use the copy of the store built into the app
                    if (request.isForMainFrame && !usingOffline) {
                        usingOffline = true
                        view.loadUrl("file:///android_asset/store.html")
                    }
                }
            }
            addJavascriptInterface(Bridge(), "MackeyTV")
        }
        setContentView(web)
        hideBars()
        web.loadUrl(BuildConfig.STORE_URL)
        web.requestFocus()
    }

    private fun hideBars() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE)
    }

    override fun onResume() {
        super.onResume()
        hideBars()
        if (::web.isInitialized) {
            web.onResume()
            web.evaluateJavascript("window.mtvResume && window.mtvResume()", null)
        }
    }

    override fun onPause() {
        if (::web.isInitialized) web.onPause()
        super.onPause()
    }

    // The remote's Back button becomes Escape inside the store; MackeyTV never closes itself.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        val k = event.keyCode
        if (k == KeyEvent.KEYCODE_BACK || k == KeyEvent.KEYCODE_ESCAPE) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) sendKey("Escape")
            return true
        }
        if (k == KeyEvent.KEYCODE_MENU || k == KeyEvent.KEYCODE_SETTINGS || k == KeyEvent.KEYCODE_GUIDE) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) sendKey("m")
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun sendKey(key: String) {
        val js = "(function(){var o={key:'$key',bubbles:true};document.dispatchEvent(new KeyboardEvent('keydown',o));" +
            "setTimeout(function(){document.dispatchEvent(new KeyboardEvent('keyup',o));},40);})()"
        web.evaluateJavascript(js, null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* handled in dispatchKeyEvent */ }

    inner class Bridge {
        @JavascriptInterface
        fun play(url: String, service: String, title: String): Boolean = this@MainActivity.play(url, service, title)

        @JavascriptInterface
        fun installed(service: String): Boolean = Apps.find(packageManager, service) != null

        @JavascriptInterface
        fun version(): String = BuildConfig.VERSION_NAME
    }

    /** Open a title in its streaming app. Tries the deep link in the right app, then any app, then just opens the app. */
    fun play(url: String, service: String, title: String): Boolean {
        val pm = packageManager
        val app = Apps.find(pm, service.ifEmpty { Apps.serviceFor(url) })
        if (url.isNotEmpty()) {
            val uri = Uri.parse(url)
            if (app != null) {
                val direct = Intent(Intent.ACTION_VIEW, uri).setPackage(app).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                if (start(direct)) return true
            }
            // any non-browser app that claims this link
            val view = Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            val handlers = pm.queryIntentActivities(view, 0).map { it.activityInfo.packageName }.filterNot { Apps.isBrowser(it) || it == packageName }
            if (handlers.isNotEmpty()) {
                if (start(Intent(view).setPackage(handlers.first()))) return true
            }
        }
        if (app != null) {
            val launch = pm.getLeanbackLaunchIntentForPackage(app) ?: pm.getLaunchIntentForPackage(app)
            if (launch != null && start(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))) return true
        }
        return false
    }

    private fun start(i: Intent): Boolean = try {
        startActivity(i); true
    } catch (e: ActivityNotFoundException) { false } catch (e: SecurityException) { false }
}

/** Known TV app packages for each service, plus a label match for anything else. */
object Apps {
    private val KNOWN = linkedMapOf(
        "disney" to listOf("com.disney.disneyplus"),
        "hulu" to listOf("com.hulu.livingroomplus", "com.hulu.plus"),
        "prime" to listOf("com.amazon.amazonvideo.livingroom", "com.amazon.avod.thirdpartyclient"),
        "paramount" to listOf("com.cbs.ott", "com.cbs.app"),
        "max" to listOf("com.wbd.stream", "com.hbo.hbonow"),
        "peacock" to listOf("com.peacocktv.peacockandroid"),
        "tubi" to listOf("com.tubitv"),
        "pluto" to listOf("tv.pluto.android"),
        "netflix" to listOf("com.netflix.ninja"),
        "youtube tv" to listOf("com.google.android.youtube.tvunplugged"),
        // trailers open in SmartTube (no ads) when it's installed
        "youtube" to listOf("com.liskovsoft.smarttubetv.beta", "com.liskovsoft.smarttubetv", "com.teamsmart.videomanager.tv", "com.google.android.youtube.tv"),
        "angel" to listOf("com.angelstudios.app", "com.vidangel.thechosen"),
        "minno" to listOf("com.minno.android", "com.minnolife.android"),
        "pure flix" to listOf("com.pureflix.android", "com.gac.pureflix")
    )
    private val LABELS = mapOf("prime" to "prime video", "angel" to "angel", "minno" to "minno", "pure flix" to "pure flix", "max" to "max")

    private fun key(service: String): String? {
        val s = service.lowercase()
        if (s.isEmpty()) return null
        if ("youtube tv" in s) return "youtube tv"
        if ("amazon" in s || "freevee" in s) return "prime"
        if ("hbo" in s) return "max"
        if ("great american" in s || "pureflix" in s) return "pure flix"
        return KNOWN.keys.firstOrNull { s.contains(it) }
    }

    fun serviceFor(url: String): String {
        val u = url.lowercase()
        return when {
            "disneyplus" in u -> "disney"
            "hulu" in u -> "hulu"
            "amazon" in u || "primevideo" in u -> "prime"
            "paramountplus" in u -> "paramount"
            "max.com" in u || "hbomax" in u -> "max"
            "peacock" in u -> "peacock"
            "tubitv" in u -> "tubi"
            "pluto" in u -> "pluto"
            "netflix" in u -> "netflix"
            "youtube" in u || "youtu.be" in u -> "youtube"
            "angel.com" in u -> "angel"
            "minno" in u -> "minno"
            "pureflix" in u || "greatamericanpureflix" in u -> "pure flix"
            else -> ""
        }
    }

    fun find(pm: PackageManager, service: String): String? {
        val k = key(service) ?: return null
        KNOWN[k]?.firstOrNull { installed(pm, it) }?.let { return it }
        // not a package we know: match the app's name on the home screen
        val want = LABELS[k] ?: k
        val tv = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LEANBACK_LAUNCHER)
        return pm.queryIntentActivities(tv, 0).firstOrNull { it.loadLabel(pm).toString().lowercase().contains(want) }?.activityInfo?.packageName
    }

    private fun installed(pm: PackageManager, p: String): Boolean = try {
        pm.getPackageInfo(p, 0); true
    } catch (e: PackageManager.NameNotFoundException) { false }

    fun isBrowser(p: String): Boolean =
        p.contains("chrome") || p.contains("browser") || p.contains("firefox") || p == "com.android.htmlviewer" || p.contains("webview")
}
