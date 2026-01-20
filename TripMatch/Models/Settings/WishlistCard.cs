using System.ComponentModel.DataAnnotations;

namespace TripMatch.Models.Settings
{
    public class WishlistCard
    {
        // Spot 主鍵（與資料庫 PlacesSnapshot.SpotId 對應）
        public int? SpotId { get; set; }

        // 前端可能使用不同欄位名稱：提供中文與通用名稱
        public string? Name_ZH { get; set; }
        public string? Name { get; set; }

        // 地址顯示
        public string? Address { get; set; }

        // PlacesSnapshot 的 Google Place ID（資料庫欄位為 ExternalPlaceId）
        public string? ExternalPlaceId { get; set; }

        // 為相容舊程式碼，提供 alias 屬性（回傳 ExternalPlaceId）
        public string? GooglePlaceId => ExternalPlaceId;

        // 圖片快照或單一 image url，前端會解析 PhotosSnapshot 或使用 imageUrl/FirstImageUrl
        public string? PhotosSnapshot { get; set; }
        public string? ImageUrl { get; set; }
        public string? FirstImageUrl { get; set; }
    }
}
