using System;

namespace TripMatch.Models.DTOs.TimeWindow
{
    public class AvailableSlotInput
    {
        public DateTime StartAt { get; set; }
        public DateTime EndAt { get; set; }
    }
}