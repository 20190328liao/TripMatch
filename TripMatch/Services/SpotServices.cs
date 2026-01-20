using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Models.DTOs;

namespace TripMatch.Services
{
    public class SpotServices
    {
        private readonly TravelDbContext _context;

        public SpotServices(TravelDbContext context)
        {
            _context = context;
        }

        public async Task<(bool ok, string? message, int spotId)> AddToWishlistAsync(
            int userId,
            SpotDto.AddWishlistRequest req)
        {
            var p = req?.Place;
            if (p is null) return (false, "Place is required.", 0);
            if (string.IsNullOrWhiteSpace(p.PlaceId)) return (false, "place.placeId is required.", 0);
            if (string.IsNullOrWhiteSpace(p.Name)) return (false, "place.name is required.", 0);
            if (p.Lat is null || p.Lng is null) return (false, "place.lat/lng is required.", 0);

            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
                photosSnapshotJson: p.PhotoUrl
            );

            var exists = await _context.Wishlists
                .AnyAsync(w => w.UserId == userId && w.SpotId == spotId);

            if (exists) return (false, "Already in wishlist.", spotId);

            var now = DateTimeOffset.UtcNow;

            _context.Wishlists.Add(new Wishlist
            {
                UserId = userId,
                SpotId = spotId,
                CreatedAt = now,
                UpdatedAt = now,
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
            var spotId = await GetOrCreateSpotIdAsync(
                externalPlaceId: p.PlaceId,
                nameZh: p.Name,
                address: p.Address,
                lat: p.Lat.Value,
                lng: p.Lng.Value,
                rating: p.Rating,
                photosSnapshotJson: p.PhotoUrl
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
            var now = DateTimeOffset.UtcNow;

            var item = new ItineraryItem
            {
                TripId = req.TripId,
                DayNumber = req.DayNo,
                SpotId = spotId,

                ItemType = 1,
                StartTime = null,
                EndTime = null,
                SortOrder = nextSort,
                IsOpened = false,

                UpdatedByUserId = userId,
                CreatedAt = now,
                UpdatedAt = now
            };

            _context.ItineraryItems.Add(item);
            await _context.SaveChangesAsync();

            return (true, null, item.Id, spotId);
        }

        // ===== PlacesSnapshot Upsert (對齊你的 PlacesSnapshot Entity 欄位) =====
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

            var now = DateTimeOffset.UtcNow;

            var place = new PlacesSnapshot
            {
                ExternalPlaceId = externalPlaceId,
                NameZh = nameZh,
                AddressSnapshot = address,
                Lat = lat,
                Lng = lng,
                Rating = rating,
                PhotosSnapshot = photosSnapshotJson,
                CreatedAt = now,
                UpdatedAt = now,
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
    }
}
