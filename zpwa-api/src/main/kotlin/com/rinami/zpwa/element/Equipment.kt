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
@Schema(description = "Equipment master record")
data class Equipment(
    @param:Schema(description = "Asset number", example = "123456")
    val assetNumber: Long,

    @param:Schema(description = "Unit number", example = "Unit 123456")
    val unitNumber: String,

    @param:Schema(description = "Serial number", example = "SN123456")
    val serialNumber: String,

    @param:Schema(description = "Equipment description")
    val description: String,

    @param:Schema(description = "Equipment branch")
    val branch: String,
) : Serializable, Comparable<Equipment> {
  override fun compareTo(other: Equipment): Int {
    return this.assetNumber.compareTo(other.assetNumber)
  }
}