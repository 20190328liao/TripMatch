namespace TripMatch.Services.Common
{
    public class SharedService
    {

        public int GetLocationCategoryId(string googleType)
        {
            if (string.IsNullOrEmpty(googleType)) return 2; // 若無分類，預設歸類為「景點」或你可以自訂一個 ID

            // 根據你最新的資料庫 ID:
            // 1:美食, 2:景點, 3:購物, 4:住宿, 5:交通, 6:自然

            return googleType.ToLower() switch
            {
                // 1: 美食
                "restaurant" or "food" or "cafe" or "bakery" or "bar" or "meal_takeaway" or "night_club" => 1,

                // 3: 購物
                "shopping_mall" or "department_store" or "clothing_store" or "electronics_store" or "store" => 3,

                // 4: 住宿
                "lodging" or "hotel" or "campground" or "bed_and_breakfast" => 4,

                // 5: 交通
                "transit_station" or "train_station" or "bus_station" or "airport" or "subway_station" => 5,

                // 6: 自然
                "park" or "zoo" or "aquarium" or "natural_feature" => 6,

                // 2: 景點 (作為大多數旅遊地點的預設分類)
                "tourist_attraction" or "museum" or "amusement_park" or "art_gallery"
                or "shrine" or "church" or "hindu_temple" or "mosque" => 2,

                // 預設分類：若都不符合，統一歸類為 2:景點
                _ => 2
            };
        }
    }
}
