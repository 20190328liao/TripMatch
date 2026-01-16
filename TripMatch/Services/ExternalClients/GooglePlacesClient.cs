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
            // 修改處：在 fields 中增加 geometry/location
            var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={Uri.EscapeDataString(placeId)}" +
                      $"&fields=name,address_components,types,photos,geometry/location&key={_apiKey}&language={lang}";

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
    }


}
