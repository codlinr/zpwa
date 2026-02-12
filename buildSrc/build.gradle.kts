@file:Suppress("UnstableApiUsage")

import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinCompile

plugins {
  `kotlin-dsl`
}

repositories {
  mavenCentral()
  google()
}

tasks.withType<JavaCompile>().configureEach {
  sourceCompatibility = "21"
  targetCompatibility = "21"

  options.compilerArgs = listOf("-Xjsr305=strict", "-java-parameters")
}

tasks.withType<KotlinCompile>().configureEach {
  compilerOptions {
    jvmTarget.set(JvmTarget.JVM_21)
    freeCompilerArgs.set(listOf("-Xjsr305=strict", "-java-parameters"))
  }
}

tasks.named<UpdateDaemonJvm>("updateDaemonJvm") {
  languageVersion = JavaLanguageVersion.of(21)
}