namespace TripMatch.Models.DTOs.TimeWindow
{
    public class UpsertPreferenceRequest
    {
        public int? BudgetMin { get; set; }
        public int? BudgetMax { get; set; }
        public int? HotelRating { get; set; }
        public bool Transfer { get; set; }
        public string? PlacesToGo { get; set; }
    }
}
