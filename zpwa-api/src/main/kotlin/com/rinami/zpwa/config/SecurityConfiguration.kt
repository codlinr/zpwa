package com.rinami.zpwa.config

import org.slf4j.LoggerFactory
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.web.SecurityFilterChain


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
@Configuration
@EnableWebSecurity
class SecurityConfiguration {

  companion object {
    private val log = LoggerFactory.getLogger(SecurityConfiguration::class.java)
  }

  @Bean
  fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
    http
      .authorizeHttpRequests { authorize ->
        authorize
          .requestMatchers("/system/**").permitAll()
          .anyRequest().authenticated()
      }
      .httpBasic { }
      .csrf { it.disable() }
      .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }

    return http.build()
  }
}