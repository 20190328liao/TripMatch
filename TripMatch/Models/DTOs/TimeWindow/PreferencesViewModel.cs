using System.Collections.Generic;

namespace TripMatch.Models.DTOs.TimeWindow
{
    public class PreferencesViewModel
    {
        public int GroupId { get; set; }
        public string InviteCode { get; set; } // 預設或從 DB 撈

        public List<LocationItem> HotLocations { get; set; } = new List<LocationItem>();
    }

    public class LocationItem
    {
        public int Id { get; set; }
        public string City { get; set; }
        public string Country { get; set; }
    }
}