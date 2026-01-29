using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using TripMatch.Models.DTOs.External; // 確保有引用 SerpApi 的 DTO (包含 Flight 和 Hotel)

namespace TripMatch.Services
{
    /// <summary>
    /// 負責與外部 API (SerpApi / Google Flights / Google Hotels) 溝通的服務
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
        /// 主方法：根據地點代碼、日期、轉機偏好，查詢航班與飯店價格
        /// </summary>
        public async Task<TravelInfoResult> GetTravelInfoAsync(string placeRawString,
            DateOnly startDate,
            DateOnly endDate,
            bool allowTransfer,
            int? starRating = null,  // 沒人投星級時為 null
            decimal? maxPrice = null // 沒人投預算時為 null
        )
        {
            // 1. 解析輸入 (前端現在傳來的是機場代碼，例如 "NRT" 或 "NRT|成田")
            string targetCode = placeRawString;
            if (!string.IsNullOrEmpty(placeRawString) && placeRawString.Contains('|'))
            {
                targetCode = placeRawString.Split('|')[0].Trim();
            }

            string cityNameForHotel = AirportData.GetCityName(targetCode);

            // 2. 檢查開關：是否使用模擬數據 (省錢模式)
            bool useMock = _configuration.GetValue<bool>("SerpApi:UseMock");
            if (useMock)
            {
                return await GetMockDataAsync(cityNameForHotel, startDate, endDate);
            }

            // --- 3. 真實 API 並行呼叫 (加快速度) ---

            // Task A: 查機票 (使用機場代碼 targetCode)
            var flightTask = FetchFlightsAsync(targetCode, startDate, endDate, allowTransfer);

            // Task B: 查飯店 (使用城市名稱 cityNameForHotel)
            var hotelTask = FetchHotelPricesAsync(cityNameForHotel, startDate, endDate, starRating, maxPrice);

            // 等待兩者都完成
            await Task.WhenAll(flightTask, hotelTask);

            var flightResult = flightTask.Result;
            var hotelResult = hotelTask.Result;

            // 4. 產生訂購連結 (Deep Links)
            string flightLink = GenerateGoogleFlightsLink(targetCode, startDate, endDate);
            string hotelLink = GenerateGoogleHotelsLink(cityNameForHotel, startDate, endDate, starRating, maxPrice);

            // --- 整合結果 ---
            return new TravelInfoResult
            {
                // 機票資訊
                DepartFlight = flightResult?.DepartInfo ?? "查無航班",
                ReturnFlight = flightResult?.ReturnInfo ?? "查無航班",

                // 價格拆分 (方便除錯或顯示)
                FlightPrice = flightResult?.Price ?? 0,

                // 飯店資訊
                HotelName = hotelResult?.Name ?? "當地熱門飯店",

                // 總旅費計算：機票 + 飯店總價
                // (注意：如果查不到飯店，就只算機票錢，或者你可以加一個保底估算)
                TotalPrice = (flightResult?.Price ?? 0) + (hotelResult?.TotalPrice ?? 0),
                FlightLink = flightLink,
                HotelLink = hotelLink
            };
        }
        // [新增] 產生 Google Flights 連結
        private string GenerateGoogleFlightsLink(string destinationCode, DateOnly start, DateOnly end)
        {
            // 格式: https://www.google.com/travel/flights?q=Flights%20to%20NRT%20from%20TPE%20on%202024-05-01%20through%202024-05-05
            string query = $"Flights to {destinationCode} from TPE on {start:yyyy-MM-dd} through {end:yyyy-MM-dd}";
            return $"https://www.google.com/travel/flights?q={Uri.EscapeDataString(query)}";
        }

        // [新增] 產生 Google Hotels 連結
        private string GenerateGoogleHotelsLink(string cityName, DateOnly start, DateOnly end, int? rating, decimal? maxPrice)
        {
            string query = $"{cityName} {rating} star hotel";

            var link = $"https://www.google.com/travel/hotels?" +
                       $"q={Uri.EscapeDataString(query)}" +
                       $"&checkin={start:yyyy-MM-dd}" +
                       $"&checkout={end:yyyy-MM-dd}";

            // 如果有預算，嘗試帶入 (Google Travel URL 參數較複雜，這裡我們試著加在 query 或使用 price filter)
            // 為了簡單有效，我們將 "under {price}" 加到搜尋關鍵字中，這對 Google 搜尋非常有效
            if (maxPrice.HasValue)
            {
                string priceQuery = $"{cityName} {rating} star hotel under {maxPrice.Value} TWD";
                link = $"https://www.google.com/travel/hotels?" +
                       $"q={Uri.EscapeDataString(priceQuery)}" +
                       $"&checkin={start:yyyy-MM-dd}" +
                       $"&checkout={end:yyyy-MM-dd}";
            }

            return link;
        }

        // --- 私有方法：查機票 (SerpApi Google Flights) ---
        private async Task<(string DepartInfo, string ReturnInfo, decimal Price)?> FetchFlightsAsync(string arrivalId, DateOnly startDate, DateOnly endDate, bool allowTransfer)
        {
            string apiKey = _configuration["SerpApi:Key"];
            string stopsParam = allowTransfer ? "0" : "1"; // 0=Any, 1=1 stop or fewer

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
                var responseString = await _httpClient.GetStringAsync(url);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<SerpApiFlightResponse>(responseString, options);

                var best = data?.best_flights?.FirstOrDefault();

                if (best != null)
                {
                    string depInfo = ExtractFlightInfo(best.flights.FirstOrDefault());
                    string retInfo = ExtractFlightInfo(best.flights.LastOrDefault());
                    return (depInfo, retInfo, best.price);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TravelInfoService-Flight] Error: {ex.Message}");
            }
            return null;
        }

        // --- 私有方法：查飯店 (SerpApi Google Hotels) ---
        // [修正版] 支援可空星級 (int?) 與可空預算 (decimal?) 的飯店搜尋方法
        private async Task<(string Name, decimal TotalPrice)?> FetchHotelPricesAsync(string cityName, DateOnly checkIn, DateOnly checkOut, int? rating, decimal? maxPrice)
        {
            string apiKey = _configuration["SerpApi:Key"];

            // 1. 動態組裝關鍵字
            // 如果 rating 是 null -> 搜尋 "Tokyo hotel" (廣泛搜尋)
            // 如果 rating 是 4 -> 搜尋 "Tokyo 4 star hotel" (精確搜尋)
            string query = $"{cityName} hotel";
            if (rating.HasValue)
            {
                query = $"{cityName} {rating} star hotel";
            }

            // 2. 組裝基礎 URL
            var url = $"https://serpapi.com/search.json?engine=google_hotels" +
                      $"&q={Uri.EscapeDataString(query)}" +
                      $"&check_in_date={checkIn:yyyy-MM-dd}" +
                      $"&check_out_date={checkOut:yyyy-MM-dd}" +
                      $"&currency=TWD" +
                      $"&hl=zh-TW" +
                      $"&gl=tw" +
                      $"&api_key={apiKey}";

            // 3. 加入預算限制 (如果有的話)
            // SerpApi 的 max_price 參數可以過濾每晚價格
            if (maxPrice.HasValue)
            {
                url += $"&max_price={(int)maxPrice.Value}";
            }

            try
            {
                var responseString = await _httpClient.GetStringAsync(url);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<SerpApiHotelResponse>(responseString, options);

                if (data?.properties != null && data.properties.Any())
                {
                    // 策略：取第一間有標價的飯店
                    var bestHotel = data.properties.FirstOrDefault(p => p.total_rate?.extracted_lowest != null || p.rate_per_night?.extracted_lowest != null);

                    if (bestHotel != null)
                    {
                        string displayName = bestHotel.name;
                        if (bestHotel.overall_rating > 0)
                            displayName += $" ({bestHotel.overall_rating}★)";

                        // 優先取總價 (total_rate)
                        decimal price = bestHotel.total_rate?.extracted_lowest ?? 0;

                        // 若無總價 (API 有時只回傳每晚單價)，則手動計算總價
                        if (price == 0 && bestHotel.rate_per_night?.extracted_lowest != null)
                        {
                            int nights = checkOut.DayNumber - checkIn.DayNumber;
                            if (nights < 1) nights = 1;
                            price = (decimal)bestHotel.rate_per_night.extracted_lowest * nights;
                        }

                        return (displayName, price);
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[TravelInfoService-Hotel] Error: {ex.Message}");
            }

            return null; // 查無資料
        }

        // --- 輔助方法 ---
        private string ExtractFlightInfo(FlightSegment segment)
        {
            if (segment == null) return "N/A";
            string timeOnly = segment.departure_airport?.time ?? "";
            var timeParts = timeOnly.Split(' ');
            if (timeParts.Length > 1) timeOnly = timeParts[1];
            return $"{segment.airline} {segment.flight_number} ({timeOnly})";
        }

        // --- Mock 數據 ---
        private async Task<TravelInfoResult> GetMockDataAsync(string cityName, DateOnly startDate, DateOnly endDate)
        {
            await Task.Delay(500);
            var nights = endDate.DayNumber - startDate.DayNumber;
            if (nights < 1) nights = 1;

            var random = new Random();
            decimal flightPrice = 12000 + (nights * 500); // 隨便算
            decimal hotelPrice = 3000 * nights;

            return new TravelInfoResult
            {
                DepartFlight = $"BR-{random.Next(100, 999)} (09:00 - 13:00)",
                ReturnFlight = $"CI-{random.Next(100, 999)} (14:00 - 18:00)",
                FlightPrice = flightPrice,
                HotelName = $"{cityName} 皇家大飯店 (Royal Hotel)",
                TotalPrice = flightPrice + hotelPrice
            };
        }
    }

    /// <summary>
    /// 回傳結果 DTO (建議如果有多個檔案使用，移到 Models 資料夾)
    /// </summary>
    public class TravelInfoResult
    {
        public string DepartFlight { get; set; }
        public string ReturnFlight { get; set; }

        public decimal FlightPrice { get; set; } // 單純機票錢
        public decimal TotalPrice { get; set; }  // 機票 + 住宿

        public string HotelName { get; set; }

        public string FlightLink { get; set; } // 機票訂購連結
        public string HotelLink { get; set; }  // 飯店訂購連結
    }
}