package com.rinami.zpwa.element

import com.fasterxml.jackson.annotation.JsonCreator
import com.fasterxml.jackson.annotation.JsonValue
import io.swagger.v3.oas.annotations.media.Schema
import java.util.Locale.getDefault

@Schema(description = "Status of the work order")
enum class WorkOrderStatus {
  PLANNED,
  IN_PROGRESS,
  ON_HOLD,
  COMPLETED;

  @JsonValue
  fun value() = name

  companion object {
    @JsonCreator
    fun get(value: String) = valueOf(value.uppercase(getDefault()))
  }
}