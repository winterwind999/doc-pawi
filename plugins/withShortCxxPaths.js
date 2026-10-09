const { withSettingsGradle } = require('expo/config-plugins');

/**
 * Windows-only native build fixes (no effect on macOS/Linux or EAS Build):
 *
 * 1. Short CMake staging paths. Libraries stage CMake files under
 *    `node_modules/<lib>/android/.cxx/...`; with a long project path the deepest prefab files
 *    exceed the 260-character MAX_PATH limit, ninja cannot stat them, and the build loops with
 *    "manifest 'build.ninja' still dirty after 100 tries". Staging moves to %LOCALAPPDATA%\dpcxx.
 *
 * 2. Bounded C++ parallelism. Ninja otherwise runs one clang per CPU core; llama.rn's JSI
 *    sources need ~1–2 GB each, which exhausted memory on a 16 GB machine ("LLVM ERROR: out of
 *    memory"). A CMake job pool limits concurrent compiles (DOC_PAWI_CXX_JOBS, default 2).
 *
 * Registered in settings.gradle so it applies before any project is evaluated.
 */
const MARKER = '// doc-pawi: Windows native build settings';

const SNIPPET = `
${MARKER}
if (System.getProperty('os.name').toLowerCase().contains('windows')) {
  def dpShortCxxRoot = new File(System.getenv('LOCALAPPDATA') ?: System.getProperty('java.io.tmpdir'), 'dpcxx')
  def dpCxxJobs = (System.getenv('DOC_PAWI_CXX_JOBS') ?: '2')
  gradle.beforeProject { sub ->
    ['com.android.library', 'com.android.application'].each { pluginId ->
      sub.plugins.withId(pluginId) {
        sub.android.externalNativeBuild.cmake.buildStagingDirectory = new File(dpShortCxxRoot, sub.name)
        sub.android.defaultConfig.externalNativeBuild.cmake.arguments(
          "-DCMAKE_JOB_POOLS=dp_compile=\${dpCxxJobs}",
          "-DCMAKE_JOB_POOL_COMPILE=dp_compile"
        )
      }
    }
  }
}
`;

module.exports = function withShortCxxPaths(config) {
  return withSettingsGradle(config, (mod) => {
    if (!mod.modResults.contents.includes(MARKER)) {
      mod.modResults.contents += SNIPPET;
    }
    return mod;
  });
};
