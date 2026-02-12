pluginManagement {
  repositories {
    mavenLocal()
    mavenCentral()
    gradlePluginPortal()
    maven {
      url = uri("https://repo.spring.io/milestone")
    }
  }
}

rootProject.name = "ZPWA"

val projectDirectories = rootDir.listFiles { file ->
  when {
    !file.isDirectory -> false
    file.name == "buildSrc" -> false
    else -> File(file, "build.gradle.kts").isFile
  }
}?.toList() ?: emptyList()

projectDirectories.forEach { include(":${it.name}") }