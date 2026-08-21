package pro.fileforge.app

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Bundle
import java.io.File

class XapkInstallReceiver : BroadcastReceiver() {
    companion object {
        const val EXTRA_SESSION_ID = "session_id"
        const val EXTRA_STAGE_DIR = "stage_dir"
        const val EXTRA_OBB_COUNT = "obb_count"
        const val EXTRA_PACKAGE_NAME = "package_name"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)
        val stageDir = intent.getStringExtra(EXTRA_STAGE_DIR)
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT)
            if (confirm != null) {
                confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(confirm)
            }
            return
        }
        if (status == PackageInstaller.STATUS_SUCCESS) {
            val packageName = intent.getStringExtra(EXTRA_PACKAGE_NAME)
            if (!packageName.isNullOrBlank() && !stageDir.isNullOrBlank()) {
                val obbRoot = File(android.os.Environment.getExternalStorageDirectory(), "Android/obb/$packageName")
                val stagedObb = File(stageDir, "obb")
                if (stagedObb.isDirectory) {
                    stagedObb.walkTopDown().filter { it.isFile }.forEach { file ->
                        val relative = file.relativeTo(stagedObb).path
                        val target = File(obbRoot, relative)
                        target.parentFile?.mkdirs()
                        runCatching { file.copyTo(target, overwrite = true) }
                    }
                }
            }
        }
        if (!stageDir.isNullOrBlank()) File(stageDir).deleteRecursively()
    }
}
