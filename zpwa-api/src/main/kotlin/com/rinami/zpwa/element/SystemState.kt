package com.rinami.zpwa.element

import io.swagger.v3.oas.annotations.media.Schema
import java.io.Serializable


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
@Schema(description = "Represents the current state of the system")
data class SystemState(
    @param:Schema(description = "The current system version", example = "0.1.0")
    val version: String
) : Serializable