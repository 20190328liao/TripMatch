namespace TripMatch.Models.DTOs
{
    public class TripCreateDto
    {
        public string TripName { get; set; } = string.Empty;
        public List<string> LocationName { get; set; } = [];
        public DateTime StartDate { get; set; }
        public DateTime EndDate { get; set; }
    }
}