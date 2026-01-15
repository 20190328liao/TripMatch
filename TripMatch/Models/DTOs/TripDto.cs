using System.Diagnostics;
using System.Text.Json.Serialization;

namespace TripMatch.Models.DTOs
{
    public class TripDetailDto
    {
        public TripSimpleDto TripInfo { get; set; } = new TripSimpleDto();
        public List<ItineraryItemDto> ItineraryItems { get; set; } = [];
    }

    public class TripSimpleDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = String.Empty;
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
        public List<string> DateStrings
        {
            get
            {
                var dateList = new List<string>();
                for (DateOnly date = StartDate; date <= EndDate; date = date.AddDays(1))
                {
                    dateList.Add(date.ToString("yyyy-MM-dd"));
                }
                return dateList;
            }
        }
    }

    public class ItineraryItemDto
    {
        public int Id { get; set; } 
        public int TripId { get; set; }
        public int SpotId { get; set; }
        public int DayNumber { get; set; }
        public TimeOnly StartTime { get; set; }
        public TimeOnly EndTime { get; set; }
        public int SortOrder { get; set; }
        public SpotProfileDto Profile { get; set; } = new SpotProfileDto();
    }

    public class SpotProfileDto
    {
        public string PlaceId { get; set; } = string.Empty;
        public string Name_ZH { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string PhotoUrl { get; set; } = string.Empty;
        public decimal Lat { get; set; }
        public decimal Lng { get; set; }
        public decimal Rating { get; set; }

    }

    public class TripCreateDto
    {
        public string Title { get; set; } = String.Empty;
        public string[] PlaceIds { get; set; } = [];
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
    }

    public class PlaceSnapshotDto
    {
        public string ExternalPlaceId { get; set; } = String.Empty;
        public string NameZh { get; set; } = String.Empty;
        public string NameEn { get; set; } = String.Empty;
        public string LocationCategory { get; set; } = String.Empty;
        public string Address { get; set; } = String.Empty;
        public decimal Lat { get; set; }
        public decimal Lng { get; set; }
        public decimal Rating { get; set; }
        public int UserRatingsTotal { get; set; }
        public List<string> PhotosSnapshot { get; set; } = [];
    }

    public class WishlistDto
    {
        public int SpotId { get; set; }
        public bool AddToWishlist { get; set; }
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
        public List<string> Types { get; set; }
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
