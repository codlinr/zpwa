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
@Schema(description = "Work order record")
data class WorkOrder(
    @param:Schema(description = "Order number", example = "10001")
    val orderNumber: Int,

    @param:Schema(description = "Work order description")
    val description: String,

    @param:Schema(description = "Work order branch")
    val branch: String,

    @param:Schema(description = "Asset number", example = "123456")
    val assetNumber: Long,

    @param:Schema(description = "Work order status")
    val status: WorkOrderStatus) : Serializable, Comparable<WorkOrder> {
  override fun compareTo(other: WorkOrder): Int {
    return this.orderNumber.compareTo(other.orderNumber)
  }
}