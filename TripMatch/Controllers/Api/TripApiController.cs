using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
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

        [HttpGet]
        [Authorize]
        public async Task<IActionResult> GetTrips()
        {
            List<Models.DTOs.TripSimpleDto> trips = await _tripServices.GetTrips(_tagUserId.UserId);
            return Ok(trips);
        }


        [HttpGet("simple/{tripId}")]
        public async Task<IActionResult> GetTripSimple (int tripId)
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


        [HttpPost("Create")]
        public async Task<IActionResult> Create([FromBody] TripCreateDto dto)
        {
            int tripId = await _tripServices.AddTrip(_tagUserId.UserId, dto);
            return Ok(new { id = tripId });
        }

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


    }
}
