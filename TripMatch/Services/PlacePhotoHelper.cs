// PlacePhotoHelper.cs
using TripMatch.Models;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using Microsoft.Extensions.Logging;

namespace TripMatch.Services
{
    public static class PlacesPhotoHelper
    {
        // 取得預設圖 (統一管理，避免路徑寫死在各處)
        public static string GetPlaceholderImageUrl() => "/img/placeholder.png";

        /// <summary>
        /// 由 photosSnapshot 與 apiKey 產生可直接載入的 imageUrl。
        /// 支援三種情形：
        /// 1) snapshot 第一項為完整 URL -> 直接回傳
        /// 2) placeholder shorthand (e.g. "400x300?text=...") -> via.placeholder.com
        /// 3) Google photo_reference -> 使用 apiKey 組成 maps API photo url
        /// 若解析失敗或無有效項目，回傳本地 placeholder。
        /// </summary>
        public static string? BuildImageUrlFromPhotosSnapshot(string? photosSnapshot, string? apiKey)
        {
            if (string.IsNullOrEmpty(photosSnapshot)) return GetPlaceholderImageUrl();

            try
            {
                var photoList = JsonSerializer.Deserialize<List<string>>(photosSnapshot);
                if (photoList != null && photoList.Count > 0)
                {
                    var first = photoList[0]?.Trim();
                    if (string.IsNullOrEmpty(first)) return GetPlaceholderImageUrl();

                    // 完整 URL
                    if (first.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                        first.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
                    {
                        if (first.Contains("example.com")) return GetPlaceholderImageUrl();
                        return first;
                    }

                    // placeholder shorthand -> via.placeholder.com
                    if (System.Text.RegularExpressions.Regex.IsMatch(first, @"^\d+x\d+\?text=", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                    {
                        return $"https://via.placeholder.com/{first}";
                    }

                    // 視為 Google photo_reference，需 apiKey
                    if (!string.IsNullOrEmpty(apiKey))
                    {
                        var encoded = Uri.EscapeDataString(first);
                        return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference={encoded}&key={Uri.EscapeDataString(apiKey)}";
                    }
                }
            }
            catch
            {
                // 解析或轉換失敗 -> fallback
            }

            return GetPlaceholderImageUrl();
        }

        /// <summary>
        /// 從 snapshot JSON 解析第一張可用圖片（回傳 null 表示無可用）
        /// </summary>
        public static string? ParseFirstPhotoFromSnapshot(string? photosSnapshot)
        {
            if (string.IsNullOrEmpty(photosSnapshot)) return null;
            try
            {
                using var doc = JsonDocument.Parse(photosSnapshot);
                var root = doc.RootElement;
                if (root.ValueKind == JsonValueKind.Array && root.GetArrayLength() > 0)
                {
                    var first = root[0];
                    if (first.ValueKind == JsonValueKind.String)
                    {
                        var s = first.GetString();
                        if (!string.IsNullOrEmpty(s)) return s;
                    }
                    else if (first.ValueKind == JsonValueKind.Object)
                    {
                        if (first.TryGetProperty("url", out var urlProp) && urlProp.ValueKind == JsonValueKind.String)
                            return urlProp.GetString();
                    }
                }
                else if (root.ValueKind == JsonValueKind.String)
                {
                    var s = root.GetString();
                    if (!string.IsNullOrEmpty(s)) return s;
                }
            }
            catch { }
            return null;
        }

        /// <summary>
        /// 核心邏輯：將抓到的圖片網址安全地更新回 PlacesSnapshot 
        /// </summary>
        public static async Task<bool> SavePhotoUrlToSnapshotAsync(
            TravelDbContext dbContext,
            int? spotId,
            string? placeId,
            string photoUrl,
            ILogger? logger)
        {
            if (string.IsNullOrEmpty(photoUrl)) return false;

            try
            {
                PlacesSnapshot? snapshot = null;
                if (spotId.HasValue && spotId > 0)
                {
                    // 假設 SpotId 為 PK，FindAsync 可快速讀取
                    snapshot = await dbContext.PlacesSnapshots.FindAsync(spotId.Value);
                }
                else if (!string.IsNullOrEmpty(placeId))
                {
                    snapshot = await dbContext.PlacesSnapshots.FirstOrDefaultAsync(p => p.ExternalPlaceId == placeId);
                }

                if (snapshot == null) return false;

                // 處理 JSON 列表
                List<string> photos = new();
                if (!string.IsNullOrWhiteSpace(snapshot.PhotosSnapshot))
                {
                    try
                    {
                        photos = JsonSerializer.Deserialize<List<string>>(snapshot.PhotosSnapshot) ?? new();
                    }
                    catch
                    {
                        // 解析失敗則覆寫為空列表，避免拋例外
                        photos = new List<string>();
                    }
                }

                // 檢查是否重複，不重複才存
                if (!photos.Any(u => string.Equals(u, photoUrl, StringComparison.OrdinalIgnoreCase)))
                {
                    photos.Insert(0, photoUrl); // 新圖放最前面
                    snapshot.PhotosSnapshot = JsonSerializer.Serialize(photos);
                    snapshot.UpdatedAt = DateTimeOffset.UtcNow;
                    await dbContext.SaveChangesAsync();
                }

                return true;
            }
            catch (Exception ex)
            {
                logger?.LogWarning(ex, "SavePhotoUrlToSnapshotAsync 失敗, Url: {Url}", photoUrl);
                return false;
            }
        }
    }
}