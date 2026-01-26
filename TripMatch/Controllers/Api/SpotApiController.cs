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
        private readonly TripServices _tripServices;
        private readonly ITagUserId _tagUserId;
        private readonly ILogger _logger;

        public SpotApiController(SpotServices spotServices, ITagUserId tagUserId, TripServices tripServices, ILogger<SpotApiController> logger)
        {
            _spotServices = spotServices;
            _tagUserId = tagUserId;
            _tripServices = tripServices;
            _logger = logger;
        }

        [HttpPost("wishlist")]
        public async Task<IActionResult> AddToWishlist([FromBody] SpotDto.AddWishlistRequest req)
        {
            var userId = _tagUserId.UserId;
            if (userId is null)
                return Unauthorized(new { ok = false, message = "Unauthorized" });

            var (ok, message, spotId) = await _spotServices.AddToWishlistAsync(userId.Value, req);

            if (!ok)
                return message == "Already in wishlist."
                    ? Conflict(new { ok = false, message })
                    : BadRequest(new { ok = false, message });

            return Ok(new { ok = true, spotId });
        }

        [HttpDelete("wishlist")]
        public async Task<IActionResult> RemoveFromWishlist([FromQuery] string placeId)
        {
            var userId = _tagUserId.UserId;
            if (userId is null) return Unauthorized(new { ok = false, message = "Unauthorized" });

            var (ok, message) = await _spotServices.RemoveFromWishlistAsync(userId.Value, placeId);

            if (!ok) return BadRequest(new { ok = false, message });

            return Ok(new { ok = true, });
        }

        [HttpGet("wishlist/ids")]
        public async Task<IActionResult> GetWishlistPlaceIds()
        {
            var userId = _tagUserId.UserId;
            if (userId is null) return Unauthorized();

            var ids = await _spotServices.GetWishlistPlaceIdAsync(userId.Value);
            return Ok(ids);
        }

        [HttpPost("itinerary")]
        [Authorize]
        public async Task<IActionResult> AddToItinerary([FromBody] SpotDto.AddItineraryRequest req)
        {
            var userId = _tagUserId.UserId;
            if (userId is null) return Unauthorized(new { ok = false, message = "Unauthorized" });

            // 這裡可以加一行 log，幫你快速定位 payload 是否正確
            _logger.LogInformation("AddToItinerary tripId={TripId}, dayNo={DayNo}, placeId={PlaceId}, photoUrl={PhotoUrl}",
                req?.TripId, req?.DayNo, req?.Place?.PlaceId, req?.Place?.PhotoUrl);

            (bool ok, string? message, int itineraryItemId, int spotId) =
                await _spotServices.AddToItineraryAsync(userId.Value, req);

            if (!ok)
            {
                if (message == "Forbidden") return Forbid();
                if (message == "This place already exists in that day.")
                    return Conflict(new { ok = false, message });

                return BadRequest(new { ok = false, message });
            }

            return Ok(new { ok = true, itineraryItemId, spotId });
        }


        [HttpGet("mine")]
        [Authorize]
        public async Task<IActionResult> GetTrips()
        {
            List<Models.DTOs.SearchTripDaysDto> trips = await _spotServices.GetTrips(_tagUserId.UserId);
            return Ok(trips);
        }
    }
}
