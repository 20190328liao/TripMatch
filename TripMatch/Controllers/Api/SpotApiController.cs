using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models.DTOs;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [ApiController]
    [Route("api/spot")]
    [Authorize]
    public class SpotApiController : ControllerBase
    {
        private readonly SpotServices _spotServices;
        private readonly ITagUserId _tagUserId;

        public SpotApiController(SpotServices spotServices, ITagUserId tagUserId)
        {
            _spotServices = spotServices;
            _tagUserId = tagUserId;
        }

        public record AddWishlistRequest(
            string externalPlaceId,
            string nameZh,
            string? address,
            decimal? lat,
            decimal? lng,
            decimal? rating,
            string? phone,
            string? photoJson
        );

        public record AddItineraryRequest(
            int TripId,
            int DayNo,
            string PlaceId,
            string NameZh,
            string? Address,
            decimal? Lat,
            decimal? Lng,
            decimal? Rating,
            string? PhotoJson
        );

        [HttpPost("wishlist")]
        public async Task<IActionResult> AddToWishlist([FromBody] AddWishlistRequest req)
        {
            var userId = _tagUserId.UserId;
            if (userId is null) return Unauthorized(new { ok = false, message = "Unauthorized" });

            var mapped = new SpotDto.AddWishlistRequest
            {
                Place = new SpotDto.PlaceDto
                {
                    PlaceId = req.externalPlaceId,
                    Name = req.nameZh,
                    Address = req.address,
                    Lat = req.lat,
                    Lng = req.lng,
                    Rating = req.rating,
                    Phone = req.phone,
                    // 目前 DTO 用 PhotoUrl 先承接你的 photoJson（不改前端 payload）
                    PhotoUrl = req.photoJson
                }
            };

            var (ok, message, spotId) = await _spotServices.AddToWishlistAsync(userId.Value, mapped);

            if (!ok)
            {
                if (message == "Already in wishlist.")
                    return Conflict(new { ok = false, message });

                return BadRequest(new { ok = false, message });
            }

            return Ok(new { ok = true, spotId });
        }

        [HttpPost("itinerary")]
        public async Task<IActionResult> AddToItinerary([FromBody] AddItineraryRequest req)
        {
            var userId = _tagUserId.UserId;
            if (userId is null) return Unauthorized(new { ok = false, message = "Unauthorized" });

            var mapped = new SpotDto.AddItineraryRequest
            {
                TripId = req.TripId,
                DayNo = req.DayNo,
                Place = new SpotDto.PlaceDto
                {
                    PlaceId = req.PlaceId,
                    Name = req.NameZh,
                    Address = req.Address,
                    Lat = req.Lat,
                    Lng = req.Lng,
                    Rating = req.Rating,
                    PhotoUrl = req.PhotoJson
                }
            };

            var (ok, message, itineraryItemId, spotId) =
                await _spotServices.AddToItineraryAsync(userId.Value, mapped);

            if (!ok)
            {
                if (message == "Forbidden") return Forbid();
                if (message == "This place already exists in that day.")
                    return Conflict(new { ok = false, message });

                return BadRequest(new { ok = false, message });
            }

            return Ok(new { ok = true, itineraryItemId, spotId });
        }
    }
}
