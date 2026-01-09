using TripMatch.Models; // 為了使用 Recommandation 類別 (如果不回傳 Entity 可改用自訂 DTO)

namespace TripMatch.Services
{
    public interface ITravelInfoService
    {
         Task<TravelPlanInfo> GetTravelInfoAsync(string location, DateOnly startDate, DateOnly endDate);
    }

    public class TravelPlanInfo
    {
        public string DepartFlight { get; set; } = string.Empty; // 去程航班
        public string ReturnFlight { get; set; } = string.Empty; // 回程航班
        public string Hotel { get; set; } = string.Empty;        // 推薦飯店
        public decimal Price { get; set; }                       // 預估總價
    }
}