using TripMatch.Models.DTOs;

namespace TripMatch.Services.ExternalClients
{
    public class GooglePlacesClient
    {
        private readonly HttpClient _httpClient;
        private readonly string? _apiKey;

        public GooglePlacesClient(HttpClient httpClient, IConfiguration config)
        {
            _httpClient = new HttpClient();

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
            var url = $"https://maps.googleapis.com/maps/api/place/details/json?place_id={placeId}" +
                $"&fields=name,address_components,types&key={_apiKey}&language={lang}";
            var response = await _httpClient.GetAsync(url);
            return await response.Content.ReadFromJsonAsync<GooglePlaceDetailDto>(); // 建議建立專用 DTO 解析 JSON
        }
    }


}
