namespace TripMatch.Models.DTOs.TimeWindow
{
    public class UpsertPreferenceRequest
    {
        public int? HotelBudget { get; set; }
        public int? HotelRating { get; set; }
        public bool Transfer { get; set; }
        public string? PlacesToGo { get; set; }
        public int? TotalBudget { get; set; }
    }
}
