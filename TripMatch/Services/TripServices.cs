using TripMatch.Models.DTOs;

namespace TripMatch.Services
{
    public class TripServices
    {

        public List<TripDto> GetMockTrips()
        {
            return new List<TripDto> {
            new TripDto { TripId = 1, TripName = "東京探險", LocationName = "日本" },
            new TripDto { TripId = 2, TripName = "墾丁衝浪", LocationName = "台灣" }
        };
        }
    }
}
