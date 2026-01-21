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

        public async Task<(bool ok, string? message, int spotId)> AddToWishlistAsync(int userId, SpotDto.AddWishlistRequest req)
        {
            var p = req?.Place;
            if (p is null) return (false, "Place is required.", 0);
            if (string.IsNullOrWhiteSpace(p.PlaceId)) return (false, "place.placeId is required.", 0);
            if (string.IsNullOrWhiteSpace(p.Name)) return (false, "place.name is required.", 0);
            if (p.Lat is null || p.Lng is null) return (false, "place.lat/lng is required.", 0);

            // 照片快照只在這裡產生
            var photoJson = BuildPhotoJsonFromPlace(p);

            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
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

            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
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

        // ===== PlacesSnapshot Upsert (對齊 PlacesSnapshot Entity 欄位) =====
        private async Task<int> GetOrCreateSpotIdAsync(
            string externalPlaceId,
            string nameZh,
            string? address,
            decimal lat,
            decimal lng,
            decimal? rating,
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
                NameZh = nameZh,
                AddressSnapshot = address,
                Lat = lat,
                Lng = lng,
                Rating = rating,
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
