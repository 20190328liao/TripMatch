using System.Collections.Generic;

namespace TripMatch.Models.DTOs.TimeWindow
{
    // [正確拼字] 用於前端顯示的 ViewModel
    public class RecommendationViewModel
    {
        public int TripId { get; set; }
        public int TargetCount { get; set; }
        public string CurrentUserId { get; set; }

        // 顯示總方案數
        public int TotalOptionsCount => OptionCards?.Count ?? 0;

        // B: 時間段篩選器 (Filter Bar)
        public List<TimeSlotFilterDto> TimeSlots { get; set; } = new List<TimeSlotFilterDto>();

        // C: 方案卡片列表
        public List<OptionCardViewModel> OptionCards { get; set; } = new List<OptionCardViewModel>();
    }

    public class TimeSlotFilterDto
    {
        public string Id { get; set; }        // 前端篩選用 ID (e.g. "20250315-20250320")
        public string Label { get; set; }     // e.g. "時段 1"
        public string DateRange { get; set; } // e.g. "03/15 - 03/20"
        public int AvailableCount { get; set; } // 多少人有空
        public int Duration { get; set; }     // 天數
    }

    // [正確拼字] 方案卡 ViewModel
    public class OptionCardViewModel
    {
        public int RecommendationId { get; set; } // 對應 DB 的 Index
        public string PlaceName { get; set; }
        public string TimeSlotId { get; set; }    // 對應 TimeSlotFilterDto.Id

        public string DateRange { get; set; }
        public int AvailableMembersCount { get; set; }

        public decimal Price { get; set; }
        public int CurrentVotes { get; set; }
        public bool IsVotedByCurrentUser { get; set; }
    }
}