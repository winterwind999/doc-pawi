package expo.modules.docpawinative

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayInputStream
import java.io.File
import java.util.concurrent.TimeUnit
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

data class OcrPage(val index: Int, val text: String, val width: Int, val height: Int)

/**
 * On-device OCR with the bundled ML Kit Text Recognition v2 Latin model (no model download, no
 * network). Lines are regrouped into visual rows so table-like lab reports keep each test name
 * next to its value, unit, and reference range.
 */
object DocumentOcr {
  const val ENGINE = "Google ML Kit Text Recognition v2 (Latin script, bundled on-device model)"
  private const val MAX_IMAGE_DIMENSION = 3000
  private const val TARGET_PDF_DIMENSION = 2400f

  private val recognizer by lazy { TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS) }

  fun recognizeImage(bytes: ByteArray): OcrPage {
    val bitmap = decodeScaled(bytes) ?: throw VaultException("The image could not be decoded.")
    try {
      val rotation = exifRotation(bytes)
      val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, rotation)), 90, TimeUnit.SECONDS)
      val rotated = rotation == 90 || rotation == 270
      return OcrPage(
        0,
        layoutText(result),
        if (rotated) bitmap.height else bitmap.width,
        if (rotated) bitmap.width else bitmap.height,
      )
    } finally {
      bitmap.recycle()
    }
  }

  /** Renders up to `maxPages` PDF pages to white bitmaps and runs OCR on each. */
  fun recognizePdf(file: File, maxPages: Int): Pair<List<OcrPage>, Int> {
    ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { pfd ->
      val renderer = try {
        PdfRenderer(pfd)
      } catch (e: Exception) {
        throw VaultException("The PDF could not be opened (it may be password-protected or damaged).")
      }
      renderer.use {
        val pageCount = renderer.pageCount
        val pages = ArrayList<OcrPage>()
        for (i in 0 until min(pageCount, maxPages)) {
          renderer.openPage(i).use { page ->
            val scale = min(3f, TARGET_PDF_DIMENSION / max(page.width, page.height))
            val w = max(1, (page.width * scale).toInt())
            val h = max(1, (page.height * scale).toInt())
            val bitmap = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            try {
              bitmap.eraseColor(Color.WHITE)
              page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              val result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 90, TimeUnit.SECONDS)
              pages.add(OcrPage(i, layoutText(result), w, h))
            } finally {
              bitmap.recycle()
            }
          }
        }
        return pages to pageCount
      }
    }
  }

  private fun decodeScaled(bytes: ByteArray): Bitmap? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (max(bounds.outWidth, bounds.outHeight) / sample > MAX_IMAGE_DIMENSION) sample *= 2
    return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
  }

  private fun exifRotation(bytes: ByteArray): Int = try {
    when (ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90 -> 90
      ExifInterface.ORIENTATION_ROTATE_180 -> 180
      ExifInterface.ORIENTATION_ROTATE_270 -> 270
      else -> 0
    }
  } catch (e: Exception) {
    0
  }

  private data class Item(val left: Int, val top: Int, val bottom: Int, val text: String) {
    val center get() = (top + bottom) / 2.0
    val height get() = (bottom - top).coerceAtLeast(1)
  }

  /** Groups recognized lines into rows by vertical overlap, then orders each row left-to-right. */
  internal fun layoutText(result: Text): String {
    val items = result.textBlocks.flatMap { block ->
      block.lines.mapNotNull { line ->
        val box = line.boundingBox ?: return@mapNotNull null
        Item(box.left, box.top, box.bottom, line.text.trim())
      }
    }.filter { it.text.isNotEmpty() }
    if (items.isEmpty()) return result.text.trim()

    val rows = ArrayList<MutableList<Item>>()
    for (item in items.sortedBy { it.center }) {
      val row = rows.lastOrNull()
      if (row != null) {
        val rowCenter = row.sumOf { it.center } / row.size
        val rowHeight = row.sumOf { it.height }.toDouble() / row.size
        if (abs(item.center - rowCenter) <= 0.5 * max(rowHeight, item.height.toDouble())) {
          row.add(item)
          continue
        }
      }
      rows.add(mutableListOf(item))
    }
    return rows.joinToString("\n") { row -> row.sortedBy { it.left }.joinToString("   ") { it.text } }.trim()
  }
}
