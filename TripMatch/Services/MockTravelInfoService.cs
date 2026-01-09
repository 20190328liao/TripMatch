namespace TripMatch.Services
{
    public class MockTravelInfoService : ITravelInfoService
    {
        public async Task<TravelPlanInfo> GetTravelInfoAsync(string location, DateOnly startDate, DateOnly endDate)
        {
            await Task.Delay(500);

            var days = endDate.DayNumber - startDate.DayNumber;
            var random = new Random();
            var basePrice = 15000 + (days * 3000); // 簡單計價公式

            return new TravelPlanInfo
            {
                DepartFlight = $"BR-{random.Next(100, 999)} (09:00 - 13:00)",
                ReturnFlight = $"BR-{random.Next(100, 999)} (14:00 - 18:00)",
                Hotel = $"{location} 皇家大飯店 (Royal Hotel)",
                Price = basePrice + random.Next(-2000, 2000)
            };
        }
    }
}