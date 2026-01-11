using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using System.Text.Json;
using TripMatch.Data;
using TripMatch.Models;
using TripMatch.Models.Settings;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TripMatch.Services; // 新增 using

namespace TripMatch.Controllers.Api
{
    [ApiController]
    [Route("api/MemberCenterApi")]
    public class MemberCenterApiController : ControllerBase
    {
        private readonly TravelDbContext _dbContext;
        private readonly IConfiguration _configuration;
        private readonly ILogger<MemberCenterApiController> _logger;
        private readonly PlacesImageService _placesImageService; // 新增欄位

        public MemberCenterApiController(TravelDbContext dbContext, IConfiguration configuration, ILogger<MemberCenterApiController> logger, PlacesImageService placesImageService)
        {
            _dbContext = dbContext;
            _configuration = configuration;
            _logger = logger;
            _placesImageService = placesImageService; // 新增注入
        }

        [HttpPost("Toggle")]
        [Authorize]
        public async Task<IActionResult> Toggle([FromBody] ToggleWishlistModel model)
        {
            if (model == null || model.SpotId <= 0) return BadRequest(new { success = false, message = "無效的請求資料" });

            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var userId)) return Unauthorized();

            var existing = await _dbContext.Set<Wishlist>()
                .FirstOrDefaultAsync(w => w.UserId == userId && w.SpotId == model.SpotId);

            if (existing != null)
            {
                _dbContext.Remove(existing);
            }
            else
            {
                var newItem = new Wishlist
                {
                    UserId = userId,
                    SpotId = model.SpotId,
                    CreatedAt = DateTimeOffset.Now
                };
                _dbContext.Add(newItem);
            }

            await _dbContext.SaveChangesAsync();
            return Ok(new { success = true });
        }

        // 將 helper 改成 static 並接收 apiKey，確保不會捕捉到 controller instance
        private static string? BuildImageUrlFromPhotosSnapshot(string? photosSnapshot, string? apiKey)
        {
            if (string.IsNullOrEmpty(photosSnapshot)) return GetPlaceholderImageUrl(); // 如果沒有照片快照，回傳假圖片 URL
            try
            {
                var photos = JsonSerializer.Deserialize<List<string>>(photosSnapshot);
                if (photos != null && photos.Count > 0)
                {
                    var first = photos[0];
                    if (string.IsNullOrEmpty(first)) return GetPlaceholderImageUrl(); // 如果第一筆是空的，回傳假圖片

                    if (first.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                        first.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    {
                        // 如果是完整 URL，但可能是假的（例如 example.com），檢查是否有效（簡單檢查）
                        if (first.Contains("example.com")) return GetPlaceholderImageUrl(); // 假資料，替換為真實假圖片
                        return first;
                    }

                    if (!string.IsNullOrEmpty(apiKey))
                    {
                        return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={first}&key={apiKey}";
                    }
                }
            }
            catch
            {
            }
            return GetPlaceholderImageUrl(); // 解析失敗，回傳假圖片
        }

        // 新增靜態方法：回傳假圖片 URL（可替換為本地圖片或 placeholder 服務）
        private static string GetPlaceholderImageUrl()
        {
            // 使用 placeholder 服務（例如 via.placeholder.com）或本地圖片
            return "https://via.placeholder.com/400x300?text=No+Image+Available"; // 假圖片 URL
            // 或使用本地圖片：return "/img/placeholder.jpg";
        }

        [HttpGet("GetWish")]
        [Authorize]
        public async Task<IActionResult> GetWish()
        {
            var claim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (string.IsNullOrEmpty(claim) || !int.TryParse(claim, out var userId))
            {
                _logger.LogWarning("GetWish: 無法解析使用者識別 (Claim): {Claim}", claim);
                return Unauthorized();
            }

            try
            {
                // 從 DB 只擷取純資料（不要在 projection 中呼叫任何方法）
                var items = await _dbContext.Set<Wishlist>()
                    .AsNoTracking()
                    .Where(w => w.UserId == userId)
                    .Include(w => w.Spot)
                    .Select(w => new
                    {
                        w.WishlistItemId,
                        w.SpotId,
                        SpotName = w.Spot != null ? (w.Spot.NameZh ?? w.Spot.NameEn) : null,
                        w.Note,
                        CreatedAt = w.CreatedAt,
                        PhotosSnapshot = w.Spot == null ? null : w.Spot.PhotosSnapshot
                    })
                    .ToListAsync();

                // 取出 apiKey（避免 helper 捕捉 instance）
                var apiKey = _configuration["GooglePlacesApiKey"];

                // 在記憶體中處理 imageUrl
                var result = items.Select(item => new
                {
                    item.WishlistItemId,
                    item.SpotId,
                    spotTitle = item.SpotName,
                    item.Note,
                    createdAt = item.CreatedAt,
                    imageUrl = BuildImageUrlFromPhotosSnapshot(item.PhotosSnapshot, apiKey)
                }).ToList();

                return new ContentResult
                {
                    Content = System.Text.Json.JsonSerializer.Serialize(new { items = result }),
                    ContentType = "application/json; charset=utf-8",
                    StatusCode = 200
                };
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "GetWish 執行失敗，Claim={Claim}", claim);
                return StatusCode(500, new { message = "伺服器發生錯誤，請查看伺服器日誌。" });
            }
        }
   
        // 新增測試 API：手動填充圖片（開發測試用）
        [HttpPost("TestFillImages")]
        [Authorize] // 可選：限制授權
        public async Task<IActionResult> TestFillImages([FromBody] List<string> placeIds)
        {
            if (placeIds == null || placeIds.Count == 0)
            {
                return BadRequest(new { message = "請提供 placeIds 陣列" });
            }

            try
            {
                await _placesImageService.FillMultiplePlacesSnapshotsAsync(placeIds);
                return Ok(new { message = $"已嘗試填充 {placeIds.Count} 個 placeId 的圖片，請檢查 console 日誌。" });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "TestFillImages 失敗");
                return StatusCode(500, new { message = "填充圖片失敗，請檢查日誌。" });
            }
        }

        // 開發用：為某 user 的 trip 產生假 Wishlist / PlacesSnapshot
        [HttpPost("SeedDummyWishlistForTrip")]
        // 可視情況移除 Authorize 以便開發時直接呼叫
        [Authorize]
        public async Task<IActionResult> SeedDummyWishlistForTrip([FromBody] SeedTripWishlistModel model)
        {
            if (model == null || model.UserId <= 0 || model.TripId <= 0) 
                return BadRequest(new { success = false, message = "請提供 userId 與 tripId" });

            // 驗證使用者是否為該行程成員（避免亂種資料）
            var isMember = await _dbContext.TripMembers.AnyAsync(tm => tm.UserId == model.UserId && tm.TripId == model.TripId);
            if (!isMember) return Forbid();

            // 範例景點（首爾購物之旅常見點，可自行擴充）
            var samplePlaces = new[]
            {
                "明洞 Myeongdong",
                "東大門市場 Dongdaemun",
                "南大門市場 Namdaemun",
                "弘大 Hongdae",
                "梨大 Edae",
                "江南站 Gangnam"
            };

            var created = new List<object>();
            foreach (var name in samplePlaces)
            {
                // 先檢查是否已存在（以 NameZh 為基準）
                var exists = await _dbContext.PlacesSnapshots
                    .AsNoTracking()
                    .FirstOrDefaultAsync(p => p.NameZh == name);
                PlacesSnapshot snapshot;
                if (exists == null)
                {
                    // 使用 placeholder 圖片 URL 當作 photosnapshot 的第一筆（開發測試用）
                    var photoUrl = $"https://via.placeholder.com/400x300?text={Uri.EscapeDataString(name)}";
                    var photosJson = System.Text.Json.JsonSerializer.Serialize(new List<string> { photoUrl });

                    snapshot = new PlacesSnapshot
                    {
                        ExternalPlaceId = $"FAKE_{Guid.NewGuid():N}",
                        NameZh = name,
                        NameEn = name, // 若需可拆分
                        PhotosSnapshot = photosJson,
                        CreatedAt = DateTimeOffset.UtcNow
                    };
                    _dbContext.PlacesSnapshots.Add(snapshot);
                    await _dbContext.SaveChangesAsync();
                }
                else
                {
                    snapshot = exists;
                }

                // 新增到 Wishlist（如果尚未有）
                var alreadyWish = await _dbContext.Wishlists
                    .AnyAsync(w => w.UserId == model.UserId && w.SpotId == snapshot.SpotId);
                if (!alreadyWish)
                {
                    var wish = new Wishlist
                    {
                        UserId = model.UserId,
                        SpotId = snapshot.SpotId,
                        Note = model.Note ?? "自動填充假資料",
                        CreatedAt = DateTimeOffset.UtcNow
                    };
                    _dbContext.Wishlists.Add(wish);
                    await _dbContext.SaveChangesAsync();
                }

                // 組成回傳用的簡短卡片資料
                var firstPhoto = System.Text.Json.JsonSerializer.Deserialize<List<string>>(snapshot.PhotosSnapshot ?? "[]")
                                 ?.FirstOrDefault() ?? "/img/placeholder.jpg";
                created.Add(new { snapshot.SpotId, name = snapshot.NameZh, image = firstPhoto });
                created.Add(new { snapshot.SpotId, name = name, image = firstPhoto });
            }

            return Ok(new { success = true, created });
        }

        // 取得某 user 的 wishlist 卡片（前端用於會員中心顯示卡片）
        [HttpGet("GetWishlistCardsByUser")]
        [Authorize]
        public async Task<IActionResult> GetWishlistCardsByUser(int userId)
        {
            if (userId <= 0) return BadRequest(new { success = false, message = "缺少 userId" });

            var items = await _dbContext.Wishlists
                .AsNoTracking()
                .Where(w => w.UserId == userId)
                .Include(w => w.Spot)
                .Select(w => new
                {
                    spotId = w.SpotId,
                    nameZh = w.Spot != null ? w.Spot.NameZh : null,
                    // 取 photosSnapshot 的第一張，若為 photo_reference 則交由前端或服務轉換為完整圖片 URL
                    photosSnapshot = w.Spot != null ? w.Spot.PhotosSnapshot : null
                })
                .ToListAsync();

            var apiKey = _configuration["GooglePlacesApiKey"];

            var cards = items.Select(it =>
            {
                string imageUrl = "/img/placeholder.jpg";
                if (!string.IsNullOrEmpty(it.photosSnapshot))
                {
                    try
                    {
                        var arr = System.Text.Json.JsonSerializer.Deserialize<List<string>>(it.photosSnapshot);
                        var first = arr?.FirstOrDefault();
                        if (!string.IsNullOrEmpty(first))
                        {
                            if (first.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                                first.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                            {
                                imageUrl = first;
                            }
                            else if (!string.IsNullOrEmpty(apiKey))
                            {
                                // 假若 first 是 photo_reference，轉成可直接載入的 photo endpoint
                                imageUrl = $"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={first}&key={apiKey}";
                            }
                        }
                    }
                    catch { /* ignore parse errors */ }
                }

                return new
                {
                    spotId = it.spotId,
                    nameZh = it.nameZh ?? "未知地點",
                    imageUrl,
                    viewUrl = $"/Spot/Details/{it.spotId}"
                };
            }).ToList();

            return Ok(new { success = true, items = cards });
        }

        // 輔助 model：用於 Seed API 的 request body
        public class SeedTripWishlistModel
        {
            public int UserId { get; set; }
            public int TripId { get; set; }
            public string? Note { get; set; }
        }

        // 在檔案開頭或 namespace 內部新增 ToggleWishlistModel 定義
        public class ToggleWishlistModel
        {
            public int SpotId { get; set; }
        }
    }
}