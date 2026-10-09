package expo.modules.docpawinative

import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import android.os.Build
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.InputStream
import java.util.UUID

class NativeOperationException(message: String, cause: Throwable? = null) :
  CodedException("ERR_DOC_PAWI_NATIVE", message, cause)

/**
 * All heavy work runs on Dispatchers.IO so the shared Expo async-function queue (also used by
 * expo-sqlite) is never blocked by OCR, hashing, or encryption.
 */
class DocPawiNativeModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw NativeOperationException("React context is not available")

  private fun openSource(source: String): InputStream = when {
    source.startsWith("content://") || source.startsWith("file://") || source.startsWith("android.resource://") ->
      context.contentResolver.openInputStream(Uri.parse(source))
        ?: throw NativeOperationException("Could not open the selected file.")
    File(source).exists() -> FileInputStream(File(source))
    else -> openBundledResource(source)
  }

  /**
   * Release builds embed images bundled with the JS code (for example the synthetic sample report)
   * as Android resources, and expo-asset then reports the resource name instead of a file path.
   */
  private fun openBundledResource(name: String): InputStream {
    for (type in listOf("drawable", "raw")) {
      @Suppress("DiscouragedApi")
      val id = context.resources.getIdentifier(name, type, context.packageName)
      if (id != 0) return context.resources.openRawResource(id)
    }
    throw NativeOperationException("File not found: $name")
  }

  private inline fun <T> guarded(block: () -> T): T = try {
    block()
  } catch (e: CodedException) {
    throw e
  } catch (e: VaultException) {
    throw NativeOperationException(e.message ?: "Document vault error", e)
  } catch (e: OutOfMemoryError) {
    throw NativeOperationException("Not enough memory to process this file.", e)
  } catch (e: Exception) {
    throw NativeOperationException(e.message ?: e.javaClass.simpleName, e)
  }

  override fun definition() = ModuleDefinition {
    Name("DocPawiNative")

    AsyncFunction("encryptToVault") Coroutine { sourceUri: String, destPath: String, keyAlias: String ->
      withContext(Dispatchers.IO) {
        guarded {
          val (size, sha256) = openSource(sourceUri).use { input ->
            VaultCrypto.encrypt(input.buffered(), File(destPath), keyAlias)
          }
          mapOf("size" to size.toDouble(), "sha256" to sha256)
        }
      }
    }

    AsyncFunction("decryptFromVault") Coroutine { srcPath: String, destPath: String, keyAlias: String ->
      withContext(Dispatchers.IO) {
        guarded { VaultCrypto.decryptToFile(File(srcPath), File(destPath), keyAlias) }
      }
    }

    AsyncFunction("deleteVaultKey") Coroutine { keyAlias: String ->
      withContext(Dispatchers.IO) { guarded { VaultCrypto.deleteKey(keyAlias) } }
    }

    AsyncFunction("recognizeText") Coroutine { vaultPath: String, mimeType: String, keyAlias: String, maxPages: Int ->
      withContext(Dispatchers.IO) {
        guarded {
          val bytes = VaultCrypto.decryptToBytes(File(vaultPath), keyAlias)
          val (pages, pageCount) = if (mimeType == "application/pdf") {
            // PdfRenderer needs a seekable file; use a short-lived plaintext copy in the private cache.
            val tmp = File(context.cacheDir, "ocr-${UUID.randomUUID()}.pdf")
            try {
              tmp.writeBytes(bytes)
              DocumentOcr.recognizePdf(tmp, maxPages.coerceIn(1, 20))
            } finally {
              tmp.delete()
            }
          } else {
            listOf(DocumentOcr.recognizeImage(bytes)) to 1
          }
          mapOf(
            "text" to pages.joinToString("\n\n") { it.text }.trim(),
            "pages" to pages.map {
              mapOf("index" to it.index, "text" to it.text, "width" to it.width, "height" to it.height)
            },
            "pageCount" to pageCount,
            "truncated" to (pageCount > pages.size),
            "engine" to DocumentOcr.ENGINE,
          )
        }
      }
    }

    AsyncFunction("sha256File") Coroutine { path: String ->
      withContext(Dispatchers.IO) { guarded { Hashing.sha256File(File(path)) } }
    }

    AsyncFunction("pbkdf2Sha256") Coroutine { password: String, saltHex: String, iterations: Int, keyLength: Int ->
      withContext(Dispatchers.Default) {
        guarded { Hashing.pbkdf2Sha256(password, saltHex.hexToBytes(), iterations, keyLength).toHex() }
      }
    }

    Function("getDeviceProfile") {
      val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memory = ActivityManager.MemoryInfo().also { activityManager.getMemoryInfo(it) }
      mapOf(
        "manufacturer" to Build.MANUFACTURER,
        "model" to Build.MODEL,
        "androidVersion" to Build.VERSION.RELEASE,
        "sdkInt" to Build.VERSION.SDK_INT,
        "socManufacturer" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MANUFACTURER else null),
        "socModel" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else null),
        "hardware" to Build.HARDWARE,
        "supportedAbis" to Build.SUPPORTED_ABIS.toList(),
        "cpuCores" to Runtime.getRuntime().availableProcessors(),
        "totalRamBytes" to memory.totalMem.toDouble(),
        "availableRamBytes" to memory.availMem.toDouble(),
        "lowRamDevice" to activityManager.isLowRamDevice,
      )
    }
  }
}
