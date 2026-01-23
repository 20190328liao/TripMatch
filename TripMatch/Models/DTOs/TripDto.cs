using System.Diagnostics;
using System.Text.Json.Serialization;

namespace TripMatch.Models.DTOs
{
    public class TripDetailDto
    {
        public TripSimpleDto TripInfo { get; set; } = new TripSimpleDto();
        public List<FlightDto> Flights { get; set; } = [];
        public List<AccommodationDto> Accomadations { get; set; } = [];
        public List<ItineraryItemDto> ItineraryItems { get; set; } = [];
        public List<TripMemberDto> TripMembers { get; set; } = [];  
    }

    public class TripSimpleDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = String.Empty;
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
        public List<GeoDto> TripRegions { get; set; } = [];
        public string PhotoUrl { get; set; } = string.Empty;
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

    public class GeoDto
    {
        public double? Lat { get; set; }
        public double? Lng { get; set; }
    }

    public class FlightDto
    {
        public int Id { get; set; } 
        public int TripId { get; set; }
        public string Carrier { get; set; } = string.Empty;
        public string FlightNumber { get; set; } = string.Empty;
        public string DepTimeLocal { get; set; } = string.Empty;
        public string DepTimeUtc { get; set; } = string.Empty;
        public string ArrTimeLocal { get; set; } = string.Empty;
        public string ArrTimeUtc { get; set; } = string.Empty;
        public string FromAirport { get; set; } = string.Empty;
        public string ToAirport { get; set; } = string.Empty;
        public string FromLocation { get; set; } = string.Empty;
        public string ToLocation { get; set; } = string.Empty;
        public string RowVersion { get; set; } = string.Empty;

        // --- 內建轉換邏輯 ---

        // 取得出發時間的 DateTimeOffset
        public DateTimeOffset DepartDateTimeOffset => ConvertToOffset(DepTimeLocal, DepTimeUtc);

        // 取得抵達時間的 DateTimeOffset
        public DateTimeOffset ArriveDateTimeOffset => ConvertToOffset(ArrTimeLocal, ArrTimeUtc);

        private DateTimeOffset ConvertToOffset(string localStr, string utcStr)
        {
            DateTime local = DateTime.Parse(localStr);
            DateTime utc = DateTime.Parse(utcStr);

            // 利用 TimeOfDay 計算時差，並處理跨日邊界
            TimeSpan offset = local.TimeOfDay - utc.TimeOfDay;

            if (offset.TotalHours < -12) offset = offset.Add(TimeSpan.FromDays(1));
            if (offset.TotalHours > 14) offset = offset.Add(TimeSpan.FromDays(-1));

            return new DateTimeOffset(local, offset);
        }
    }

    public class AccommodationDto
    {
        public int Id { get; set; }
        public int TripId { get; set; }
        public int SpotId { get; set; }
        public string HotelName { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public DateTime CheckInDate { get; set; }
        public DateTime CheckOutDate { get; set; }
        public string RowVersion { get; set; } = string.Empty;
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
        public string RowVersion { get; set; } = string.Empty;
    }

    public class SpotProfileDto
    {
        public string PlaceId { get; set; } = string.Empty;
        public string Name_ZH { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public string PhotoUrl { get; set; } = string.Empty;
        public int LocationCategoryId { get; set; }   // 1:美食, 2:景點, 3:購物, 4:住宿, 5:交通, 6:自然
        public double Lat { get; set; }
        public double Lng { get; set; }
        public decimal Rating { get; set; }

    }

    public class SpotTimeDto
    {
        public int Id { get; set; }
        public TimeOnly StartTime { get; set; }
        public TimeOnly EndTime { get; set; }
        public string RowVersion { get; set; } = string.Empty;
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
        public List<string> LocationCategory { get; set; } = [];
        public string Address { get; set; } = String.Empty;
        public double Lat { get; set; }
        public double Lng { get; set; }
        public decimal Rating { get; set; }
        public int UserRatingsTotal { get; set; }
        public List<string> PhotosSnapshot { get; set; } = [];
    }

    public class WishlistDto
    {
        public int SpotId { get; set; }
        public bool AddToWishlist { get; set; }
    }

    public class TripMemberDto
    {
        public int UserId { get; set; }
        public string DisplayName { get; set; } = "";
        public byte RoleType { get; set; } // 1 owner, 2 member
    }

    public class TripCardDto
    {
        public int TripId { get; set; }
        public string Title { get; set; } = "";
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
        public string? CoverImageUrl { get; set; }

        public bool IsOwner { get; set; }
        public string DetailsUrl { get; set; } = "#";
        public string MembersUrl { get; set; } = "#";
    }

    // 最外層：接收 Google API 的完整回應
    public class GooglePlaceDetailDto
    {
        [JsonPropertyName("result")]
        public PlaceResult Result { get; set; } = new PlaceResult();

        [JsonPropertyName("status")]
        public string Status { get; set; }
    }

    public class PlaceResult
    {
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("formatted_address")]
        public string FormattedAddress { get; set; } = string.Empty;

        [JsonPropertyName("address_components")]
        public List<AddressComponent> AddressComponents { get; set; } = new List<AddressComponent>();

        [JsonPropertyName("types")]
        public List<string> Types { get; set; }

        // --- 新增：地理資訊欄位 ---
        [JsonPropertyName("geometry")]
        public Geometry Geometry { get; set; } = new Geometry();

        [JsonPropertyName("rating")]
        public decimal? Rating { get; set; } 

        [JsonPropertyName("user_ratings_total")]
        public int? UserRatingsTotal { get; set; }

        [JsonPropertyName("photos")]
        public List<GooglePhoto> Photos { get; set; } = new List<GooglePhoto>();
    }

    // 1. 定義 Geometry 物件
    public class Geometry
    {
        [JsonPropertyName("location")]
        public Location Location { get; set; } = new Location();
    }

    // 2. 定義 Location 物件 (這就是存取 Lat, Lng 的地方)
    public class Location
    {
        [JsonPropertyName("lat")]
        public double Lat { get; set; }

        [JsonPropertyName("lng")]
        public double Lng { get; set; }
    }

    public class AddressComponent
    {
        [JsonPropertyName("long_name")]
        public string LongName { get; set; }

        [JsonPropertyName("short_name")]
        public string ShortName { get; set; }

        [JsonPropertyName("types")]
        public List<string> Types { get; set; }
    }

    public class GooglePhoto
    {
        [JsonPropertyName("photo_reference")]
        public string PhotoReference { get; set; } = string.Empty;

        [JsonPropertyName("height")]
        public int Height { get; set; }

        [JsonPropertyName("width")]
        public int Width { get; set; }
    }
}