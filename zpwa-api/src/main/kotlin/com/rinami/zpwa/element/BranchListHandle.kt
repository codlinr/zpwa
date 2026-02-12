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
data class BranchListHandle(
    val handle: String,
    val branch: String,
    var recordSize: Int
) : Serializable