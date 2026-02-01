namespace TripMatch.Models.DTOs.External
{
    // 這是對應 SerpApi JSON 結構的簡化版
    public class SerpApiFlightResponse
    {
        public SearchMetadata search_metadata { get; set; }
        public List<FlightOption> best_flights { get; set; }
        public List<FlightOption> other_flights { get; set; }
    }

    public class SearchMetadata
    {
        public string id { get; set; }
        public string status { get; set; }
    }

    public class FlightOption
    {
        public List<FlightSegment> flights { get; set; }
        public int price { get; set; } // 這是單人價格
        public int total_duration { get; set; }
        public string departure_token { get; set; }

    }

    public class FlightSegment
    {
        public string flight_number { get; set; }
        public string airline { get; set; }
        public DepartureArrival departure_airport { get; set; }
        public DepartureArrival arrival_airport { get; set; }
    }

    public class DepartureArrival
    {
        public string time { get; set; } // 格式 "2024-02-20 08:00"
        public string id { get; set; }   // 機場代碼
    }
}