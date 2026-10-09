package expo.modules.docpawinative

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.ByteArrayOutputStream
import java.io.DataInputStream
import java.io.EOFException
import java.io.File
import java.io.FileOutputStream
import java.io.InputStream
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Document vault encryption.
 *
 * File format: "DPV1" magic (4 bytes) | IV (12 bytes) | AES-256-GCM ciphertext with 128-bit tag.
 * Keys are generated inside the Android Keystore (non-exportable), one alias per profile, so
 * deleting the alias makes that profile's documents unrecoverable (crypto-erasure).
 */
object VaultCrypto {
  private const val KEYSTORE = "AndroidKeyStore"
  private const val TRANSFORMATION = "AES/GCM/NoPadding"
  private val MAGIC = byteArrayOf('D'.code.toByte(), 'P'.code.toByte(), 'V'.code.toByte(), '1'.code.toByte())
  private const val IV_LENGTH = 12
  private const val TAG_BITS = 128
  private const val CHUNK = 64 * 1024
  const val MAX_PLAINTEXT_BYTES = 25L * 1024 * 1024

  private fun keyStore(): KeyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }

  private fun getOrCreateKey(alias: String): SecretKey {
    val ks = keyStore()
    (ks.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build(),
    )
    return generator.generateKey()
  }

  private fun existingKey(alias: String): SecretKey {
    val entry = keyStore().getEntry(alias, null) as? KeyStore.SecretKeyEntry
      ?: throw VaultException("The document key for this profile is missing; the file cannot be decrypted.")
    return entry.secretKey
  }

  fun deleteKey(alias: String): Boolean {
    val ks = keyStore()
    if (!ks.containsAlias(alias)) return false
    ks.deleteEntry(alias)
    return true
  }

  /** Encrypts `input` into `dest`, returning the plaintext size and SHA-256 (hex). */
  fun encrypt(input: InputStream, dest: File, alias: String): Pair<Long, String> {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey(alias))
    val iv = cipher.iv
    require(iv.size == IV_LENGTH) { "Unexpected IV length ${iv.size}" }
    val digest = MessageDigest.getInstance("SHA-256")
    dest.parentFile?.mkdirs()
    val tmp = File(dest.parentFile, "${dest.name}.tmp")
    var total = 0L
    try {
      FileOutputStream(tmp).use { out ->
        out.write(MAGIC)
        out.write(iv)
        val buffer = ByteArray(CHUNK)
        while (true) {
          val read = input.read(buffer)
          if (read < 0) break
          total += read
          if (total > MAX_PLAINTEXT_BYTES) {
            throw VaultException("The file is larger than the 25 MB limit for documents.")
          }
          digest.update(buffer, 0, read)
          cipher.update(buffer, 0, read)?.let { out.write(it) }
        }
        out.write(cipher.doFinal())
        out.fd.sync()
      }
      if (!tmp.renameTo(dest)) throw VaultException("Could not finalize the encrypted file.")
    } catch (e: Exception) {
      tmp.delete()
      throw e
    }
    return total to digest.digest().toHex()
  }

  /** Decrypts a vault file fully into memory (documents are capped at 25 MB). */
  fun decryptToBytes(src: File, alias: String): ByteArray {
    if (!src.exists()) throw VaultException("The encrypted document file is missing.")
    DataInputStream(src.inputStream().buffered()).use { input ->
      val magic = ByteArray(4)
      val iv = ByteArray(IV_LENGTH)
      try {
        input.readFully(magic)
        input.readFully(iv)
      } catch (e: EOFException) {
        throw VaultException("The document file is truncated.")
      }
      if (!magic.contentEquals(MAGIC)) {
        throw VaultException("The document file is not a Doc Pawi vault file.")
      }
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, existingKey(alias), GCMParameterSpec(TAG_BITS, iv))
      val out = ByteArrayOutputStream()
      val buffer = ByteArray(CHUNK)
      while (true) {
        val read = input.read(buffer)
        if (read < 0) break
        cipher.update(buffer, 0, read)?.let { out.write(it) }
      }
      try {
        out.write(cipher.doFinal())
      } catch (e: javax.crypto.AEADBadTagException) {
        throw VaultException("The document failed its integrity check (it may be corrupted).")
      }
      return out.toByteArray()
    }
  }

  fun decryptToFile(src: File, dest: File, alias: String) {
    val bytes = decryptToBytes(src, alias)
    dest.parentFile?.mkdirs()
    FileOutputStream(dest).use { it.write(bytes) }
  }
}

class VaultException(message: String) : Exception(message)

internal fun ByteArray.toHex(): String {
  val chars = "0123456789abcdef"
  val sb = StringBuilder(size * 2)
  for (b in this) {
    val v = b.toInt() and 0xff
    sb.append(chars[v ushr 4]).append(chars[v and 0x0f])
  }
  return sb.toString()
}

internal fun String.hexToBytes(): ByteArray {
  require(length % 2 == 0) { "Hex string must have an even length" }
  return ByteArray(length / 2) { i -> substring(i * 2, i * 2 + 2).toInt(16).toByte() }
}
