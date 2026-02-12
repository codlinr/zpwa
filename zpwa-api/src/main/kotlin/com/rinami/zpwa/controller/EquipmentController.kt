package com.rinami.zpwa.controller

import com.rinami.zpwa.config.ApplicationConfiguration
import com.rinami.zpwa.element.EquipmentPage
import com.rinami.zpwa.service.DataService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import java.util.*
import kotlin.random.Random


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
@RequestMapping("/equipment")
@Tag(name = "Equipment", description = "Operations for equipment master data")
@SecurityRequirement(name = "basicAuth")
class EquipmentController(
    private val dataService: DataService,
) {

  companion object {
    private val log = LoggerFactory.getLogger(EquipmentController::class.java)
    private val transactionLogger = LoggerFactory.getLogger(ApplicationConfiguration.TRANSACTION_LOGGER)
    private const val PAGE_SIZE: Int = 1000
  }


  @GetMapping(
      "/list",
      produces = [MediaType.APPLICATION_JSON_VALUE])
  @Operation(
      summary = "Retrieve a paginated equipment list",
      description = """Returns a paginated list of equipment records for a given branch. 
On the first call, provide the `branch` parameter to generate a new list handle. 
On subsequent calls, use the returned `handle` to fetch additional pages. 
Each page contains up to 1000 records."""
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "200",
            description = "Equipment page retrieved successfully",
            content = [Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = EquipmentPage::class)
            )]
        ),
        ApiResponse(
            responseCode = "400",
            description = "Neither branch nor handle was provided, or the requested page exceeds the record size",
            content = [Content()]
        ),
        ApiResponse(
            responseCode = "404",
            description = "The provided handle was not found",
            content = [Content()]
        )
      ]
  )
  suspend fun getEquipmentList(
      @Parameter(description = "Branch code to generate a new equipment list for", example = "NZ01")
      @RequestParam("branch", required = false) branch: String?,
      @Parameter(description = "Handle returned from a previous request, used to retrieve subsequent pages")
      @RequestParam("handle", required = false) handle: String?,
      @Parameter(description = "Page number to retrieve (1-based)", example = "1")
      @RequestParam("page", required = false) page: Int = 1,
  ): ResponseEntity<EquipmentPage> {

    log.debug("[getEquipmentList] Getting equipment list for branch {}, handle {}, page {}", branch, handle, page)


    val equipmentListHandle = if (handle.isNullOrBlank()) {
      if (branch.isNullOrBlank()) {
        transactionLogger.info("Requested equipment list without branch or handle")
        return ResponseEntity.badRequest().build()
      } else {
        this.dataService.generateHandle(UUID.randomUUID().toString(), branch, Random.nextInt(60000, 100000))
      }
    } else {
      this.dataService.getHandle(handle) ?: run {
        transactionLogger.info("Requested unknown equipment list handle {}", handle)
        return ResponseEntity.notFound().build()
      }
    }


    if (page < 1 || (page * PAGE_SIZE) >= equipmentListHandle.recordSize) {
      transactionLogger.info("Requested page {} of equipment list exceeds record size {}", page, equipmentListHandle.recordSize)
      return ResponseEntity.badRequest().build()
    }

    val equipmentList = this.dataService.getEquipmentList(equipmentListHandle.branch, equipmentListHandle.recordSize)
    val fromIndex = (page - 1) * PAGE_SIZE
    val toIndex = minOf(fromIndex + PAGE_SIZE, equipmentList.size)
    val equipmentRecords = equipmentList.subList(fromIndex, toIndex)

    transactionLogger.info(
        "Retrieved {} of {} equipment records for branch {} page {}",
        equipmentRecords.size, equipmentList.size, equipmentListHandle.branch, page)

    return ResponseEntity.ok(
        EquipmentPage(
            handle = equipmentListHandle.handle,
            pageSize = PAGE_SIZE,
            recordSize = equipmentList.size,
            pageNumber = page,
            records = equipmentRecords
        )
    )
  }


}