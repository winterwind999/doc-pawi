package expo.modules.docpawinative

import java.io.File
import java.nio.ByteBuffer
import java.security.MessageDigest
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec
import kotlin.experimental.xor

object Hashing {
  /** Streaming SHA-256 so multi-gigabyte model files never load into memory. */
  fun sha256File(file: File): String {
    if (!file.exists()) throw IllegalArgumentException("File not found: ${file.name}")
    val digest = MessageDigest.getInstance("SHA-256")
    val buffer = ByteArray(1024 * 1024)
    file.inputStream().use { input ->
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        digest.update(buffer, 0, read)
      }
    }
    return digest.digest().toHex()
  }

  /**
   * PBKDF2-HMAC-SHA256 (RFC 8018). Implemented on top of HmacSHA256 because the
   * `PBKDF2WithHmacSHA256` SecretKeyFactory is unavailable before API 26 (minSdk is 24).
   */
  fun pbkdf2Sha256(password: String, salt: ByteArray, iterations: Int, keyLength: Int): ByteArray {
    require(password.isNotEmpty()) { "Password must not be empty" }
    require(iterations in 1..5_000_000) { "Invalid iteration count" }
    require(keyLength in 1..128) { "Invalid key length" }
    val mac = Mac.getInstance("HmacSHA256")
    mac.init(SecretKeySpec(password.toByteArray(Charsets.UTF_8), "HmacSHA256"))
    val hLen = mac.macLength
    val blocks = (keyLength + hLen - 1) / hLen
    val output = ByteArray(keyLength)
    var offset = 0
    for (block in 1..blocks) {
      mac.update(salt)
      mac.update(ByteBuffer.allocate(4).putInt(block).array())
      var u = mac.doFinal()
      val t = u.copyOf()
      for (i in 2..iterations) {
        u = mac.doFinal(u)
        for (k in t.indices) t[k] = t[k] xor u[k]
      }
      val n = minOf(hLen, keyLength - offset)
      System.arraycopy(t, 0, output, offset, n)
      offset += n
    }
    return output
  }
}
