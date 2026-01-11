using Microsoft.EntityFrameworkCore;
using TripMatch.Models;
using TripMatch.Services.ExternalClients;
using System.Text.Json;

namespace TripMatch.Services
{
    public class PlacesImageService
    {
        private readonly TravelDbContext _context;
        private readonly GooglePlacesClient _googlePlacesClient;

        public PlacesImageService(TravelDbContext context, GooglePlacesClient googlePlacesClient)
        {
            _context = context;
            _googlePlacesClient = googlePlacesClient;
        }

        // 測試方法：填充 PlacesSnapshot 的圖片（如果尚未有資料）
        public async Task FillPlacesSnapshotImagesAsync(string placeId)
        {
            var existing = await _context.PlacesSnapshots.FirstOrDefaultAsync(p => p.ExternalPlaceId == placeId);
            if (existing != null && !string.IsNullOrEmpty(existing.PhotosSnapshot)) 
            {
                Console.WriteLine($"PlacesSnapshot for {placeId} already has images.");
                return; // 已填充
            }

            // 從 Google Places API 抓取資料（包含 photos）
            var dto = await _googlePlacesClient.GetPlaceDetailsAsync(placeId, "zh-TW");
            if (dto?.Result?.Photos != null && dto.Result.Photos.Count > 0)
            {
                var photoRefs = dto.Result.Photos.Select(p => p.PhotoReference).ToList();
                var photosJson = JsonSerializer.Serialize(photoRefs);

                if (existing == null)
                {
                    // 新增 PlacesSnapshot（填充基本欄位）
                    existing = new PlacesSnapshot
                    {
                        ExternalPlaceId = placeId,
                        NameZh = dto.Result.Name,
                        NameEn = dto.Result.Name, // 假設英文同中文，或從 API 抓取
                        PhotosSnapshot = photosJson,
                        CreatedAt = DateTimeOffset.Now
                    };
                    _context.PlacesSnapshots.Add(existing);
                    Console.WriteLine($"Created new PlacesSnapshot for {placeId} with {photoRefs.Count} images.");
                }
                else
                {
                    existing.PhotosSnapshot = photosJson;
                    existing.UpdatedAt = DateTimeOffset.Now;
                    Console.WriteLine($"Updated PlacesSnapshot for {placeId} with {photoRefs.Count} images.");
                }
                await _context.SaveChangesAsync();
            }
            else
            {
                Console.WriteLine($"No photos found for {placeId} from Google Places API.");
            }
        }

        // 測試方法：批量填充多個 placeId
        public async Task FillMultiplePlacesSnapshotsAsync(IEnumerable<string> placeIds)
        {
            foreach (var placeId in placeIds)
            {
                try
                {
                    await FillPlacesSnapshotImagesAsync(placeId);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Error filling images for {placeId}: {ex.Message}");
                }
            }
        }
    }
}