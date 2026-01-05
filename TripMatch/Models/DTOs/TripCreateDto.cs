namespace TripMatch.Models.DTOs
{
    public class TripCreateDto
    {
        public string Title { get; set; } = string.Empty;

        public List<int> Regions = [];
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }
}