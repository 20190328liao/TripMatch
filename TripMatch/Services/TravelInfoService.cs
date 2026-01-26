using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using TripMatch.Models.DTOs.External; // 確保有引用 SerpApi 的 DTO

namespace TripMatch.Services
{
    /// <summary>
    /// 負責與外部 API (SerpApi / Google Flights) 溝通的服務
    /// </summary>
    public class TravelInfoService
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public TravelInfoService(IConfiguration configuration, HttpClient httpClient)
        {
            _configuration = configuration;
            _httpClient = httpClient;
        }

        /// <summary>
        /// 主方法：根據地點、日期、轉機偏好，查詢航班與價格
        /// </summary>
        public async Task<TravelInfoResult> GetTravelInfoAsync(string placeRawString, DateOnly startDate, DateOnly endDate, bool allowTransfer)
        {
            // 1. 檢查開關：是否使用模擬數據 (省錢模式)
            bool useMock = _configuration.GetValue<bool>("SerpApi:UseMock");
            if (useMock)
            {
                return await GetMockDataAsync(placeRawString, startDate, endDate);
            }

            // --- 以下為真實 API 呼叫邏輯 ---

            // 2. 解析地點 (防呆處理)
            string cityName = placeRawString;
            if (!string.IsNullOrEmpty(placeRawString) && placeRawString.Contains('|'))
            {
                cityName = placeRawString.Split('|')[0].Trim();
            }

            // 3. 取得機場代碼 (呼叫 AirportData)
            string arrivalId;
            if (AirportData.CityCodes.TryGetValue(cityName, out string code))
            {
                arrivalId = code;
            }
            else
            {
                arrivalId = cityName; // 字典沒有，直接傳英文名
            }

            // 4. 準備參數與 URL
            string apiKey = _configuration["SerpApi:Key"];
            string stopsParam = allowTransfer ? "0" : "1"; // 0=Any, 1=1 stop or fewer (近似直飛)

            string url = $"https://serpapi.com/search.json?engine=google_flights" +
                         $"&departure_id=TPE" +               // 固定從台北出發
                         $"&arrival_id={arrivalId}" +
                         $"&outbound_date={startDate:yyyy-MM-dd}" +
                         $"&return_date={endDate:yyyy-MM-dd}" +
                         $"&currency=TWD" +
                         $"&hl=zh-TW" +
                         $"&stops={stopsParam}" +
                         $"&api_key={apiKey}";

            try
            {
                // 5. 發送請求
                var responseString = await _httpClient.GetStringAsync(url);

                // 6. 解析 JSON
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<SerpApiFlightResponse>(responseString, options);

                // 7. 讀取最佳航班
                var best = data?.best_flights?.FirstOrDefault();

                if (best != null)
                {
                    // 解析去程
                    var outboundSeg = best.flights.FirstOrDefault();
                    string depInfo = ExtractFlightInfo(outboundSeg);

                    // 解析回程
                    var inboundSeg = best.flights.LastOrDefault();
                    string retInfo = ExtractFlightInfo(inboundSeg);

                    return new TravelInfoResult
                    {
                        DepartFlight = depInfo,
                        ReturnFlight = retInfo,
                        Price = best.price,
                        Hotel = "系統估算飯店"
                    };
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TravelInfoService] Error: {ex.Message}");
                // 實務上這裡應該用 ILogger 記錄錯誤
            }

            // 8. 發生錯誤或查無資料的回傳預設值
            return new TravelInfoResult
            {
                DepartFlight = "查無航班",
                ReturnFlight = "查無航班",
                Price = 0,
                Hotel = "查無資料"
            };
        }

        /// <summary>
        /// 輔助方法：解析航班區段資訊
        /// </summary>
        private string ExtractFlightInfo(FlightSegment segment)
        {
            if (segment == null) return "N/A";

            // 嘗試解析時間 "2024-02-20 08:50" -> 取 "08:50"
            string timeOnly = segment.departure_airport?.time ?? "";
            var timeParts = timeOnly.Split(' ');
            if (timeParts.Length > 1) timeOnly = timeParts[1];

            return $"{segment.airline} {segment.flight_number} ({timeOnly})";
        }

        /// <summary>
        /// 私有方法：產生模擬數據 (不扣錢)
        /// </summary>
        private async Task<TravelInfoResult> GetMockDataAsync(string location, DateOnly startDate, DateOnly endDate)
        {
            await Task.Delay(500); // 模擬延遲

            var days = endDate.DayNumber - startDate.DayNumber + 1;
            var random = new Random();
            var basePrice = 12000 + (days * 2000);

            string cityName = location.Contains("|") ? location.Split('|')[0] : location;

            return new TravelInfoResult
            {
                DepartFlight = $"BR-{random.Next(100, 999)} (09:00 - 13:00)",
                ReturnFlight = $"CI-{random.Next(100, 999)} (14:00 - 18:00)",
                Hotel = $"{cityName} 皇家大飯店 (Royal Hotel)",
                Price = basePrice + random.Next(-3000, 3000)
            };
        }
    }

    /// <summary>
    /// 回傳結果 DTO
    /// </summary>
    public class TravelInfoResult
    {
        public string DepartFlight { get; set; }
        public string ReturnFlight { get; set; }
        public decimal Price { get; set; }
        public string Hotel { get; set; }
    }
}