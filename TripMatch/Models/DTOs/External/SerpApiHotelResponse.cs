using System.Collections.Generic;
using System.Text.Json.Serialization; // 建議引用這個，雖然目前沒用到屬性

namespace TripMatch.Models.DTOs.External
{
    // 對應 SerpApi (Google Hotels Engine) 的回傳結構
    public class SerpApiHotelResponse
    {
        // ★★★ 修正點 1：將原本的 SearchMetadata 型別改成 HotelSearchMetadata ★★★
        public HotelSearchMetadata search_metadata { get; set; }

        public List<HotelProperty> properties { get; set; }
    }

    // ★★★ 修正點 2：將類別名稱改成 HotelSearchMetadata，避免跟機票的衝突 ★★★
    public class HotelSearchMetadata
    {
        public string id { get; set; }
        public string status { get; set; }
        public string json_endpoint { get; set; }
        public string created_at { get; set; }
        public string processed_at { get; set; }

        // 這就是我們要的飯店專屬連結
        public string google_hotels_url { get; set; }

        public string raw_html_file { get; set; }
        public object total_time_taken { get; set; }
    }

    // --- 以下保持不變 ---

    public class HotelProperty
    {
        public string name { get; set; }
        public string description { get; set; }
        public double overall_rating { get; set; }
        public int reviews { get; set; }

        // 價格資訊
        public HotelRate rate_per_night { get; set; }
        public HotelRate total_rate { get; set; }

        public List<HotelImage> images { get; set; }
        public string link { get; set; }
    }

    public class HotelRate
    {
        public string lowest { get; set; }
        public int? extracted_lowest { get; set; }
    }

    public class HotelImage
    {
        public string original_image { get; set; }
        public string thumbnail { get; set; }
    }
}