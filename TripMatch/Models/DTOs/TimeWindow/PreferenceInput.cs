using System.Collections.Generic;

namespace TripMatch.Models.DTOs.TimeWindow
{
    public class PreferenceInput
    {
        public int GroupId { get; set; }
        public string HotelBudget { get; set; }
        public string Transfer { get; set; }
        public string HotelRating { get; set; }

        public List<int> SelectedLocations { get; set; } = new List<int>();
    }
}
