import java.util.Properties

plugins {
    id("com.android.application")
    // START: FlutterFire Configuration
    id("com.google.gms.google-services")
    // END: FlutterFire Configuration
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val keystoreProperties = Properties()
val keystorePropertiesFile = rootProject.file("key.properties")
if (keystorePropertiesFile.exists()) {
    keystorePropertiesFile.inputStream().use { keystoreProperties.load(it) }
}

// Java properties retain surrounding quotes. Accept quoted or unquoted values
// for the signing path, alias and passwords.
fun keystoreValue(name: String): String? =
    keystoreProperties.getProperty(name)?.trim()?.let { value ->
        if (value.length >= 2 &&
            ((value.first() == '"' && value.last() == '"') ||
                (value.first() == '\'' && value.last() == '\''))) {
            value.substring(1, value.length - 1)
        } else {
            value
        }
    }

android {
    namespace = "com.brogrammer.onemore"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_17.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.brogrammer.onemore"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        create("release") {
            keyAlias = keystoreValue("keyAlias")
            keyPassword = keystoreValue("keyPassword")
            // Relative paths in android/key.properties resolve from android/.
            storeFile = keystoreValue("storeFile")?.let { rootProject.file(it) }
            storePassword = keystoreValue("storePassword")
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.getByName("release")
        }
    }
}

flutter {
    source = "../.."
}
