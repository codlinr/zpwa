plugins {
  id("org.springframework.boot")
  id("io.spring.dependency-management")
  kotlin("jvm")
  kotlin("plugin.spring")
}

dependencies {
  implementation("org.springframework.boot", "spring-boot-starter")
  implementation("org.springframework.boot", "spring-boot-starter-security")
  implementation("org.springframework.boot", "spring-boot-starter-web")
  implementation("org.springframework.boot", "spring-boot-starter-json")
  implementation("org.springframework.boot", "spring-boot-starter-cache")
  implementation("org.springdoc", "springdoc-openapi-starter-webmvc-ui", LibraryVersions.SPRING_DOC)
  implementation("org.jetbrains.kotlinx", "kotlinx-coroutines-core", LibraryVersions.KOTLIN_COROUTINES)
  implementation("org.jetbrains.kotlinx", "kotlinx-coroutines-reactor", LibraryVersions.KOTLIN_COROUTINES)
  implementation("org.jetbrains.kotlinx", "kotlinx-coroutines-reactive", LibraryVersions.KOTLIN_COROUTINES)
  implementation("io.projectreactor.kotlin", "reactor-kotlin-extensions", LibraryVersions.KOTLIN_REACTOR)
  implementation("org.jetbrains.kotlin", "kotlin-reflect", LibraryVersions.KOTLIN_REFLECT)
  implementation("ch.qos.logback", "logback-core", LibraryVersions.LOGBACK)
  implementation("ch.qos.logback", "logback-classic", LibraryVersions.LOGBACK)
  implementation("org.slf4j", "slf4j-api", LibraryVersions.SLF4J)
  implementation("org.slf4j", "jcl-over-slf4j", LibraryVersions.SLF4J)
  implementation("tools.jackson.core", "jackson-core", LibraryVersions.JACKSON)
  implementation("tools.jackson.core", "jackson-databind", LibraryVersions.JACKSON)
  implementation("tools.jackson.dataformat", "jackson-dataformat-yaml", LibraryVersions.JACKSON)
  implementation("tools.jackson.module", "jackson-module-kotlin", LibraryVersions.JACKSON)
  implementation("com.github.ben-manes.caffeine", "caffeine", LibraryVersions.CAFFEINE)
}

tasks.register<Delete>("cleanLocal") {
  outputs.upToDateWhen { false }
  delete("$rootDir/zpwa-docker/src/local/api/stage")
}

tasks.register<Copy>("assembleLocal") {
  dependsOn(tasks.bootJar, tasks.getByName("cleanLocal"))
  outputs.upToDateWhen { false }
  into("$rootDir/zpwa-docker/src/local")
  from("${layout.buildDirectory.asFile.get()}/libs/zpwa-api-${BuildConfig.APP_VERSION}.jar") {
    into("api/stage")
    rename("zpwa-api-(.*).jar", "api.jar")
  }
}
