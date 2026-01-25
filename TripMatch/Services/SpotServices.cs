using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Models.DTOs;
using System.Text.Json;

namespace TripMatch.Services
{
    public class SpotServices
    {
        private readonly TravelDbContext _context;

        public SpotServices(TravelDbContext context)
        {
            _context = context;
        }

        // 加入最愛
        public async Task<(bool ok, string? message, int spotId)> AddToWishlistAsync(int userId, SpotDto.AddWishlistRequest req)
        {
            var p = req?.Place;
            if (p is null) return (false, "Place is required.", 0);
            if (string.IsNullOrWhiteSpace(p.PlaceId)) return (false, "place.placeId is required.", 0);
            if (string.IsNullOrWhiteSpace(p.Name)) return (false, "place.name is required.", 0);
            if (p.Lat is null || p.Lng is null) return (false, "place.lat/lng is required.", 0);

            // 照片快照只在這裡產生
            var photoJson = BuildPhotoJsonFromPlace(p);
            // 產生 categoryId
            var categoryId = await ResolvePrimaryLocationCategoryIdAsync(p.Types);

            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                nameEn: p.NameEn,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
                userRatingsTotal: p.UserRatingsTotal,
                locationCategoryId: categoryId,
                photosSnapshotJson: photoJson
            );

            var exists = await _context.Wishlists
                .AnyAsync(w => w.UserId == userId && w.SpotId == spotId);

            if (exists) return (false, "Already in wishlist.", spotId);

            //var now = DateTimeOffset.UtcNow;
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Taipei Standard Time");
            var nowTw = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, tz);

            _context.Wishlists.Add(new Wishlist
            {
                UserId = userId,
                SpotId = spotId,
                CreatedAt = nowTw,
                UpdatedAt = nowTw,
            });

            await _context.SaveChangesAsync();
            return (true, null, spotId);
        }

        public async Task<(bool ok, string? message)> RemoveFromWishlistAsync(int userId, string placeId)
        {
            if (string.IsNullOrWhiteSpace(placeId)) return (false, "placeId is required.");

            // 找到該景點之spotId
            var spotId = await _context.PlacesSnapshots
                .AsNoTracking()
                .Where(p => p.ExternalPlaceId == placeId)
                .Select(p => (int?)p.SpotId)
                .FirstOrDefaultAsync();
            if (spotId is null) return (false, "Spot not found.");

            var row = await _context.Wishlists
                .SingleOrDefaultAsync(w => w.UserId == userId && w.SpotId == spotId.Value);
            if (row is null) return (false, "Not in wishlist.");

            _context.Wishlists.Remove(row);
            await _context.SaveChangesAsync();

            return (true, null);
        }

        // 回傳現有wishlist之placeId List，方便刷新時正確寫入btnWishlist狀態
        public async Task<List<string>> GetWishlistPlaceIdAsync(int userId)
        {
            return await _context.Wishlists
                .AsNoTracking()
                .Where(w => w.UserId == userId)
                .Join(
                    _context.PlacesSnapshots.AsNoTracking(),
                    w => w.SpotId,
                    p => p.SpotId,
                    (w, p) => p.ExternalPlaceId
                )
                .ToListAsync();
        }

        public async Task<(bool ok, string? message, int itineraryItemId, int spotId)> AddToItineraryAsync(
            int userId,
            SpotDto.AddItineraryRequest req)
        {
            if (req.TripId <= 0) return (false, "TripId is required.", 0, 0);
            if (req.DayNo <= 0) return (false, "DayNumber must be >= 1.", 0, 0);

            var p = req?.Place;
            if (p is null) return (false, "Place is required.", 0, 0);
            if (string.IsNullOrWhiteSpace(p.PlaceId)) return (false, "place.placeId is required.", 0, 0);
            if (string.IsNullOrWhiteSpace(p.Name)) return (false, "place.name is required.", 0, 0);
            if (p.Lat is null || p.Lng is null) return (false, "place.lat/lng is required.", 0, 0);

            // 1) 權限：必須是行程成員（維持你原邏輯）
            var isMember = await _context.TripMembers
                .AnyAsync(tm => tm.TripId == req.TripId && tm.UserId == userId);

            if (!isMember) return (false, "Forbidden", 0, 0);

            // 2) GetOrCreate SpotId（對齊 PlacesSnapshot Entity 欄位）
            var photoJson = BuildPhotoJsonFromPlace(p);
            var categoryId = await ResolvePrimaryLocationCategoryIdAsync(p.Types);

            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                nameEn: p.NameEn,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
                userRatingsTotal: p.UserRatingsTotal,
                locationCategoryId: categoryId,
                photosSnapshotJson: photoJson
            );

            // 3) 同一天重複景點檢查
            var exists = await _context.ItineraryItems
                .AnyAsync(i =>
                    i.TripId == req.TripId &&
                    i.DayNumber == req.DayNo &&
                    i.SpotId == spotId);

            if (exists) return (false, "This place already exists in that day.", 0, spotId);

            // 4) SortOrder
            var maxSort = await _context.ItineraryItems
                .Where(i => i.TripId == req.TripId && i.DayNumber == req.DayNo)
                .Select(i => (int?)i.SortOrder)
                .MaxAsync();

            var nextSort = (maxSort ?? 0) + 1;
            //var now = DateTimeOffset.UtcNow;
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Taipei Standard Time");
            var nowTw = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, tz);


            var start = ParseTimeOrDefault(req.StartTime, new TimeOnly(8, 0));
            var end = ParseTimeOrDefault(req.EndTime, new TimeOnly(9, 0));

            if (end <= start)
                return (false, "endTime must be after startTime.", 0, 0);

            var item = new ItineraryItem
            {
                TripId = req.TripId,
                DayNumber = req.DayNo,
                SpotId = spotId,

                ItemType = 1,
                StartTime = start,
                EndTime = end,
                SortOrder = nextSort,
                IsOpened = false,

                UpdatedByUserId = userId,
                CreatedAt = nowTw,
                UpdatedAt = nowTw
            };

            _context.ItineraryItems.Add(item);
            await _context.SaveChangesAsync();

            return (true, null, item.Id, spotId);
        }

        // 只用既有 LocationCategories，不建新表
        private async Task<int?> ResolvePrimaryLocationCategoryIdAsync(string[]? types)
        {
            //  LocationCategories.Name_EN：Dining / Attractions / Shopping / Accommodation / Transport / Nature
            // 這裡「主類別」用優先順序決定（可自行調整）
            string bucket = MapTypesToBucket(types);

            // 依 Name_EN 查 Id（避免硬寫 1~6，保持擴充彈性）
            var id = await _context.LocationCategories
                .AsNoTracking()
                .Where(c => c.IsActive && c.NameEn == bucket)
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync();

            // 查不到就給預設：Attractions
            if (id != null) return id;

            return await _context.LocationCategories
                .AsNoTracking()
                .Where(c => c.IsActive && c.NameEn == "Attractions")
                .Select(c => (int?)c.Id)
                .FirstOrDefaultAsync();
        }

        // types 轉換成我的 CategoryI
        private static string MapTypesToBucket(string[]? types)
        {
            if (types == null || types.Length == 0) return "Attractions";

            // 用 HashSet 做 contains，之後要擴充只要加字串
            var t = new HashSet<string>(types, StringComparer.OrdinalIgnoreCase);

            // 優先順序（你可以調整）：住宿 > 交通 > 美食 > 購物 > 自然 > 景點
            if (t.Overlaps(new[] { "lodging", "hotel", "motel", "hostel" })) return "Accommodation";
            if (t.Overlaps(new[] { "airport", "train_station", "subway_station", "transit_station", "bus_station", "parking", "taxi_stand" })) return "Transport";
            if (t.Overlaps(new[] { "restaurant", "cafe", "bakery", "bar", "food", "meal_takeaway", "meal_delivery" })) return "Dining";
            if (t.Overlaps(new[] { "shopping_mall", "department_store", "store", "supermarket", "convenience_store", "clothing_store" })) return "Shopping";
            if (t.Overlaps(new[] { "park", "natural_feature", "campground", "beach" })) return "Nature";

            // 沒命中就歸景點
            return "Attractions";
        }




        // ===== PlacesSnapshot Upsert (對齊 PlacesSnapshot Entity 欄位) =====
        private async Task<int> GetOrCreateSpotIdAsync(
            string externalPlaceId,
            string nameZh,
            string nameEn,
            string? address,
            decimal lat,
            decimal lng,
            decimal? rating,
            int? userRatingsTotal,
            int? locationCategoryId,
            string? photosSnapshotJson
        )
        {
            // ExternalPlaceId 防重
            var existing = await _context.PlacesSnapshots
                .AsNoTracking()
                .Where(p => p.ExternalPlaceId == externalPlaceId)
                .Select(p => new { p.SpotId })
                .SingleOrDefaultAsync();

            if (existing != null) return existing.SpotId;

            //var now = DateTimeOffset.UtcNow;
            var tz = TimeZoneInfo.FindSystemTimeZoneById("Taipei Standard Time");
            var nowTw = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, tz);


            var place = new PlacesSnapshot
            {
                ExternalPlaceId = externalPlaceId,
                LocationCategoryId = locationCategoryId,
                NameZh = nameZh,
                NameEn = nameEn,
                AddressSnapshot = address,
                Lat = lat,
                Lng = lng,
                Rating = rating,
                UserRatingsTotal = userRatingsTotal,
                PhotosSnapshot = photosSnapshotJson,
                CreatedAt = nowTw,
                UpdatedAt = nowTw,
            };

            _context.PlacesSnapshots.Add(place);

            try
            {
                await _context.SaveChangesAsync();
                return place.SpotId;
            }
            catch (DbUpdateException)
            {
                // 競態：同 externalPlaceId 被同時新增 → 重查 SpotId
                var spotId = await _context.PlacesSnapshots
                    .AsNoTracking()
                    .Where(p => p.ExternalPlaceId == externalPlaceId)
                    .Select(p => p.SpotId)
                    .SingleAsync();

                return spotId;
            }
        }

        public async Task<List<SearchTripDaysDto>> GetTrips(int? userId)
        {
            List<SearchTripDaysDto> tripDtos = [];

            List<Trip> trips = await _context.Trips.Where(t => t.TripMembers.Any(tm => tm.UserId == userId)).ToListAsync();

            foreach (var trip in trips)
            {
                SearchTripDaysDto tripDto = new()
                {
                    TripId = trip.Id,
                    Title = trip.Title,
                    DayCount = (trip.EndDate.ToDateTime(TimeOnly.MinValue)
                    - trip.StartDate.ToDateTime(TimeOnly.MinValue))
                    .Days + 1,
                };
                tripDtos.Add(tripDto);
            }
            return tripDtos;
        }

        // 解析 photosurl json 陣列
        private const int MAX_PHOTOS = 10;

        private static string BuildPhotoJsonFromPlace(SpotDto.PlaceDto place)
        {
            // 目前前端只給一張，就轉成 array
            var urls = string.IsNullOrWhiteSpace(place.PhotoUrl)
                ? new List<string>()
                : new List<string> { place.PhotoUrl.Trim() };

            // 未來就算 place 改成多張，這裡也不用動
            var normalized = urls
                .Where(u => !string.IsNullOrWhiteSpace(u))
                .Distinct()
                .Take(MAX_PHOTOS)
                .ToList();

            return System.Text.Json.JsonSerializer.Serialize(normalized);
        }

        // 加時間用的
        private static TimeOnly ParseTimeOrDefault(string? hhmm, TimeOnly defaultValue)
        {
            if (string.IsNullOrWhiteSpace(hhmm)) return defaultValue;

            // 僅接受 "HH:mm"
            if (TimeOnly.TryParseExact(hhmm.Trim(), "HH:mm", out var t))
                return t;

            throw new ArgumentException($"Invalid time format: {hhmm}. Expected HH:mm.");
        }

    }
}
