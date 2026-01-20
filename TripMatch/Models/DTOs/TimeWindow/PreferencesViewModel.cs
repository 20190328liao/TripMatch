using System.Collections.Generic;

namespace TripMatch.Models.DTOs.TimeWindow
{
    public class PreferencesViewModel
    {
        public int GroupId { get; set; }
        public string InviteCode { get; set; }
        public int TargetNumber { get; set; } 
        public int JoinedCount { get; set; }
        public int SubmittedCount { get; set; }

        public List<string> MySelectedLocations { get; set; } = new List<string>();
        public List<LocationItem> HotLocations { get; set; } = new List<LocationItem>();
    }

    public class LocationItem
    {
        public int Id { get; set; }
        public string City { get; set; }
        public string Country { get; set; }
    }
}