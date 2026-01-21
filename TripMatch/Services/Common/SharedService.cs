namespace TripMatch.Services.Common
{
    public class SharedService
    {

        public int GetLocationCategoryId(List<string> googleTypes)
        {
            if (googleTypes == null || !googleTypes.Any()) return 2;

            // 將清單轉為 HashSet 提高查詢效能
            var typeSet = new HashSet<string>(googleTypes.Select(t => t.ToLower()));

            // 1. 優先權最高：美食 (避免被 store 攔截)
            if (typeSet.Overlaps(new[] { "restaurant", "food", "cafe", "bakery", "bar", "meal_takeaway" }))
                return 1;

            // 2. 住宿
            if (typeSet.Overlaps(new[] { "lodging", "hotel", "campground" }))
                return 4;

            // 3. 交通
            if (typeSet.Overlaps(new[] { "transit_station", "train_station", "bus_station", "airport" }))
                return 5;

            // 4. 自然
            if (typeSet.Overlaps(new[] { "park", "zoo", "aquarium", "natural_feature" }))
                return 6;

            // 5. 購物 (放在美食之後，避免餐廳因為有 store 標籤而被歸類到購物)
            if (typeSet.Overlaps(new[] { "shopping_mall", "department_store", "clothing_store", "store" }))
                return 3;

            // 6. 預設：景點
            return 2;
        }
    }
}
