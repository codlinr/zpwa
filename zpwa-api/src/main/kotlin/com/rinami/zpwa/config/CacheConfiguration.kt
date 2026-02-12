package com.rinami.zpwa.config

import com.github.benmanes.caffeine.cache.Caffeine
import com.github.benmanes.caffeine.cache.Scheduler
import org.springframework.cache.CacheManager
import org.springframework.cache.annotation.EnableCaching
import org.springframework.cache.caffeine.CaffeineCacheManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import java.util.concurrent.Executors


/**
 * To be defined
 *
 * ### Purpose
 *
 * To be defined
 *
 * @author Rinami Pty Ltd
 * @since 1.0.0
 */
@Configuration(proxyBeanMethods = false)
@EnableCaching
class CacheConfiguration {

  companion object {
    private val log = org.slf4j.LoggerFactory.getLogger(CacheConfiguration::class.java)

    const val EQUIPMENT_CACHE = "equipmentCache"
    const val WORK_ORDER_CACHE = "workOrderCache"
    const val BRANCH_HANDLE_CACHE = "branchHandleCache"
  }

  @Bean
  fun cacheManager(): CacheManager {
    log.debug("[cacheManager] Initializing cache manager")
    val cacheManager = CaffeineCacheManager(EQUIPMENT_CACHE, WORK_ORDER_CACHE, BRANCH_HANDLE_CACHE)
    cacheManager.setCaffeine(
        Caffeine.newBuilder()
          .expireAfterWrite(java.time.Duration.ofMinutes(20))
          .maximumSize(10000)
          .scheduler(Scheduler.forScheduledExecutorService(Executors.newSingleThreadScheduledExecutor()))

    )
    return cacheManager
  }
}