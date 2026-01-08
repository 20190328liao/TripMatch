namespace TripMatch.Models.DTOs
{
    public class TripCreateDto
    {
        public string Title { get; set; } = string.Empty;

        public string[] PlaceIds  { get; set; }  = [];
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
    }
}