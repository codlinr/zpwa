package com.rinami.zpwa.element

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
data class EquipmentPage(
    val handle: String,
    val pageSize: Int,
    val recordSize: Int,
    val pageNumber: Int,
    val records: List<Equipment>
) : Serializable