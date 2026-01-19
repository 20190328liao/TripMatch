using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Extensions.Configuration;

namespace TripMatch.Services.ExternalClients
{
    public class AirLabsClient
    {
        private readonly HttpClient _httpClient;
        private readonly string? _apiKey;

        public AirLabsClient(HttpClient httpClient, IConfiguration config)
        {
            _httpClient = httpClient ?? new HttpClient();

            // 讀取設定檔中的 Key (假設您放在 "AirLabs:ApiKey")
            // 如果還沒設定，建議加到 appsettings.json
            _apiKey = config["AirLabs:ApiKey"];

            if (string.IsNullOrEmpty(_apiKey))
            {
                // 為了防呆，這裡可以給一個預設值，或者直接拋出錯誤
                // 這裡暫時使用我們之前用的那個 Key 當作 fallback，但建議正式環境一定要用設定檔
                _apiKey = "34aaa904-fced-4a04-9f6c-2501c6e0ded0";
            }
        }

        // 1. 搜尋航線 (Routes)
        // 回傳 string (原始 JSON)，讓 Controller 直接轉發給前端
        public async Task<string> GetRoutesAsync(string depIata, string arrIata)
        {
            var url = $"https://airlabs.co/api/v9/routes?dep_iata={depIata}&arr_iata={arrIata}&api_key={_apiKey}";
            return await SendRequestAsync(url);
        }

        // 2. 搜尋航班詳細 (Flight)
        public async Task<string> GetFlightDetailAsync(string flightIata)
        {
            var url = $"https://airlabs.co/api/v9/flight?flight_iata={flightIata}&api_key={_apiKey}";
            return await SendRequestAsync(url);
        }

        // 共用的請求發送邏輯
        private async Task<string> SendRequestAsync(string url)
        {
            var response = await _httpClient.GetAsync(url);

            // 如果失敗，這裡可以選擇拋出錯誤，讓 Controller 的 try-catch 捕捉
            // 或者讀取錯誤訊息並回傳
            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                throw new HttpRequestException($"AirLabs API Error: {response.StatusCode}, Details: {errorContent}");
            }

            return await response.Content.ReadAsStringAsync();
        }
    }
}