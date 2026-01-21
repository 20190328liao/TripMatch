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
        
        public async Task<List<string>> GetNearbyAttractionsAsync(double? lat, double? lng, int radius = 5000)
        {
            var placeIds = new List<string>();

            // 定義 Nearby Search URL
            // type=tourist_attraction: 鎖定景點類型
            // rankby=prominence: 按熱門度/知名度排序（此模式下必須指定 radius）
            var url = $"https://maps.googleapis.com/maps/api/place/nearbysearch/json?" +
                      $"location={lat},{lng}" +
                      $"&radius={radius}" +
                      $"&type=tourist_attraction" +
                      $"&rankby=prominence" +
                      $"&key={_apiKey}" +
                      $"&language=zh-TW";

            try
            {
                var response = await _httpClient.GetAsync(url);
                if (!response.IsSuccessStatusCode) return placeIds;

                using var stream = await response.Content.ReadAsStreamAsync();
                using var doc = await JsonDocument.ParseAsync(stream);
                var root = doc.RootElement;

                // 檢查 API 回傳狀態是否為 OK
                if (root.TryGetProperty("status", out var status) && status.GetString() == "OK")
                {
                    if (root.TryGetProperty("results", out var results))
                    {
                        foreach (var item in results.EnumerateArray())
                        {
                            if (item.TryGetProperty("place_id", out var pid))
                            {
                                var id = pid.GetString();
                                if (!string.IsNullOrEmpty(id))
                                {
                                    placeIds.Add(id);
                                }
                            }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                // 實際開發建議記錄 log
                Console.WriteLine($"Nearby Search 發生錯誤: {ex.Message}");
            }

            return placeIds;
        }

        public string GetPhotoUrl(string photoReference, int maxWidth = 400)
        {
            if (string.IsNullOrEmpty(photoReference)) return string.Empty;

            // 這是 Place Photo API 的標準格式
            return $"https://maps.googleapis.com/maps/api/place/photo?maxwidth={maxWidth}&photo_reference={photoReference}&key={_apiKey}";
        }
    }


}
