using System;
using System.Collections.Generic;

namespace TripMatch.Services
{
    public static class AirportData
    {
        public static readonly Dictionary<string, string> CodeToCity = new()
        {
            { "NRT", "東京" }, // 成田 -> 東京
            { "HND", "東京" }, // 羽田 -> 東京
            { "KIX", "大阪" }, // 關西 -> 大阪
            { "ITM", "大阪" }, // 伊丹 -> 大阪
            { "ICN", "首爾" },
            { "GMP", "首爾" },
            { "BKK", "曼谷" },
            { "DMK", "曼谷" },
            { "TPE", "台北" },
            { "TSA", "台北" },
            { "FUK", "福岡" },
            { "CTS", "札幌" },
            { "OKA", "沖繩" },
            { "SIN", "新加坡"},
            { "HKG", "香港" },
            { "LHR", "倫敦" },
            { "JFK", "紐約" },
            { "LAX", "洛杉磯" },
            { "SFO", "舊金山" },
            { "AMS", "阿姆斯特丹" },
            { "SYD", "雪梨" },
            { "DXB", "杜拜" },
            { "CDG", "巴黎" },
        };
        public static string GetCityName(string airportCode)
        {
            if (string.IsNullOrWhiteSpace(airportCode)) return "";

            // 轉大寫以防萬一
            var code = airportCode.ToUpper().Trim();

            if (CodeToCity.TryGetValue(code, out string cityName))
            {
                return cityName;
            }

            // 找不到時，回傳原代碼 (至少讓 Google Places 試著搜搜看)
            return airportCode;
        }
    }
}