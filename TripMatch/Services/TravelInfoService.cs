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
            int adults = 1,
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

            bool useMock = _configuration.GetValue<bool>("SerpApi:UseMock");
            if (useMock)
            {
                return await GetMockDataAsync(cityNameForHotel, startDate, endDate);
            }

            var flightTask = FetchFlightsAsync(targetCode, startDate, endDate, allowTransfer, adults);
            var hotelTask = FetchHotelPricesAsync(cityNameForHotel, startDate, endDate, starRating, maxPrice);

            await Task.WhenAll(flightTask, hotelTask);

            var flightResult = flightTask.Result;
            var hotelResult = hotelTask.Result;

            string flightLink = flightResult?.Link;

            if (string.IsNullOrEmpty(flightLink))
            {
                var airlines = flightResult?.Airlines ?? new List<string>();
                flightLink = GenerateGoogleFlightsLink(targetCode, startDate, endDate, adults, allowTransfer, airlines);
            }

            string hotelLink;
            if (hotelResult != null && !string.IsNullOrEmpty(hotelResult.Value.Url))
            {
                hotelLink = hotelResult.Value.Url;
            }
            else
            {
                hotelLink = GenerateGoogleHotelsLink(cityNameForHotel, startDate, endDate, starRating, maxPrice);
            }

            return new TravelInfoResult
            {
                DepartFlight = flightResult?.DepartInfo ?? "查無航班",
                ReturnFlight = flightResult?.ReturnInfo ?? "查無航班",
                FlightPrice = flightResult?.Price ?? 0,
                HotelName = hotelResult?.Name ?? "當地熱門飯店 (API 無回應)",
                TotalPrice = (flightResult?.Price ?? 0) + (hotelResult?.TotalPrice ?? 0),
                FlightLink = flightLink,
                HotelLink = hotelLink
            };
        }

        // --- 查機票 (修正版：價格精準計算) ---
        private async Task<(string DepartInfo, string ReturnInfo, decimal Price, string Link, List<string> Airlines)?> FetchFlightsAsync(string arrivalId, DateOnly startDate, DateOnly endDate, bool allowTransfer, int adults)
        {
            string apiKey = _configuration["SerpApi:Key"] ?? string.Empty;
            string stopsQueryPart = allowTransfer ? "" : "&stops=0";

            string url = $"https://serpapi.com/search.json?engine=google_flights" +
                         $"&departure_id=TPE" +
                         $"&arrival_id={arrivalId}" +
                         $"&outbound_date={startDate:yyyy-MM-dd}" +
                         $"&return_date={endDate:yyyy-MM-dd}" +
                         $"&currency=TWD" +
                         $"&hl=zh-TW" +
                         $"&adults={adults}" +
                         $"{stopsQueryPart}" +
                         $"&api_key={apiKey}";

            try
            {
                var responseString = await _httpClient.GetStringAsync(url);
                var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
                var data = JsonSerializer.Deserialize<SerpApiFlightResponse>(responseString, options);

                string deepLink = "";
                try
                {
                    using (JsonDocument doc = JsonDocument.Parse(responseString))
                    {
                        if (doc.RootElement.TryGetProperty("search_metadata", out var meta) &&
                            meta.TryGetProperty("google_flights_url", out var urlProp))
                        {
                            deepLink = urlProp.GetString();
                        }
                    }
                }
                catch { }

                var bestCandidates = data?.best_flights ?? data?.other_flights;
                FlightOption? bestTrip = null;

                if (bestCandidates != null)
                {
                    foreach (var trip in bestCandidates)
                    {
                        if (trip.flights != null && trip.flights.Count > 1)
                        {
                            bestTrip = trip;
                            break;
                        }
                    }
                    if (bestTrip == null) bestTrip = bestCandidates.FirstOrDefault();
                }

                if (bestTrip == null) return ("查無航班", "查無航班", 0, deepLink, new List<string>());

                var flightSegments = bestTrip.flights;
                if (flightSegments == null || !flightSegments.Any()) return ("資料解析錯誤", "N/A", 0, deepLink, new List<string>());

                var foundAirlines = new HashSet<string>();
                var departSegment = flightSegments.First();
                if (!string.IsNullOrEmpty(departSegment.flight_number) && departSegment.flight_number.Length >= 2)
                {
                    foundAirlines.Add(departSegment.flight_number.Substring(0, 2));
                }

                string depInfo = ExtractFlightInfo(flightSegments);

                FlightSegment? returnSegment = null;
                bool isRoundTripFound = false;
                List<FlightSegment>? returnSegmentsList = null;

                if (flightSegments.Count > 1)
                {
                    var lastSeg = flightSegments.Last();
                    if (lastSeg.departure_airport?.id == arrivalId)
                    {
                        returnSegmentsList = new List<FlightSegment> { lastSeg };
                        isRoundTripFound = true;
                    }
                }

                // 初始價格：如果找到完整來回，這就是總價
                decimal totalPrice = (decimal)bestTrip.price;

                // ★★★ 價格修正邏輯：如果需要反向搜尋 (Split Ticket) ★★★
                if (!isRoundTripFound)
                {
                    // 1. 先把價格歸零，因為 bestTrip.price 可能是來回總價，直接加會重複
                    // 我們改為：重新查「去程單程」 + 加上「回程單程」
                    totalPrice = 0;

                    // 步驟 A: 重查去程單程 (為了精準價格)
                    string oneWayGoUrl = $"https://serpapi.com/search.json?engine=google_flights" +
                                         $"&departure_id=TPE" +
                                         $"&arrival_id={arrivalId}" +
                                         $"&outbound_date={startDate:yyyy-MM-dd}" +
                                         $"&type=2" + // 單程
                                         $"&currency=TWD" +
                                         $"&hl=zh-TW" +
                                         $"&adults={adults}" +
                                         $"{stopsQueryPart}" +
                                         $"&api_key={apiKey}";
                    try
                    {
                        var goResStr = await _httpClient.GetStringAsync(oneWayGoUrl);
                        var goData = JsonSerializer.Deserialize<SerpApiFlightResponse>(goResStr, options);
                        var goBest = goData?.best_flights?.FirstOrDefault() ?? goData?.other_flights?.FirstOrDefault();
                        if (goBest != null)
                        {
                            totalPrice += (decimal)goBest.price;
                        }
                        else
                        {
                            // 萬一單程查不到，回退到用原本的一半估算
                            totalPrice += (decimal)bestTrip.price / 2;
                        }
                    }
                    catch
                    {
                        totalPrice += (decimal)bestTrip.price / 2;
                    }

                    // 步驟 B: 查回程單程
                    string returnUrl = $"https://serpapi.com/search.json?engine=google_flights" +
                                       $"&departure_id={arrivalId}" +
                                       $"&arrival_id=TPE" +
                                       $"&outbound_date={endDate:yyyy-MM-dd}" +
                                       $"&type=2" +
                                       $"&currency=TWD" +
                                       $"&hl=zh-TW" +
                                       $"&adults={adults}" +
                                       $"{stopsQueryPart}" +
                                       $"&api_key={apiKey}";
                    try
                    {
                        var returnResStr = await _httpClient.GetStringAsync(returnUrl);
                        var returnData = JsonSerializer.Deserialize<SerpApiFlightResponse>(returnResStr, options);
                        var returnCandidate = returnData?.best_flights?.FirstOrDefault() ?? returnData?.other_flights?.FirstOrDefault();

                        if (returnCandidate != null && returnCandidate.flights != null && returnCandidate.flights.Any())
                        {
                            returnSegmentsList = returnCandidate.flights;

                            // 加上回程價格
                            totalPrice += (decimal)returnCandidate.price;

                            var retSeg = returnSegmentsList.First();
                            if (!string.IsNullOrEmpty(retSeg.flight_number) && retSeg.flight_number.Length >= 2)
                            {
                                foundAirlines.Add(retSeg.flight_number.Substring(0, 2));
                            }
                        }
                    }
                    catch (Exception revEx)
                    {
                        Console.WriteLine($"[Reverse Search Failed] {revEx.Message}");
                    }
                }

                string retInfo = "";
                if (returnSegmentsList != null && returnSegmentsList.Any())
                {
                    retInfo = ExtractFlightInfo(returnSegmentsList);
                }
                else
                {
                    retInfo = allowTransfer ? "N/A (無航班資料)" : "無直飛回程 (請嘗試接受轉機)";
                }

                return (depInfo, retInfo, totalPrice, deepLink, foundAirlines.ToList());
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Flight Error] {ex.Message}");
                return ($"API Error: {ex.Message}", "查詢失敗", 0, "", new List<string>());
            }
        }

        private string ExtractFlightInfo(List<FlightSegment> segments)
        {
            if (segments == null || !segments.Any()) return "N/A";

            var firstSeg = segments.First();
            string airline = firstSeg.airline ?? "未知航空";
            string flightNo = firstSeg.flight_number ?? "";
            string time = firstSeg.departure_airport?.time ?? "";

            if (!string.IsNullOrEmpty(time) && time.Contains(" "))
            {
                time = time.Split(' ')[1];
            }

            string transferInfo = "";
            if (segments.Count > 1)
            {
                string layover = firstSeg.arrival_airport?.id ?? "轉機";
                transferInfo = $" <span class='badge bg-secondary' style='font-size:0.8em; margin-left:5px;'> {segments.Count - 1}轉 ({layover})</span>";
            }

            return $"{airline} {flightNo} ({time}){transferInfo}";
        }

        // --- 連結產生器 (保持不變) ---
        private string GenerateGoogleFlightsLink(string destinationCode, DateOnly start, DateOnly end, int adults, bool allowTransfer, List<string> airlineCodes)
        {
            string baseUrl = "https://www.google.com/travel/flights";
            string dateOut = start.ToString("yyyy-MM-dd");
            string dateRet = end.ToString("yyyy-MM-dd");

            string query = $"TPE to {destinationCode} on {dateOut} returning {dateRet}";
            if (airlineCodes != null && airlineCodes.Any())
            {
                string codes = string.Join(", ", airlineCodes.Distinct());
                query += $" airline {codes}";
            }

            string qPart = $"q={Uri.EscapeDataString(query)}";
            string fltFragment = $"flt=TPE.{destinationCode}.{dateOut}*{destinationCode}.TPE.{dateRet};c:TWD;px:{adults}";
            if (!allowTransfer)
            {
                fltFragment += ";s:0";
            }

            string finalUrl = $"{baseUrl}?{qPart}&hl=zh-TW&gl=TW#{fltFragment}";
            return finalUrl;
        }

        private async Task<(string Name, decimal TotalPrice, string? Url)?> FetchHotelPricesAsync(string cityName, DateOnly checkIn, DateOnly checkOut, int? rating, decimal? maxPrice)
        {
            string apiKey = _configuration["SerpApi:Key"] ?? string.Empty;
            string query = rating.HasValue ? $"{cityName} {rating} star hotel" : $"{cityName} hotel";

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
                var data = JsonSerializer.Deserialize<SerpApiHotelResponse>(responseString, options);
                string? directLink = data?.search_metadata?.google_hotels_url;

                if (data?.properties != null && data.properties.Any())
                {
                    var bestHotel = data.properties.FirstOrDefault(p => p.total_rate?.extracted_lowest != null || p.rate_per_night?.extracted_lowest != null);

                    if (bestHotel != null)
                    {
                        string displayName = bestHotel.name;
                        if (bestHotel.overall_rating > 0) displayName += $" ({bestHotel.overall_rating}★)";

                        decimal price = (decimal)(bestHotel.total_rate?.extracted_lowest ?? 0);

                        if (price == 0 && bestHotel.rate_per_night?.extracted_lowest != null)
                        {
                            int nights = checkOut.DayNumber - checkIn.DayNumber;
                            if (nights < 1) nights = 1;
                            price = (decimal)(bestHotel.rate_per_night.extracted_lowest * nights);
                        }

                        if (string.IsNullOrEmpty(directLink))
                            directLink = GenerateGoogleHotelsLink(cityName, checkIn, checkOut, rating, maxPrice);

                        return (displayName, price, directLink);
                    }
                }
                else
                {
                    return ($"無搜尋結果 (Query: {query})", 0, null);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[Hotel Error] {ex.Message}");
                return ($"API Error: {ex.Message}", 0, null);
            }
            return null;
        }

        private string GenerateGoogleHotelsLink(string cityName, DateOnly start, DateOnly end, int? rating, decimal? maxPrice)
        {
            string baseQuery = rating.HasValue ? $"{cityName} {rating} star hotel" : $"{cityName} hotel";
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
        public string DepartFlight { get; set; } = string.Empty;
        public string ReturnFlight { get; set; } = string.Empty;
        public decimal FlightPrice { get; set; }
        public decimal TotalPrice { get; set; }
        public string HotelName { get; set; } = string.Empty;
        public string FlightLink { get; set; } = string.Empty;
        public string HotelLink { get; set; } = string.Empty;
    }
}