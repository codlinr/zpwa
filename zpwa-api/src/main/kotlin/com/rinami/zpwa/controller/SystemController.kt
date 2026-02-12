package com.rinami.zpwa.controller

import com.rinami.zpwa.element.SystemState
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.MediaType
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController


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
@RestController
@RequestMapping("/system")
@Tag(name = "System", description = "Operations for system information")
class SystemController {

  @GetMapping(
      "/state",
      produces = [MediaType.APPLICATION_JSON_VALUE])
  @Operation(
      summary = "Retrieve the system state",
      description = "Returns the current state of the system, including version information.",
      security = []
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "200",
            description = "System state retrieved successfully",
            content = [Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = SystemState::class)
            )]
        )
      ]
  )
  suspend fun getSystemState(): SystemState {
    return SystemState(
        version = "0.1.0"
    )
  }
}