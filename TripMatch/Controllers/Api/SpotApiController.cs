using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models.DTOs;
using TripMatch.Services;
using System.Net.Http;
using System.Net.Http.Json;
using Microsoft.Extensions.Caching.Memory;

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

        // 新增：MemoryCache + HttpClientFactory + IConfiguration
        private readonly IMemoryCache _cache;
        private readonly IHttpClientFactory _httpClientFactory;
        private readonly IConfiguration _cfg;

        public SpotApiController(SpotServices spotServices, ITagUserId tagUserId, TripServices tripServices, ILogger<SpotApiController> logger, IMemoryCache cache, IHttpClientFactory httpClientFactory, IConfiguration cfg)
        {
            _spotServices = spotServices;
            _tagUserId = tagUserId;
            _tripServices = tripServices;
            _logger = logger;
            _cache = cache;
            _httpClientFactory = httpClientFactory;
            _cfg = cfg;
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

        public sealed record PopularPlaceDto(
            string PlaceId,
            string Name,
            double Rating,
            int UserRatingsTotal,
            double Lat,
            double Lng,
            string? PhotoUrl
            );

        [HttpGet("popular")]
        [AllowAnonymous]
        public async Task<IActionResult> Popular(
            [FromQuery] double lat,
            [FromQuery] double lng,
            [FromQuery] int radius,
            [FromQuery] string? type,
            CancellationToken ct)
        {
            // 防呆
            if (radius <= 0) radius = 1000;
            radius = Math.Clamp(radius, 100, 5000);

            // type 名單
            var normType = (type ?? "").Trim();
            if (normType is not ("restaurant" or "tourist_attraction" or ""))
                return BadRequest(new { ok = false, message = "Invalid type." });

            string[] typesToQuery = normType switch
            {
                "restaurant" => new[] { "restaurant" },
                "tourist_attraction" => new[] { "tourist_attraction" },

                // 全部
                _ => new[] { "restaurant", "tourist_attraction", "cafe", "shopping_mall" }
            };


            // === cache key（座標/半徑量化，提升命中率）===
            // 0.01度 ~ 1.1km（台灣附近緯度大概）
            double qLat = Math.Round(lat, 2);
            double qLng = Math.Round(lng, 2);

            // 半徑量化: 每 200m 一級
            int qRadius = (int)(Math.Round(radius / 200.0) * 200);

            // Cache Key
            // v1: cache version
            var typeKey = string.Join("+", typesToQuery);
            var cacheKey = $"popular:v2:{typeKey}:{qLat:F2}:{qLng:F2}:{qRadius}";

            if (_cache.TryGetValue(cacheKey, out List<PopularPlaceDto>? cached) && cached is not null)
            {
                Response.Headers["X-Popular-Cache"] = "HIT";
                return Ok(cached);
            }

            Response.Headers["X-Popular-Cache"] = "MISS";

            // === call Google Place Nearby Search ===
            var apiKey = _cfg["GoogleMaps:ApiKey"];
            if (string.IsNullOrWhiteSpace(apiKey))
                return StatusCode(500, new { ok = false, message = "Google Places API key not configured." });

            var client = _httpClientFactory.CreateClient("GooglePlaces");

            // 組 Url
            // 逐個打 google
            var allResults = new List<GoogleResult>();

            //  https://主機/路徑?參數1=值&參數2=值
            foreach(var t in typesToQuery)
            {
                var url = $"https://maps.googleapis.com/maps/api/place/nearbysearch/json" +
                      $"?location={lat.ToString(System.Globalization.CultureInfo.InvariantCulture)},{lng.ToString(System.Globalization.CultureInfo.InvariantCulture)}" +
                      $"&radius={qRadius}" +
                      $"&type={Uri.EscapeDataString(t)}" +
                      $"&key={Uri.EscapeDataString(apiKey)}";

                var raw = await client.GetFromJsonAsync<GoogleNearbyResponse>(url, ct);

                if (raw is null)
                    continue;

                if (!string.Equals(raw.status, "OK", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogWarning("NearbySearch failed type={Type} status={Status} err={Err}", t, raw.status, raw.error_message);
                    continue;
                }

                if (raw.results is { Count: > 0 })
                    allResults.AddRange(raw.results);
            }
            
            // 去重 (同一 place 不同 type)
            var results = allResults
                .Where(r => !string.IsNullOrWhiteSpace(r.place_id))
                .GroupBy(r => r.place_id)
                .Select(g => g.First())
                .ToList();

            // 經緯度轉實際距離
            static double HaversineMeters(double lat1,  double lng1, double lat2, double lng2)
            {
                const double R = 6378137; // 地球半徑
                static double ToRad(double x) => x * Math.PI / 180.0;

                var dLat = ToRad(lat2 - lat1);
                var dLng = ToRad(lng2 - lng1);
                var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2) +
                    Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) *
                    Math.Sin(dLng / 2) * Math.Sin(dLng / 2);

                return 2 * R * Math.Asin(Math.Sqrt(a));
            }

            // 距離權重
            static double DistanceWeight(double dMeters, double d0 = 1000.0, double p = 2.0)
            {
                // 1 / (1 + (d / d0) ^ p)
                var x = dMeters / d0;
                return 1.0 / (1.0 + Math.Pow(x, p));
            }

            // 轉 DTO + 套用門檻
            var centerLat = lat;
            var centerLng = lng;

            var list = results
                .Select(r =>
                {
                    var placeLat = r.geometry?.location?.lat ?? 0;
                    var placeLng = r.geometry?.location?.lng ?? 0;

                    var photoRef = r.photos?.FirstOrDefault()?.photo_reference;
                    string? photoUrl = string.IsNullOrWhiteSpace(photoRef)
                    ? null
                    : $"https://maps.googleapis.com/maps/api/place/photo?maxwidth=600&photo_reference={Uri.EscapeDataString(photoRef)}&key={Uri.EscapeDataString(apiKey)}";

                    var rating = r.rating ?? 0;
                    var reviewCount = r.user_ratings_total ?? 0;

                    // 距離 (m)
                    var distanceMeters = (placeLat == 0 || placeLng == 0)
                                            ? double.MaxValue
                                            : HaversineMeters(centerLat, centerLng, placeLat, placeLng);

                    // 評論數權重
                    var reviewFactor = Math.Log10(reviewCount + 1);

                    // 距離權重
                    var distanceWeight = DistanceWeight(distanceMeters, d0: 1000, p: 2);

                    // 最終熱門分數
                    var score = rating * reviewFactor * distanceWeight;

                    return new
                    {
                        Place = new PopularPlaceDto(
                            PlaceId: r.place_id ?? "",
                            Name: r.name ?? "景點",
                            Rating: r.rating ?? 0,
                            UserRatingsTotal: reviewCount,
                            Lat: placeLat,
                            Lng: placeLng,
                            PhotoUrl: photoUrl
                        ),
                        Score = score
                    };
                })
                .Where(p => !string.IsNullOrWhiteSpace(p.Place.PlaceId))
                .Where(p => p.Place.Lat != 0 && p.Place.Lng != 0)
                .Where(p => p.Place.Rating >= 3.8)
                .Where(p => p.Place.UserRatingsTotal >= 30)
                .OrderByDescending(p => p.Score)
                .Take(24)
                .Select(p => p.Place)
                .ToList();

            // === cache set ===
            // TTL
            var ttl = TimeSpan.FromMinutes(10);

            _cache.Set(cacheKey, list, new MemoryCacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = ttl,
                Size = Math.Max(1, list.Count)
            });

            return Ok(list);
        }

        private sealed class GoogleNearbyResponse
        {
            public List<GoogleResult> results { get; set; } = new();
            public string? status {  get; set; }
            public string? error_message {  get; set; }
        }

        private sealed class GoogleResult
        {
            public string? place_id { get; set; }
            public string? name { get; set; }
            public double? rating { get; set; }
            public int? user_ratings_total { get; set; }
            public GoogleGeometry? geometry { get; set; }
            public List<GooglePhoto>? photos { get; set; }
        }

        private sealed class GoogleGeometry
        {
            public GoogleLocation? location { get; set; }
        }

        private sealed class GoogleLocation
        {
            public double lat { get; set; }
            public double lng { get; set; }
        }
        private sealed class GooglePhoto
        {
            public string? photo_reference { get; set; }
        }
    }
}
