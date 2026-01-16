namespace TripMatch.Models.DTOs.TimeWindow
{
    public class CreateGroupRequest
    {
        public int TargetNumber { get; set; }
        public string Title { get; set; }
        public string DepartFrom { get; set; }
        public int TravelDays { get; set; }
        public DateOnly? DateStart { get; set; }
        public DateOnly? DateEnd { get; set; }
    }
}