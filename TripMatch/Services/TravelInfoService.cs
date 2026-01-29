using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;
using TripMatch.Models.DTOs.External;

namespace TripMatch.Services
{
    public class TravelInfoService
    {
        private readonly IConfiguration _configuration;
        private readonly HttpClient _httpClient;

        public TravelInfoService(IConfiguration configuration, HttpClient httpClient)
        {
            _configuration = configuration;
            _httpClient = httpClient;
        }

        public async Task<TravelInfoResult> GetTravelInfoAsync(string placeRawString,
            DateOnly startDate,
            DateOnly endDate,
            bool allowTransfer,
            int? starRating = null,
            decimal? maxPrice = null
        )
        {
            string targetCode = placeRawString;
            if (!string.IsNullOrEmpty(placeRawString) && placeRawString.Contains('|'))
            {
                targetCode = placeRawString.Split('|')[0].Trim();
            }

            string cityNameForHotel = AirportData.GetCityName(targetCode);

            // Mock 模式檢查
            bool useMock = _configuration.GetValue<bool>("SerpApi:UseMock");
            if (useMock)
            {
                return await GetMockDataAsync(cityNameForHotel, startDate, endDate);
            }

            // --- 並行呼叫 ---
            var flightTask = FetchFlightsAsync(targetCode, startDate, endDate, allowTransfer);
            var hotelTask = FetchHotelPricesAsync(cityNameForHotel, startDate, endDate, starRating, maxPrice);

            await Task.WhenAll(flightTask, hotelTask);

            var flightResult = flightTask.Result;
            var hotelResult = hotelTask.Result;

            // 產生連結
            string flightLink = GenerateGoogleFlightsLink(targetCode, startDate, endDate);

            // ★★★ 飯店連結邏輯 ★★★
            string hotelLink;
            if (hotelResult != null && !string.IsNullOrEmpty(hotelResult.Value.Url))
            {
                hotelLink = hotelResult.Value.Url; // 優先用 API 給的
            }
            else
            {
                hotelLink = GenerateGoogleHotelsLink(cityNameForHotel, startDate, endDate, starRating, maxPrice); // 備案
            }

            return new TravelInfoResult
            {
                // 機票
                DepartFlight = flightResult?.DepartInfo ?? "查無航班",
                ReturnFlight = flightResult?.ReturnInfo ?? "查無航班", // 這裡現在會更準確
                FlightPrice = flightResult?.Price ?? 0,

                // 飯店
                HotelName = hotelResult?.Name ?? "當地熱門飯店 (API 無回應)", // 如果 null 顯示這個
                TotalPrice = (flightResult?.Price ?? 0) + (hotelResult?.TotalPrice ?? 0),

                FlightLink = flightLink,
                HotelLink = hotelLink
            };
        }

        // --- 查機票 (修正回程邏輯) ---
        private async Task<(string DepartInfo, string ReturnInfo, decimal Price)?> FetchFlightsAsync(string arrivalId, DateOnly startDate, DateOnly endDate, bool allowTransfer)
        {
            string apiKey = _configuration["SerpApi:Key"];
            string stopsParam = allowTransfer ? "0" : "1";

            string url = $"https://serpapi.com/search.json?engine=google_flights" +
                         $"&departure_id=TPE" +
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

                if (best != null && best.flights != null)
                {
                    // ★★★ 修正邏輯：精準抓取去程與回程 ★★★

                    // 1. 去程：第一段一定是從 TPE 出發 (或列表的第一個)
                    var departSegment = best.flights.FirstOrDefault();

                    // 2. 回程：找出第一段「出發地不是 TPE」且「出發地接近目的地」的段落
                    // 簡單判斷：列表後半段的第一個，或是「出發地」等於「目的地」的段落
                    // 這裡用一個比較通用的邏輯：找出列表中第一個「出發機場」跟「去程出發機場」不一樣的段落
                    var returnSegment = best.flights.FirstOrDefault(f =>
                        f.departure_airport?.id != departSegment?.departure_airport?.id &&
                        f.departure_airport?.id != "TPE");

                    // 如果找不到 (例如單程或資料怪異)，就拿最後一段 (雖然可能是錯的但比沒有好)
                    if (returnSegment == null && best.flights.Count > 1)
                    {
                        returnSegment = best.flights.LastOrDefault();
                    }

                    string depInfo = ExtractFlightInfo(departSegment);
                    string retInfo = ExtractFlightInfo(returnSegment);

                    // Debug: 如果只有一段，標記一下
                    if (best.flights.Count == 1) retInfo += " (單程?)";

                    return (depInfo, retInfo, best.price);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Flight Error] {ex.Message}");
                return ($"Error: {ex.Message}", "N/A", 0);
            }
            return null;
        }

        // --- 查飯店 (顯示錯誤訊息版) ---
        private async Task<(string Name, decimal TotalPrice, string Url)?> FetchHotelPricesAsync(string cityName, DateOnly checkIn, DateOnly checkOut, int? rating, decimal? maxPrice)
        {
            string apiKey = _configuration["SerpApi:Key"];
            string query = $"{cityName} hotel";
            if (rating.HasValue) query = $"{cityName} {rating} star hotel";

            var url = $"https://serpapi.com/search.json?engine=google_hotels" +
                      $"&q={Uri.EscapeDataString(query)}" +
                      $"&check_in_date={checkIn:yyyy-MM-dd}" +
                      $"&check_out_date={checkOut:yyyy-MM-dd}" +
                      $"&currency=TWD" +
                      $"&hl=zh-TW" +
                      $"&gl=tw" +
                      $"&api_key={apiKey}";

            if (maxPrice.HasValue) url += $"&max_price={(int)maxPrice.Value}";

            try
            {
                var responseString = await _httpClient.GetStringAsync(url);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };

                // 這裡會用到我們之前修好的 DTO
                var data = JsonSerializer.Deserialize<SerpApiHotelResponse>(responseString, options);

                // 取得直連網址
                string directLink = data?.search_metadata?.google_hotels_url;

                if (data?.properties != null && data.properties.Any())
                {
                    // 抓第一間有價格的
                    var bestHotel = data.properties.FirstOrDefault(p => p.total_rate?.extracted_lowest != null || p.rate_per_night?.extracted_lowest != null);

                    if (bestHotel != null)
                    {
                        string displayName = bestHotel.name;
                        if (bestHotel.overall_rating > 0) displayName += $" ({bestHotel.overall_rating}★)";

                        decimal price = bestHotel.total_rate?.extracted_lowest ?? 0;
                        if (price == 0 && bestHotel.rate_per_night?.extracted_lowest != null)
                        {
                            int nights = checkOut.DayNumber - checkIn.DayNumber;
                            if (nights < 1) nights = 1;
                            price = (decimal)bestHotel.rate_per_night.extracted_lowest * nights;
                        }

                        if (string.IsNullOrEmpty(directLink))
                            directLink = GenerateGoogleHotelsLink(cityName, checkIn, checkOut, rating, maxPrice);

                        return (displayName, price, directLink);
                    }
                }
                else
                {
                    // ★★★ 如果 JSON 解析成功但沒飯店，回傳這個訊息 ★★★
                    return ($"無搜尋結果 (Query: {query})", 0, null);
                }
            }
            catch (Exception ex)
            {
                // ★★★ 關鍵修正：將錯誤訊息回傳到畫面上！ ★★★
                // 這樣你在前端卡片上看到 "Error: ..." 就知道發生什麼事了
                return ($"API Error: {ex.Message}", 0, null);
            }

            return null;
        }

        // --- 輔助與備案 ---
        private string ExtractFlightInfo(FlightSegment segment)
        {
            if (segment == null) return "N/A";
            string timeOnly = segment.departure_airport?.time ?? "";
            var timeParts = timeOnly.Split(' ');
            if (timeParts.Length > 1) timeOnly = timeParts[1];
            return $"{segment.airline} {segment.flight_number} ({timeOnly})";
        }

        // 保留備案
        private string GenerateGoogleFlightsLink(string destinationCode, DateOnly start, DateOnly end)
        {
            string query = $"Flights to {destinationCode} from TPE on {start:yyyy-MM-dd} through {end:yyyy-MM-dd}";
            return $"https://www.google.com/travel/flights?q={Uri.EscapeDataString(query)}";
        }

        private string GenerateGoogleHotelsLink(string cityName, DateOnly start, DateOnly end, int? rating, decimal? maxPrice)
        {
            string baseQuery = $"{cityName} hotel";
            if (rating.HasValue) baseQuery = $"{cityName} {rating} star hotel";
            string dateQuery = $"check in {start:yyyy-MM-dd} check out {end:yyyy-MM-dd}";
            string fullQuery = $"{baseQuery} {dateQuery}";
            if (maxPrice.HasValue) fullQuery += $" under {maxPrice.Value} TWD";

            return $"https://www.google.com/travel/hotels?q={Uri.EscapeDataString(fullQuery)}";
        }

        private async Task<TravelInfoResult> GetMockDataAsync(string cityName, DateOnly startDate, DateOnly endDate)
        {
            await Task.Delay(500);
            return new TravelInfoResult
            {
                DepartFlight = "MOCK-101 (10:00)",
                ReturnFlight = "MOCK-102 (14:00)",
                FlightPrice = 15000,
                HotelName = $"{cityName} Mock Hotel",
                TotalPrice = 20000,
                HotelLink = "#",
                FlightLink = "#"
            };
        }
    }
    public class TravelInfoResult
    {
        public string DepartFlight { get; set; }
        public string ReturnFlight { get; set; }

        public decimal FlightPrice { get; set; }
        public decimal TotalPrice { get; set; }

        public string HotelName { get; set; }

        public string FlightLink { get; set; }
        public string HotelLink { get; set; }
    }
}