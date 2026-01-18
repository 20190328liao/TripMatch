using System.Diagnostics;
using System.Text.Json.Serialization;

namespace TripMatch.Models.DTOs
{
    public class TripDetailDto
    {
        public TripSimpleDto TripInfo { get; set; } = new TripSimpleDto();
        public AccomadationDto Accomadation { get; set; } = new AccomadationDto();  
        public List<ItineraryItemDto> ItineraryItems { get; set; } = [];
    }

    public class TripSimpleDto
    {
        public int Id { get; set; }
        public string Title { get; set; } = String.Empty;
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
        public decimal? Lat { get; set; }
        public decimal? Lng { get; set; }
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

    public class FlightDto
    {
        public int TripId { get; set; }
        public string Carrier { get; set; } = string.Empty;
        public string FlightNumber { get; set; } = string.Empty;   
        public TimeOnly DepartureTime { get; set; }    
        public TimeOnly ArrivalTime { get; set; }
        public string FromAirport { get; set; } = string.Empty;
        public string ToAirport { get; set; } = string.Empty;
    }   

    public class AccomadationDto
    {
        public int TripId { get; set; }
        public int SpotId { get; set; }
        public string HotelName { get; set; } = string.Empty;
        public string Address { get; set; } = string.Empty;
        public DateOnly CheckInDate { get; set; }
        public DateOnly CheckOutDate { get; set; }
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

    public class SpotTimeDto
    {
        public int Id { get; set; }
        public TimeOnly StartTime { get; set; }
        public TimeOnly EndTime { get; set; }
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

        public bool IsOwner { get; set; } // 目前固定，之後做團主判斷(從 TripMembers 中 RoleType 抓)
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
        public string Name { get; set; }

        [JsonPropertyName("address_components")]
        public List<AddressComponent> AddressComponents { get; set; } = new List<AddressComponent>();

        [JsonPropertyName("types")]
        public List<string> Types { get; set; }

        // --- 新增：地理資訊欄位 ---
        [JsonPropertyName("geometry")]
        public Geometry Geometry { get; set; } = new Geometry();
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
        public decimal Lat { get; set; }

        [JsonPropertyName("lng")]
        public decimal Lng { get; set; }
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
}