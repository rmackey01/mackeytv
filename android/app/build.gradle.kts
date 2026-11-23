plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "tv.mackey.launcher"
    compileSdk = 35

    defaultConfig {
        applicationId = "tv.mackey.launcher"
        minSdk = 26
        targetSdk = 35
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1.0." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
        buildConfigField("String", "STORE_URL", "\"https://mackeytv.vercel.app/\"")
    }

    // One fixed key so every new build installs over the last one.
    signingConfigs {
        create("family") {
            storeFile = file("mackeytv.keystore")
            storePassword = "mackeytv"
            keyAlias = "mackeytv"
            keyPassword = "mackeytv"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("family")
        }
    }
    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
