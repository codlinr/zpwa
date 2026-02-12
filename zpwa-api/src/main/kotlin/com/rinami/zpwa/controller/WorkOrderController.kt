package com.rinami.zpwa.controller


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
import com.rinami.zpwa.config.ApplicationConfiguration
import com.rinami.zpwa.element.*
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
import org.springframework.web.multipart.MultipartFile
import java.util.*
import kotlin.random.Random

@RestController
@RequestMapping("/work-orders")
@Tag(name = "Work Orders", description = "Operations for work orders")
@SecurityRequirement(name = "basicAuth") // applies to all operations in this controller
class WorkOrderController(
    private val dataService: DataService
) {

  companion object {
    private val log = LoggerFactory.getLogger(WorkOrderController::class.java)
    private val transactionLogger = LoggerFactory.getLogger(ApplicationConfiguration.TRANSACTION_LOGGER)
    private const val PAGE_SIZE: Int = 1000

    private fun formatFileSize(size: Long): String =
      when (size) {
        in 0L until 1024L -> "$size B"
        in 1024L until 1024L * 1024L -> "${size / 1024L} KB"
        else -> "${size / (1024L * 1024L)} MB"
      }
  }

  @GetMapping(
      "/list",
      produces = [MediaType.APPLICATION_JSON_VALUE])
  @Operation(
      summary = "Retrieve a paginated work order list",
      description = """Returns a paginated list of work order records for a given branch. 
On the first call, provide the `branch` parameter to generate a new list handle. 
On subsequent calls, use the returned `handle` to fetch additional pages. 
Each page contains up to 1000 records."""
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "200",
            description = "Work order page retrieved successfully",
            content = [Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = WorkOrderPage::class)
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
  suspend fun getWorkOrderList(
      @Parameter(description = "Branch code to generate a new work order list for", example = "NZ01")
      @RequestParam("branch", required = false) branch: String?,
      @Parameter(description = "Handle returned from a previous request, used to retrieve subsequent pages")
      @RequestParam("handle", required = false) handle: String?,
      @Parameter(description = "Page number to retrieve (1-based)", example = "1")
      @RequestParam("page", required = false) page: Int = 1): ResponseEntity<WorkOrderPage> {

    log.debug("[getWorkOrderList] Requesting work order list for branch {}, handle {}, page {}", branch, handle, page)

    val workOrderListHandle = if (handle.isNullOrBlank()) {
      if (branch.isNullOrBlank()) {
        transactionLogger.info("Requested work order list without branch or handle")
        return ResponseEntity.badRequest().build()
      } else {
        this.dataService.generateHandle(UUID.randomUUID().toString(), branch, Random.nextInt(60000, 100000))
      }
    } else {
      this.dataService.getHandle(handle) ?: run {
        transactionLogger.info("Requested unknown work order list handle {}", handle)
        return ResponseEntity.notFound().build()
      }
    }

    if (page < 1 ||(page * PAGE_SIZE) >= workOrderListHandle.recordSize) {
      transactionLogger.info(
          "Requested page {} of work order list for branch {} exceeds record size {}",
          page, workOrderListHandle.branch, workOrderListHandle.recordSize)
      return ResponseEntity.badRequest().build()
    }

    val workOrderList = this.dataService.getWorkOrderList(workOrderListHandle.branch)
      ?: this.dataService.generateWorkOrderList(
          branch = workOrderListHandle.branch,
          equipmentList = this.dataService.getEquipmentList(workOrderListHandle.branch, Random.nextInt(60000, 100000)),
          recordSize = workOrderListHandle.recordSize)

    val fromIndex = (page - 1) * PAGE_SIZE
    val toIndex = minOf(fromIndex + PAGE_SIZE, workOrderList.size)
    val workOrderRecords = workOrderList.subList(fromIndex, toIndex)

    transactionLogger.info(
        "Retrieved {} of {} work order records for branch {} page {}",
        workOrderRecords.size, workOrderList.size, workOrderListHandle.branch, page)

    return ResponseEntity.ok(
        WorkOrderPage(
            handle = workOrderListHandle.handle,
            pageSize = PAGE_SIZE,
            recordSize = workOrderList.size,
            pageNumber = page,
            records = workOrderRecords
        )
    )
  }

  @PostMapping(
      "",
      consumes = [MediaType.APPLICATION_JSON_VALUE],
      produces = [MediaType.APPLICATION_JSON_VALUE])
  @Operation(
      summary = "Create a new work order",
      description = "Creates a new work order based on the provided request data."
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "200",
            description = "Work order created successfully",
            content = [Content(
                mediaType = MediaType.APPLICATION_JSON_VALUE,
                schema = Schema(implementation = WorkOrder::class)
            )]
        )
      ]
  )
  suspend fun createWorkOrder(@RequestBody request: WorkOrderRequest): WorkOrder {

    log.debug("[createWorkOrder] Creating work order {}:{}", request.assetNumber, request.description)
    val workOrder = WorkOrder(
        orderNumber = Random.nextInt(100000),
        description = request.description,
        branch = request.branch,
        assetNumber = request.assetNumber,
        status = WorkOrderStatus.PLANNED
    )

    transactionLogger.info("Created work order {} {}:{}", workOrder.orderNumber, workOrder.assetNumber, workOrder.description)
    return workOrder
  }

  @PatchMapping("/status/{orderNumber}")
  @Operation(
      summary = "Update work order status",
      description = "Updates the status of an existing work order."
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "202",
            description = "Work order status update accepted",
            content = [Content()]
        )
      ]
  )
  suspend fun updateWorkOrderStatus(
      @Parameter(description = "The order number of the work order to update", example = "10001")
      @PathVariable orderNumber: Int,
      @Parameter(description = "The new status for the work order")
      @RequestParam("status", required = true) status: WorkOrderStatus): ResponseEntity<Void> {

    log.debug("[updateWorkOrderStatus] Updating work order {} status to {}", orderNumber, status)
    transactionLogger.info("Updated work order {} status to {}", orderNumber, status)
    return ResponseEntity.accepted().build()
  }

  @PostMapping(
      "/image/{orderNumber}",
      consumes = [MediaType.MULTIPART_FORM_DATA_VALUE])
  @Operation(
      summary = "Update work order image",
      description = "Uploads and associates an image with the specified work order."
  )
  @ApiResponses(
      value = [
        ApiResponse(
            responseCode = "202",
            description = "Work order image update accepted",
            content = [Content()]
        )
      ]
  )
  suspend fun updateWorkOrderImage(
      @Parameter(description = "The order number of the work order to update", example = "10001")
      @PathVariable orderNumber: Int,
      @Parameter(description = "The image file to upload")
      @RequestPart imageFile: MultipartFile): ResponseEntity<Void> {

    log.debug("[updateWorkOrderImage] Add work order {} image {}", orderNumber, imageFile.originalFilename)
    transactionLogger.info(
        "Added work order {} image {} of size {}",
        orderNumber, imageFile.originalFilename, formatFileSize(imageFile.size))
    return ResponseEntity.accepted().build()
  }

}