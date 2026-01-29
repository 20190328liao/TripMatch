namespace TripMatch.Models.DTOs.External
{
    // 對應 SerpApi (Google Hotels Engine) 的回傳結構
    public class SerpApiHotelResponse
    {
        public SearchMetadata search_metadata { get; set; }
        public List<HotelProperty> properties { get; set; } // 這是飯店列表的核心
    }

    public class HotelProperty
    {
        public string name { get; set; }
        public string description { get; set; }
        public double overall_rating { get; set; } // 評分 (e.g. 4.5)
        public int reviews { get; set; }

        // 價格資訊 (通常會有 rate_per_night 和 total_rate)
        public HotelRate rate_per_night { get; set; }
        public HotelRate total_rate { get; set; }

        public List<HotelImage> images { get; set; }
        public string link { get; set; } // 訂房連結
    }

    public class HotelRate
    {
        public string lowest { get; set; } // 顯示用的字串 "$100"
        public int? extracted_lowest { get; set; } // 數值 "100" (這才是我們要拿來計算的)
    }

    public class HotelImage
    {
        public string original_image { get; set; }
        public string thumbnail { get; set; }
    }
}