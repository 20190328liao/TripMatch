namespace TripMatch.Models.DTOs
{
    public class TripDto
    {
        public int TripId { get; set; }
        public string TripName { get; set; } = string.Empty;  
        public string LocationName { get; set; } = string.Empty;
    }
}
