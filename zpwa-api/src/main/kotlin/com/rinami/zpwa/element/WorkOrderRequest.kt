package com.rinami.zpwa.element

import io.swagger.v3.oas.annotations.media.Schema
import java.io.Serializable

@Schema(description = "Request to create a work order")
data class WorkOrderRequest(
    @param:Schema(description = "Branch code", example = "NZ01")
    val branch: String,

    @param:Schema(description = "Asset number", example = "123456")
    val assetNumber: Long,

    @param:Schema(description = "Work order description")
    val description: String) : Serializable