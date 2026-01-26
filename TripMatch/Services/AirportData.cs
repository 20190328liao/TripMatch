using System;
using System.Collections.Generic;

namespace TripMatch.Services
{
    public static class AirportData
    {
        // 這裡放您那 100+ 個城市代碼
        public static readonly Dictionary<string, string> CityCodes = new(StringComparer.OrdinalIgnoreCase)
        {
            // --- 台灣 ---
            { "Taipei", "TPE" }, { "Kaohsiung", "KHH" }, { "Taichung", "RMQ" },

            // --- 日本 (擴充) ---
            { "Tokyo", "TYO" }, { "Osaka", "OSA" }, { "Kyoto", "OSA" },
            { "Sapporo", "SPK" }, { "Fukuoka", "FUK" }, { "Okinawa", "OKA" },
            { "Nagoya", "NGO" }, { "Sendai", "SDJ" }, { "Hiroshima", "HIJ" },
            { "Kumamoto", "KMJ" }, { "Kagoshima", "KOJ" },

            // --- 韓國 ---
            { "Seoul", "SEL" }, { "Busan", "PUS" }, { "Jeju", "CJU" }, { "Daegu", "TAE" },

            // --- 中國/港澳 ---
            { "Hong Kong", "HKG" }, { "Macau", "MFM" }, { "Shanghai", "SHA" },
            { "Beijing", "BJS" }, { "Guangzhou", "CAN" }, { "Chengdu", "CTU" },

            // --- 東南亞 ---
            { "Bangkok", "BKK" }, { "Chiang Mai", "CNX" }, { "Phuket", "HKT" },
            { "Singapore", "SIN" }, { "Kuala Lumpur", "KUL" }, { "Penang", "PEN" },
            { "Ho Chi Minh City", "SGN" }, { "Hanoi", "HAN" }, { "Da Nang", "DAD" },
            { "Manila", "MNL" }, { "Cebu", "CEB" }, { "Boracay", "MPH" },
            { "Bali", "DPS" }, { "Jakarta", "JKT" },

            // --- 美國 (擴充) ---
            { "New York", "NYC" }, { "Los Angeles", "LAX" }, { "San Francisco", "SFO" },
            { "Las Vegas", "LAS" }, { "Seattle", "SEA" }, { "Chicago", "CHI" },
            { "Boston", "BOS" }, { "Miami", "MIA" }, { "Orlando", "MCO" },
            { "Honolulu", "HNL" }, { "Guam", "GUM" }, { "Washington", "WAS" },

            // --- 加拿大 ---
            { "Vancouver", "YVR" }, { "Toronto", "YTO" }, { "Montreal", "YMQ" },

            // --- 歐洲 (擴充) ---
            { "London", "LON" }, { "Paris", "PAR" }, { "Frankfurt", "FRA" },
            { "Munich", "MUC" }, { "Berlin", "BER" }, { "Amsterdam", "AMS" },
            { "Rome", "ROM" }, { "Milan", "MIL" }, { "Venice", "VCE" },
            { "Barcelona", "BCN" }, { "Madrid", "MAD" }, { "Vienna", "VIE" },
            { "Prague", "PRG" }, { "Budapest", "BUD" }, { "Zurich", "ZRH" },
            { "Geneva", "GVA" }, { "Athens", "ATH" }, { "Istanbul", "IST" },
            { "Copenhagen", "CPH" }, { "Stockholm", "STO" }, { "Oslo", "OSL" },
            { "Helsinki", "HEL" }, { "Reykjavik", "KEF" },

            // --- 澳洲/紐西蘭 ---
            { "Sydney", "SYD" }, { "Melbourne", "MEL" }, { "Brisbane", "BNE" },
            { "Perth", "PER" }, { "Gold Coast", "OOL" },
            { "Auckland", "AKL" }, { "Christchurch", "CHC" }, { "Queenstown", "ZQN" },

            // --- 其他熱門 ---
            { "Dubai", "DXB" }, { "Doha", "DOH" }, { "Maldives", "MLE" }
        };
    }
}