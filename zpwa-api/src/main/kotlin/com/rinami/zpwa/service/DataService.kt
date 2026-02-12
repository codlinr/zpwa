package com.rinami.zpwa.service

import com.rinami.zpwa.config.CacheConfiguration
import com.rinami.zpwa.element.BranchListHandle
import com.rinami.zpwa.element.Equipment
import com.rinami.zpwa.element.WorkOrder
import com.rinami.zpwa.element.WorkOrderStatus
import org.slf4j.LoggerFactory
import org.springframework.cache.annotation.CachePut
import org.springframework.cache.annotation.Cacheable
import org.springframework.stereotype.Service
import kotlin.collections.sorted


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
@Service
class DataService {

  companion object {
    private val log = LoggerFactory.getLogger(DataService::class.java)
  }

  @CachePut(value = [CacheConfiguration.BRANCH_HANDLE_CACHE], key = "#handle")
  suspend fun generateHandle(handle: String, branch: String, recordSize: Int): BranchListHandle {
    log.debug("[generateHandle] Generating branch handle for {}", handle)
    return BranchListHandle(
        handle = handle,
        branch = branch,
        recordSize = recordSize
    )
  }

  @Cacheable(value = [CacheConfiguration.BRANCH_HANDLE_CACHE], key = "#handle", unless = "#result == null")
  suspend fun getHandle(handle: String): BranchListHandle? {
    log.debug("[getHandle] Retrieving unknown branch handle {}", handle)
    return null
  }

  @Cacheable(value = [CacheConfiguration.EQUIPMENT_CACHE], key = "#branch")
  suspend fun getEquipmentList(branch: String, recordSize: Int): List<Equipment> {
    return generateRandomEquipmentList(branch, recordSize)
  }

  private suspend fun generateRandomEquipmentList(branch: String, recordSize: Int): List<Equipment> {
    val rangeStart = branch.hashCode()
    val rangeEnd = rangeStart + (recordSize * 10)
    val assetNumbers = (rangeStart until rangeEnd).shuffled().take(recordSize)

    return assetNumbers.map { assetNumber ->
      Equipment(
          assetNumber = assetNumber.toLong(),
          unitNumber = "Unit $assetNumber",
          serialNumber = "SN$assetNumber",
          description = "Equipment $assetNumber",
          branch = branch
      )
    }.sorted()
  }

  @CachePut(value = [CacheConfiguration.WORK_ORDER_CACHE], key = "#branch")
  suspend fun generateWorkOrderList(branch: String, equipmentList: List<Equipment>, recordSize: Int): List<WorkOrder> {
    log.debug("[generateWorkOrderList] Generating work order list for branch {}", branch)

    return (1..recordSize).map { index ->
      val equipment = equipmentList.random()
      WorkOrder(
          orderNumber = index + (branch.hashCode() * 1000),
          description = "Work Order ${index + (branch.hashCode() * 1000)}",
          branch = branch,
          assetNumber = equipment.assetNumber,
          status = when (index % 3) {
            0 -> WorkOrderStatus.IN_PROGRESS
            1 -> WorkOrderStatus.ON_HOLD
            else -> WorkOrderStatus.PLANNED
          }
      )
    }.sorted()
  }

  @Cacheable(value = [CacheConfiguration.WORK_ORDER_CACHE], key = "#branch", unless = "#result == null")
  suspend fun getWorkOrderList(branch: String): List<WorkOrder>? {
    log.debug("[getWorkOrderList] Retrieving unknown work order list for branch {}", branch)
    return null
  }
}