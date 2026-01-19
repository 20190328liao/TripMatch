using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models.DTOs;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/[controller]")]
    [ApiController]
    public class TripApiController : ControllerBase
    {
        // 直接使用類別型別
        private readonly TripServices _tripServices;

        private readonly ITagUserId _tagUserId;

        // 透過DI，給tripSerivces實體
        public TripApiController(TripServices tripServices, ITagUserId tagUserId)
        {
            _tripServices = tripServices;
            _tagUserId = tagUserId;
        }

        #region 我的行程主頁

        [HttpGet("mine")]
        [Authorize]
        public async Task<IActionResult> GetTrips()
        {
            List<Models.DTOs.TripSimpleDto> trips = await _tripServices.GetTrips(_tagUserId.UserId);
            return Ok(trips);
        }

        [HttpGet("{tripId:int}/members")]
        public async Task<IActionResult> Members(int tripId)
        {
            var user = _tagUserId.UserId.Value;
            var members = await _tripServices.GetMembersAsync(user, tripId);
            return Ok(members);
        }

        [HttpDelete("{tripId:int}")]
        public async Task<IActionResult> Delete(int tripId)
        {
            var user = _tagUserId.UserId.Value;
            try
            {
                await _tripServices.DeleteTripAsync(user, tripId);
                return Ok(new { ok = true });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
        }

        [HttpPost("{tripId:int}/leave")]
        public async Task<IActionResult> Leave(int tripId)
        {
            var user = _tagUserId.UserId.Value;
            await _tripServices.LeaveTripAsync(user, tripId);
            return Ok(new { ok = true });
        }

        #endregion

        #region 建立行程

        [HttpPost("Create")]
        public async Task<IActionResult> Create([FromBody] TripCreateDto dto)
        {
            int tripId = await _tripServices.AddTrip(_tagUserId.UserId, dto);
            return Ok(new { id = tripId });
        }

        #endregion

        #region 行程編輯相關

        [HttpGet("simple/{tripId}")]
        public async Task<IActionResult> GetTripSimple(int tripId)
        {
            TripSimpleDto? tripDetail = await _tripServices.GetTripSimple(tripId);
            if (tripDetail == null)
            {
                return NotFound();
            }
            return Ok(tripDetail);
        }

        [HttpGet("detail/{tripId}")]
        public async Task<IActionResult> GetTripDetail(int tripId)
        {
            TripDetailDto? tripDetail = await _tripServices.GetTripDetail(tripId);
            if (tripDetail == null)
            {
                return NotFound();
            }
            return Ok(tripDetail);
        }

        [HttpPost("AddAccommodation")]
        public async Task<IActionResult> AddAccommodation([FromBody] AccomadationDto dto)
        {
          
            if (dto == null)
                return BadRequest(new { message = "請求資料格式錯誤" });

            try
            {
                // 3. 呼叫 Service 執行邏輯 (這會處理 SortOrder 計算與新增)
                bool isSuccess = await _tripServices.AddAccommodation(_tagUserId.UserId, dto);

                if (isSuccess)
                {
                    // 回傳 200 OK
                    return Ok(new { message = "景點已成功加入行程" });
                }
                else
                {
                    // 可能是 TripId 或 SpotId 在資料庫找不到，回傳 400
                    return BadRequest(new { message = "新增失敗，請檢查行程或景點資訊是否正確" });
                }
            }
            catch (Exception ex)
            {
               
                // 4. 記錄 Log 並回傳 500 錯誤
                // _logger.LogError(ex, "新增行程細項時發生意外錯誤");
                return StatusCode(500, new { message = "伺服器發生錯誤，請稍後再試" });
            }
        }





        [HttpPost("AddSpotToTrip")]
        public async Task<IActionResult> AddSpotToTrip([FromBody] ItineraryItemDto dto)
        {
            Console.WriteLine("AddSpotToTrip");  
            // 1. 基礎驗證：確保 dto 不是空值
            if (dto == null)
            {
                return BadRequest(new { message = "請求資料格式錯誤" });
            }

            try
            {
                // 3. 呼叫 Service 執行邏輯 (這會處理 SortOrder 計算與新增)
                bool isSuccess = await _tripServices.TryAddSpotToTrip(_tagUserId.UserId,dto);

                if (isSuccess)
                {
                    // 回傳 200 OK
                    return Ok(new { message = "景點已成功加入行程" });
                }
                else
                {
                    // 可能是 TripId 或 SpotId 在資料庫找不到，回傳 400
                    return BadRequest(new { message = "新增失敗，請檢查行程或景點資訊是否正確" });
                }
            }
            catch (Exception)
            {
                // 4. 記錄 Log 並回傳 500 錯誤
                // _logger.LogError(ex, "新增行程細項時發生意外錯誤");
                return StatusCode(500, new { message = "伺服器發生錯誤，請稍後再試" });
            }
        }

    
        [HttpDelete("DeleteSpotFromTrip/{id}")]
        public async Task<IActionResult>  DeleteSpotFromTrip(int id)
        {
            try
            {
                if (id <= 0)
                {
                    return BadRequest("無效的 ID");
                }

                // 這裡執行刪除邏輯
                bool success = await _tripServices.DeleteSpotFromTrip(id);

                // 成功刪除通常回傳 204 No Content 或 200 OK
                return Ok(new { message = $"已成功刪除景點, SpotId = {id}"});
            }
            catch (Exception ex)
            {
                // 伺服器錯誤
                return StatusCode(500, "伺服器內部錯誤：" + ex.Message);
            }
        }

        [HttpPost("UpdateSpotTime")]
        public async Task<IActionResult> UpdateSpotTime([FromBody] SpotTimeDto dto)
        {
            try
            {
                if (dto == null || dto.Id <= 0)
                {
                    return BadRequest("無效的行程細項資料");
                }
                bool success = await _tripServices.UpdateSpotTime(dto);
                if (success)
                {
                    return Ok(new { message = "行程細項已更新" });
                }
                else
                {
                    return NotFound("找不到指定的行程細項");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, "伺服器內部錯誤：" + ex.Message);
            }
        }

        #endregion

        #region 景點探索相關

        [HttpPost("AddSnapshot")]
        public async Task<IActionResult> AddSnapshot([FromBody] PlaceSnapshotDto dto)
        {
            try
            {
                int spotId = await _tripServices.TryAddPlaceSnapshot(dto);
                if (spotId >= 0)
                {
                    return Ok(new { id = spotId });
                }
                else
                {
                    return StatusCode(500, new { message = "資料庫寫入失敗，可能資料已存在" });
                }
            }
            catch (DbUpdateException ex)
            {
                // 資料庫更新失敗（例如：違反唯一條件限制）
                return StatusCode(500, new { message = "資料庫寫入失敗，可能資料已存在", detail = ex.Message });
            }
            catch (Exception ex)
            {
                // 其他非預期錯誤
                return StatusCode(500, new { message = "伺服器發生非預期錯誤", detail = ex.Message });
            }

        }

        [HttpPost("UpdateWishList")]
        public async Task<IActionResult> UpdateWishList([FromBody] WishlistDto dto)
        {
            bool result = await _tripServices.UpdateWishList(_tagUserId.UserId, dto.SpotId, dto.AddToWishlist);
            if (result)
            {
                return Ok(new { id = dto.SpotId });
            }
            else
            {
                return StatusCode(500, new { message = "資料庫寫入失敗，可能資料已存在" });
            }
        }


        [HttpPost("checkIsWishlist")]
        public async Task<IActionResult> CheckIsWishlist([FromBody] int spotId)
        {
            bool reuslt = await _tripServices.IsInWishList(_tagUserId.UserId, spotId);
            return Ok(new { AddToWishlist = reuslt });
        }
        #endregion
    }
}
