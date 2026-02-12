plugins {
  kotlin("jvm") version LibraryVersions.KOTLIN apply false
  kotlin("plugin.spring") version LibraryVersions.KOTLIN apply false
  id("org.springframework.boot") version LibraryVersions.SPRING_BOOT apply false
  id("io.spring.dependency-management") version LibraryVersions.SPRING_DEPENDENCIES apply false
}

allprojects {
  group = BuildConfig.APP_GROUP
  version = BuildConfig.APP_VERSION

  repositories {
    mavenCentral()
    google()
  }
}

tasks.wrapper {
  gradleVersion = "9.3.1"
  distributionType = Wrapper.DistributionType.ALL
}
