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

            try
            {
                await _tripServices.LeaveTripAsync(user, tripId);
                return Ok(new { ok = true });
            }
            catch(InvalidOperationException ex)
            {
                return BadRequest(new {ok = false, message = ex.Message});
            }
            
        }

        [HttpGet("{tripId:int}/invite-code")]
        public async Task<IActionResult> InviteCode(int tripId)
        {
            var userId = _tagUserId.UserId.Value;
            if (userId <= 0) return Unauthorized();

            try
            {
                var code = await _tripServices.GetInviteCodeAsync(userId, tripId);
                return Ok(new
                {
                    inviteCode = code.ToString() // Guid -> String
                });
            }
            catch (UnauthorizedAccessException ex)
            {
                return Forbid(ex.Message);
            }
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
        public async Task<IActionResult> AddAccommodation([FromBody] AccommodationDto dto)
        {

            if (dto == null)
                return BadRequest(new { message = "請求資料格式錯誤" });

            try
            {
                // 3. 呼叫 Service 執行邏輯 (這會處理 SortOrder 計算與新增)
                bool isSuccess = await _tripServices.AddAccommodation(dto);

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


        [HttpDelete("DeleteAccommodation/{id}")]
        public async Task<IActionResult> DeleteAccommodation(int id)
        {
            try
            {
                if (id <= 0)
                {
                    return BadRequest("無效的 ID");
                }

                // 這裡執行刪除邏輯
                bool success = await _tripServices.DeleteAccommodation(id);

                // 成功刪除通常回傳 204 No Content 或 200 OK
                return Ok(new { message = $"已成功刪除景點, 住宿id = {id}" });
            }
            catch (Exception ex)
            {
                // 伺服器錯誤
                return StatusCode(500, "伺服器內部錯誤：" + ex.Message);
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
                bool isSuccess = await _tripServices.TryAddSpotToTrip(_tagUserId.UserId, dto);

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
        public async Task<IActionResult> DeleteSpotFromTrip(int id)
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
                return Ok(new { message = $"已成功刪除景點, SpotId = {id}" });
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

        [HttpPost("AddTripDay/{id}")]
        public async Task<IActionResult> AddTripDay(int id)
        {
            try
            {
                if (id <= 0)
                {
                    return BadRequest("無效的行程天數資料");
                }
                bool success = await _tripServices.AddTripDay(id);
                if (success)
                {
                    return Ok(new { message = "行程天數已新增" });
                }
                else
                {
                    return NotFound("找不到指定的行程");
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, "伺服器內部錯誤：" + ex.Message);
            }
        }

        [HttpDelete("DeleteDay/{tripId:int}/{dayNum:int}")]
        [Authorize] // 建議加上權限檢查
        public async Task<IActionResult> DeleteDay(int tripId, int dayNum)
        {
            try
            {
                // 建議在此加入權限檢查：確認目前的 UserId 是否有權限編輯此 TripId
                // 例如：var userId = _tagUserId.UserId;
                // if (!await _tripServices.IsUserTripMember(userId, tripId)) return Forbid();

                bool success = await _tripServices.DeleteTripDay(tripId, dayNum);

                if (success)
                {
                    return Ok(new { message = $"第 {dayNum} 天已刪除，後續行程已自動遞補" });
                }
                else
                {
                    return BadRequest(new { message = "刪除失敗，請檢查行程編號或天數" });
                }
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "伺服器內部錯誤：" + ex.Message });
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

        [HttpPost("MyFavorites")] // 改用 POST 以便接收 JSON body
        public async Task<IActionResult> GetMyFavoritesNearLocation([FromBody] GeoDto geo)
        {
            var spots = await _tripServices.GetUserFavoritesNearLocationAsync(_tagUserId.UserId, geo);

            return Ok(new
            {
                Spots = spots

            });
        }


        [HttpPost("Explore")]
        public async Task<IActionResult> Explore([FromBody] GeoDto geo)
        {
            // 1. 驗證輸入資料是否為空
            if (geo == null)
            {
                return BadRequest(new { Message = "未提供地理座標資訊。" });
            }

            // 2. 驗證經緯度是否合法 (避免傳入 0, 0 或超出範圍的數值)
            // 緯度範圍 -90~90, 經度範圍 -180~180
            if (geo.Lat == 0 && geo.Lng == 0)
            {
                return BadRequest(new { Message = "無效的座標位置。" });
            }

            try
            {
                // 3. 呼叫 Service 取得資料
                var spots = await _tripServices.GetNearbyPopularSpots(geo);

                // 4. 檢查回傳結果
                if (spots == null || !spots.Any())
                {
                    // 回傳 200 OK 但給空陣列，並附帶訊息讓前端知道沒找到東西
                    return Ok(new
                    {
                        Spots = new List<PlaceSnapshotDto>(),
                        Message = "該地區目前沒有推薦的熱門景點。"
                    });
                }

                // 5. 成功回傳資料
                return Ok(new { Spots = spots });
            }
            catch (Exception ex)
            {
                // 6. 異常處理 (Log 記錄後回傳 500)
                // _logger.LogError(ex, "執行 Explore 發生錯誤");
                return StatusCode(500, new { Message = "取得附近景點時發生伺服器錯誤。" });
            }
        }
        #endregion

        #region 航班資訊 Proxy

        // [Proxy] 1. 轉發航線查詢
        [HttpGet("ProxyFlightRoutes")]
        public async Task<IActionResult> ProxyFlightRoutes(string depIata, string arrIata)
        {
            if (string.IsNullOrEmpty(depIata) || string.IsNullOrEmpty(arrIata))
            {
                return BadRequest(new { message = "請提供出發與抵達機場代碼" });
            }

            try
            {
                // 改透過 Service 呼叫
                var jsonResult = await _tripServices.ProxyFlightRoutes(depIata, arrIata);
                return Content(jsonResult, "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "查詢航線失敗", error = ex.Message });
            }
        }

        // [Proxy] 2. 轉發航班詳細查詢
        [HttpGet("ProxyFlightDetail")]
        public async Task<IActionResult> ProxyFlightDetail(string flightIata)
        {
            if (string.IsNullOrEmpty(flightIata))
            {
                return BadRequest(new { message = "請提供航班代���" });
            }

            try
            {
                // 改透過 Service 呼叫
                var jsonResult = await _tripServices.ProxyFlightDetail(flightIata);
                return Content(jsonResult, "application/json");
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "查詢航班失敗", error = ex.Message });
            }
        }

        [HttpPost("AddFlight")]
        public async Task<IActionResult> AddFlight(FlightDto dto)
        {
            // 1. 驗證資料是否為空
            if (dto == null)
            {
                return BadRequest("無效的請求資料");
            }

            // 2. 自動檢查實體模型驗證 (如：[Required] 標籤)
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            // 3. 呼叫服務層
            bool isSuccess = await _tripServices.AddFlight(dto);

            // 4. 根據結果回傳對應的 HTTP 狀態碼
            if (isSuccess)
            {
                // 成功：回傳 200 OK，也可以回傳自定義訊息或物件
                return Ok(new { message = "航班已成功新增", data = dto });
            }
            else
            {
                // 失敗：回傳 400 或 500
                return BadRequest("航班新增失敗，請檢查行程 ID 是否正確或稍後再試");
            }
        }

        [HttpDelete("DeleteFlight/{id}")]
        public async Task<IActionResult> DeleteFlight(int id, [FromQuery] string rowVersion)
        {
            try
            {
                // 1. 基本驗證
                if (id <= 0)
                {
                    return BadRequest("無效的航班 ID");
                }

                if (string.IsNullOrEmpty(rowVersion))
                {
                    return BadRequest("缺少版本標記 (RowVersion)");
                }

                // 2. 呼叫服務層進行帶有衝突檢查的刪除
                // 注意：這裡 Service 的參數多了一個 rowVersion
                bool success = await _tripServices.DeleteFlight(id, rowVersion);

                if (success)
                {
                    return Ok(new { message = $"已成功刪除航班, FlightId = {id}" });
                }
                else
                {
                    // 如果回傳 false，通常代表找不到資料（已被他人刪除）
                    return NotFound("找不到指定的航班，可能已被其他成員刪除");
                }
            }
            catch (DbUpdateConcurrencyException)
            {
                // 3. 專門處理並行衝突 (有人在你讀取後改動了資料)
                return Conflict(new { message = "該航班資訊已被修改，請重新整理頁面取得最新狀態。" });
            }
            catch (Exception ex)
            {
                // 4. 處理其他意外錯誤
                // 在正式環境建議不要直接把 ex.Message 丟回前端，此處保留你的原樣
                return StatusCode(500, "伺服器內部錯誤：" + ex.Message);
            }
        }

        #endregion

        #region 行程邀請

        // 取得邀請資訊 (公開 API，不一定要 Authorize，或者前端判斷未登入先跳轉)
        [HttpGet("invite-info/{code}")]
        public async Task<IActionResult> GetInviteInfo(string code)
        {
            var info = await _tripServices.GetTripInfoByInviteCode(code);
            if (info == null) return NotFound(new { message = "無效的邀請碼" });

            return Ok(info);
        }

        // 確認加入 (必須登入)
        [HttpPost("join")]
        [Authorize]
        public async Task<IActionResult> JoinByCode([FromBody] JoinRequestDto req)
        {
            var userId = _tagUserId.UserId;
            bool success = await _tripServices.JoinTripByInviteCode(userId, req.InviteCode);

            if (success)
                return Ok(new { message = "加入成功" });
            else
                return BadRequest(new { message = "加入失敗，邀請碼無效或發生錯誤" });
        }

        // DTO class 可以放下面或獨立檔案
        public class JoinRequestDto { public string InviteCode { get; set; } }

        #endregion
    }
}
