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
@Schema(description = "Work order list page")
data class WorkOrderPage(
    @param:Schema(description = "Handle for retrieving subsequent pages")
    val handle: String,

    @param:Schema(description = "Number of records per page")
    val pageSize: Int,

    @param:Schema(description = "Total number of records available")
    val recordSize: Int,

    @param:Schema(description = "Current page number")
    val pageNumber: Int,

    @param:Schema(description = "List of work order records")
    val records: List<WorkOrder>
) : Serializable