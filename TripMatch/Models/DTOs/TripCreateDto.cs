namespace TripMatch.Models.DTOs
{
    public class TripCreateDto
    {
        public string Title { get; set; } = string.Empty;

        public List<int> Regions = [];
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
    }
}