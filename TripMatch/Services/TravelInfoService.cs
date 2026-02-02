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

        private async Task<(string DepartInfo, string ReturnInfo, decimal Price)?> FetchFlightsAsync(
      string arrivalId, DateOnly startDate, DateOnly endDate, bool allowTransfer)
        {
            string apiKey = _configuration["SerpApi:Key"];
            string stopsParam = allowTransfer ? "2" : "0";

            string url = $"https://serpapi.com/search.json?engine=google_flights" +
                         $"&departure_id=TPE" +
                         $"&arrival_id={arrivalId}" +
                         $"&outbound_date={startDate:yyyy-MM-dd}" +
                         $"&return_date={endDate:yyyy-MM-dd}" +
                         $"&type=1" +                 // ✅ round trip
                         $"&currency=TWD" +
                         $"&hl=zh-TW" +
                         $"&gl=tw" +
                         $"&stops={stopsParam}" +
                         $"&api_key={apiKey}";

            try
            {
                var resp = await _httpClient.GetAsync(url);
                var body = await resp.Content.ReadAsStringAsync();
                if (!resp.IsSuccessStatusCode)
                {
                    Console.WriteLine($"[Flights Search Error] {(int)resp.StatusCode} {resp.ReasonPhrase}");
                    Console.WriteLine(body);
                    return ($"Error: {(int)resp.StatusCode}", "N/A", 0);
                }

                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<SerpApiFlightResponse>(body, options);

                var best = data?.best_flights?.FirstOrDefault()
                           ?? data?.other_flights?.FirstOrDefault();

                if (best?.flights == null || !best.flights.Any())
                    return null;

                // ✅ 去程：多段全部顯示
                string depInfo = FormatItinerary(best.flights);

                // ✅ 回程：用 departure_token 再查
                string retInfo = "N/A";
                if (!string.IsNullOrWhiteSpace(best.departure_token))
                {
                    var retData = await FetchByDepartureTokenAsync(arrivalId, startDate, endDate, stopsParam, best.departure_token, apiKey);

                    var bestReturn = retData?.best_flights?.FirstOrDefault()
                                  ?? retData?.other_flights?.FirstOrDefault();

                    retInfo = (bestReturn?.flights != null && bestReturn.flights.Any())
                        ? FormatItinerary(bestReturn.flights)
                        : "N/A (回程查無結果)";
                }
                else
                {
                    retInfo = "N/A (缺 departure_token)";
                }

                return (depInfo, retInfo, best.price);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Flight Error] {ex.Message}");
                return ($"Error: {ex.Message}", "N/A", 0);
            }
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
                string directLink =
                    data?.search_metadata?.prettify_html_file
                    ?? data?.search_metadata?.raw_html_file;

                if (data?.properties != null && data.properties.Any())
                {
                    // 抓第一間有價格的
                    var bestHotel = data.properties.FirstOrDefault(p => p.total_rate?.extracted_lowest != null || p.rate_per_night?.extracted_lowest != null);

                    if (bestHotel != null)
                    {
                        string displayName = bestHotel.name;
                        if (bestHotel.overall_rating > 0)
                            displayName += $" ({bestHotel.overall_rating}★)";

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
                    return ($"無搜尋結果 (Query: {query})", 0,
                            GenerateGoogleHotelsLink(cityName, checkIn, checkOut, rating, maxPrice));
                }
            }
            catch (Exception ex)
            {
                // ★★★ 關鍵修正：將錯誤訊息回傳到畫面上！ ★★★
                // 這樣你在前端卡片上看到 "Error: ..." 就知道發生什麼事了
                return ($"API Error: {ex.Message}", 0,
                        GenerateGoogleHotelsLink(cityName, checkIn, checkOut, rating, maxPrice));
            }

            return null;
        }

        // --- 輔助與備案 ---
        private string ExtractFlightInfo(FlightSegment segment)
        {
            if (segment == null) return "N/A";

            string from = segment.departure_airport?.id ?? "";
            string to = segment.arrival_airport?.id ?? "";

            string dep = segment.departure_airport?.time ?? "";
            string arr = segment.arrival_airport?.time ?? "";

            // "2026-02-20 08:50" -> "08:50"
            dep = dep.Contains(' ') ? dep.Split(' ')[1] : dep;
            arr = arr.Contains(' ') ? arr.Split(' ')[1] : arr;

            return $"{from}→{to} | {segment.airline} {segment.flight_number} ({dep}→{arr})";
        }

        private string FormatItinerary(List<FlightSegment> segs)
        {
            if (segs == null || segs.Count == 0) return "N/A";

            // 轉機點：取每段 arrival 的機場代碼（最後一段不算轉機點可自行調整）
            var stops = segs
                .Take(segs.Count - 1)
                .Select(s => s.arrival_airport?.id)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Distinct()
                .ToList();

            string stopsText = stops.Count > 0 ? $" | 轉機: {string.Join("→", stops)}" : "";

            // 航空段資訊：每段列出（不同航空公司就自然會出現）
            string segmentsText = string.Join(" + ", segs.Select(ExtractFlightInfo));

            // 路線：第一段出發 → 最後一段抵達
            string from = segs.First().departure_airport?.id ?? "";
            string to = segs.Last().arrival_airport?.id ?? "";

            return $"{from}→{to}{stopsText} | {segmentsText}";
        }

        private async Task<SerpApiFlightResponse?> FetchByDepartureTokenAsync(
     string arrivalId, DateOnly startDate, DateOnly endDate, string stopsParam, string token, string apiKey)
        {
            var url = $"https://serpapi.com/search.json?engine=google_flights" +
                      $"&departure_id=TPE" +
                      $"&arrival_id={arrivalId}" +
                      $"&outbound_date={startDate:yyyy-MM-dd}" +
                      $"&return_date={endDate:yyyy-MM-dd}" +
                      $"&type=1" +                    
                      $"&currency=TWD" +
                      $"&hl=zh-TW" +
                      $"&gl=tw" +
                      $"&stops={stopsParam}" +
                      $"&departure_token={Uri.EscapeDataString(token)}" +
                      $"&api_key={apiKey}";

            var resp = await _httpClient.GetAsync(url);
            var body = await resp.Content.ReadAsStringAsync();

            if (!resp.IsSuccessStatusCode)
            {
                Console.WriteLine($"[Flights Token  Error] {(int)resp.StatusCode} {resp.ReasonPhrase}");
                Console.WriteLine(body);
                throw new HttpRequestException($"SerpApi token request failed: {(int)resp.StatusCode}");
            }

            var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
            return JsonSerializer.Deserialize<SerpApiFlightResponse>(body, options);
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
            string link = $"https://www.google.com/travel/search?q={Uri.EscapeDataString(fullQuery)}";
            return link;
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