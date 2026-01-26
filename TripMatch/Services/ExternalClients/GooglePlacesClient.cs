using TripMatch.Models.DTOs;
using System.Text.Json;

namespace TripMatch.Services.ExternalClients
{
    public class GooglePlacesClient
    {
        private readonly HttpClient _httpClient;
        private readonly string? _apiKey;

        public GooglePlacesClient(HttpClient httpClient, IConfiguration config)
        {
            _httpClient =httpClient?? new HttpClient();

            // 使用冒號 (:) 來讀取 JSON 的階層：GoogleMaps -> ApiKey
            _apiKey = config["GoogleMaps:ApiKey"];

            // 為了教學方便，如果抓不到金鑰，我們可以拋出錯誤提醒自己
            if (string.IsNullOrEmpty(_apiKey))
            {
                throw new Exception("找不到 Google API Key，請檢查 appsettings.json 設定。");
            }
        }

        public async Task<GooglePlaceDetailDto?> GetPlaceDetailsAsync(string placeId, string lang = "zh-TW")
        {
            var fields = "name,formatted_address,rating,user_ratings_total,photos,geometry/location";

            var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={Uri.EscapeDataString(placeId)}" +
                      $"&fields={fields}&key={_apiKey}&language={lang}";


            var response = await _httpClient.GetAsync(url);
            response.EnsureSuccessStatusCode();

            return await response.Content.ReadFromJsonAsync<GooglePlaceDetailDto>();
        }

        // 新增：從文字查找 place_id（使用 findplacefromtext）
        public async Task<string?> FindPlaceIdByTextAsync(string input, string lang = "zh-TW")
        {
            if (string.IsNullOrWhiteSpace(input)) return null;
            var url = $"https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input={Uri.EscapeDataString(input)}&inputtype=textquery&fields=place_id&key={_apiKey}&language={lang}";
            var resp = await _httpClient.GetAsync(url);
            if (!resp.IsSuccessStatusCode) return null;
            using var stream = await resp.Content.ReadAsStreamAsync();
            using var doc = await JsonDocument.ParseAsync(stream);
            var root = doc.RootElement;
            if (root.TryGetProperty("candidates", out var cands) && cands.GetArrayLength() > 0)
            {
                var first = cands[0];
                if (first.TryGetProperty("place_id", out var pid) && pid.ValueKind == JsonValueKind.String)
                    return pid.GetString();
            }
            return null;
        }
        public async Task<List<string>> GetNearbyAttractionsAsync(double? lat, double? lng, int radius = 10000)
        {
            var allCandidateIds = new List<string>();
            string? nextPageToken = null;
            int pageCount = 0;
            const int MaxPages = 2;
                      
            const int MinReviewCount = 100;

            // 【設定門檻】最低評分要求 (可選)
            const double MinRating = 4.0;

            do
            {
                var url = $"https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
                          $"location={lat},{lng}" +
                          $"&radius={radius}" +
                          $"&type=tourist_attraction" +
                          $"&rankby=prominence" +
                          $"&key={_apiKey}" +
                          $"&language=zh-TW";

                if (!string.IsNullOrEmpty(nextPageToken))
                {
                    url += $"&pagetoken={nextPageToken}";
                    await Task.Delay(2000);
                }

                try
                {
                    var response = await _httpClient.GetAsync(url);
                    if (!response.IsSuccessStatusCode) break;

                    using var stream = await response.Content.ReadAsStreamAsync();
                    using var doc = await JsonDocument.ParseAsync(stream);
                    var root = doc.RootElement;

                    if (root.TryGetProperty("status", out var status) &&
                       (status.GetString() == "OK" || status.GetString() == "ZERO_RESULTS"))
                    {
                        if (root.TryGetProperty("results", out var results))
                        {
                            foreach (var item in results.EnumerateArray())
                            {
                                // 1. 先取得評論數與評分
                                int userRatingsTotal = 0;
                                double rating = 0;

                                if (item.TryGetProperty("user_ratings_total", out var ratingCountProp))
                                {
                                    userRatingsTotal = ratingCountProp.GetInt32();
                                }

                                if (item.TryGetProperty("rating", out var ratingProp))
                                {
                                    // TryGetDouble 可能會失敗如果它是整數，用 GetDouble 比較保險但要小心 Json 格式
                                    // 這裡簡單轉型
                                    if (ratingProp.ValueKind == JsonValueKind.Number)
                                        rating = ratingProp.GetDouble();
                                }

                                // 2. 【核心過濾邏輯】
                                // 必須同時滿足：評論數 > 30 且 評分 > 3.5
                                if (userRatingsTotal >= MinReviewCount && rating >= MinRating)
                                {
                                    if (item.TryGetProperty("place_id", out var pid))
                                    {
                                        var id = pid.GetString();
                                        if (!string.IsNullOrEmpty(id))
                                        {
                                            allCandidateIds.Add(id);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    else
                    {
                        break;
                    }

                    if (root.TryGetProperty("next_page_token", out var tokenProp))
                    {
                        nextPageToken = tokenProp.GetString();
                        pageCount++;
                    }
                    else
                    {
                        nextPageToken = null;
                    }
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"Nearby Search 發生錯誤: {ex.Message}");
                    break;
                }

            } while (!string.IsNullOrEmpty(nextPageToken) && pageCount < MaxPages);


            // 3. 隨機洗牌並取前 10
            var randomPlaceIds = allCandidateIds
                .OrderBy(x => Guid.NewGuid())
                .Distinct()
                .Take(10)
                .ToList();

            return randomPlaceIds;
        }

        public string GetPhotoUrl(string photoReference, int maxWidth = 400)
        {
            if (string.IsNullOrEmpty(photoReference)) return string.Empty;

            // 這是 Place Photo API 的標準格式
            return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth={maxWidth}&photo_reference={photoReference}&key={_apiKey}";
        }

        public async Task<string> GetPlaceCoverImageUrlAsync(string placeId, string language = "zh-TW")
        {
            if (string.IsNullOrWhiteSpace(placeId)) return string.Empty;

            try
            {
                // 1. 呼叫現有的非同步詳細資料方法
                var dto = await this.GetPlaceDetailsAsync(placeId, language);

                // 2. 安全檢查：確保有資料且有照片
                var firstPhotoReference = dto?.Result?.Photos?.FirstOrDefault()?.PhotoReference;

                if (string.IsNullOrEmpty(firstPhotoReference))
                {
                    return string.Empty; // 無照片時回傳空字串
                }

                // 3. 調用現有方法轉換成最終 URL
                return this.GetPhotoUrl(firstPhotoReference);
            }
            catch (Exception)
            {
                // 避免 API 異常導致程式崩潰，回傳空字串
                return string.Empty;
            }
        }

    }


}
