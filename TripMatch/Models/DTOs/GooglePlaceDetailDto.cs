using System.Text.Json.Serialization;

namespace GooglePlaceDetailDTO
{
    public class TripSimpleDto
    {
        public int Id { get; set; }
        public string Title { get; set; }
    }

    public class TripCreateDto
    {
        public string Title { get; set; }
        public string[] PlaceIds { get; set; }
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
    }

    // 最外層：接收 Google API 的完整回應
    public class GooglePlaceDetailDto
    {
        [JsonPropertyName("result")]
        public PlaceResult Result { get; set; } = new PlaceResult();

        [JsonPropertyName("status")]
        public string Status { get; set; }
    }

    // 核心資料：對應 Place API 的 result 物件
    public class PlaceResult
    {
        // 對應資料庫的 Name
        [JsonPropertyName("name")]
        public string Name { get; set; }

        // 用來解析出 CountryCode (如 JP, TW)
        [JsonPropertyName("address_components")]
        public List<AddressComponent> AddressComponents { get; set; } = new List<AddressComponent>();

        // 用來判斷 Level (是國家 country 還是城市 locality)
        [JsonPropertyName("types")]
        public List<string> Types { get; set; } = new List<string>();

        // 新增：photos 陣列（包含 photo_reference）
        [JsonPropertyName("photos")]
        public List<Photo>? Photos { get; set; }
    }

    public class Photo
    {
        [JsonPropertyName("photo_reference")]
        public string PhotoReference { get; set; }
    }

    // 地址組件：Google 會把地址拆成很多小塊
    public class AddressComponent
    {
        [JsonPropertyName("long_name")]
        public string LongName { get; set; }

        [JsonPropertyName("short_name")]
        public string ShortName { get; set; } // 這是我們要的 CountryCode 來源

        [JsonPropertyName("types")]
        public List<string> Types { get; set; }
    }
}