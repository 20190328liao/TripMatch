namespace TripMatch.Models.DTOs.TimeWindow
{
    public class CommonTimeRangeDto
    {
        public DateOnly StartDate { get; set; }
        public DateOnly EndDate { get; set; }
        public int Days { get; set; }
        public int AttendanceCount { get; set; }

        public CommonTimeRangeDto(DateOnly start, DateOnly end, int days, int attendance)
        {
            StartDate = start;
            EndDate = end;
            Days = days;
            AttendanceCount = attendance;
        }
    }
}