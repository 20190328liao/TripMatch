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
            // 這裡假設 PlaceResult 沒有 Photos 屬性，您需要先確認 PlaceResult 是否有 Photos 屬性
            // 如果沒有，請先在 PlaceResult 類別中新增 Photos 屬性
            // 例如：public List<GooglePhoto> Photos { get; set; }
            var dto = await _googlePlacesClient.GetPlaceDetailsAsync(placeId);

            var photosProperty = dto?.Result?.GetType().GetProperty("Photos");
            IEnumerable<object>? photosValue = null;
            if (dto?.Result != null && photosProperty != null) { 
        
            photosValue = photosProperty.GetValue(dto.Result) as IEnumerable<object>;
            }

            if (photosValue != null && photosValue.Cast<object>().Any())
            {
                var photoRefs = photosValue
                    .Select(p => p.GetType().GetProperty("PhotoReference")?.GetValue(p)?.ToString())
                    .Where(s => !string.IsNullOrEmpty(s))
                    .ToList();
                var photosJson = JsonSerializer.Serialize(photoRefs);

                if (existing == null)
                {
                    // 新增 PlacesSnapshot（填充基本欄位）
                    existing = new PlacesSnapshot
                    {
                        ExternalPlaceId = placeId,
                        NameZh = dto?.Result?.Name?? string.Empty,
                        NameEn = dto?.Result?.Name?? string.Empty, // 假設英文同中文，或從 API 抓取
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