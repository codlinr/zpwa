package com.rinami.zpwa

import io.swagger.v3.oas.annotations.OpenAPIDefinition
import io.swagger.v3.oas.annotations.enums.SecuritySchemeType
import io.swagger.v3.oas.annotations.info.Info
import io.swagger.v3.oas.annotations.info.License
import io.swagger.v3.oas.annotations.security.SecurityScheme
import io.swagger.v3.oas.annotations.servers.Server
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication


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
@SpringBootApplication
@OpenAPIDefinition(
    info = Info(title = "Z-PWA API",
                version = "0.1.0",
                description = "Z-PWA Test API",
                license = License(
                    name = "Apache 2.0",
                    url = "https://www.apache.org/licenses/LICENSE-2.0.html"
                )),
    servers = [Server(
        url = "http://localhost:8080/api",
        description = "Local development server"
    )]
)
@SecurityScheme(
    name = "basicAuth",
    type = SecuritySchemeType.HTTP,
    scheme = "basic",
    description = "HTTP Basic Authentication. Provide your username and password."
)
class Application

fun main(args: Array<String>) {
  runApplication<Application>(*args)
}