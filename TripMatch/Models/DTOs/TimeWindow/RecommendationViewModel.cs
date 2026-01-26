using System.Collections.Generic;

namespace TripMatch.Models.DTOs.TimeWindow
{
    // 這是給 View 用的主模型
    public class RecommendationViewModel
    {
        public int GroupId { get; set; }
        public int TotalOptionsCount { get; set; }
        public bool IsVoteCompleted { get; set; }
        public RecommendationCard? WinningCard { get; set; }
        public List<TimeSlotFilter> TimeSlots { get; set; } = new List<TimeSlotFilter>();
        public List<RecommendationCard> OptionCards { get; set; } = new List<RecommendationCard>();
        public GroupPreferenceSummary Summary { get; set; }
    }

    // ★★★ 這是您一直找不到的卡片類別 ★★★
    public class RecommendationCard
    {
        public int RecommendationId { get; set; }
        public string PlaceName { get; set; } // 顯示用地名 (從 Location 解析)
        public string DateRange { get; set; }
        public string TimeSlotId { get; set; } // 用來篩選的 ID

        public decimal Price { get; set; }
        public string DepartFlight { get; set; }
        public string ReturnFlight { get; set; }

        public int CurrentVotes { get; set; }
        public bool IsVotedByCurrentUser { get; set; }

        public int AvailableMembersCount { get; set; } // 該時段有空的人數
    }

    // ★★★ 這是您一直找不到的篩選器類別 ★★★
    public class TimeSlotFilter
    {
        public string Id { get; set; }
        public string Label { get; set; }
        public string DateRange { get; set; }
        public int Duration { get; set; }
        public int AvailableCount { get; set; }
    }
    
    public class GroupPreferenceSummary
    {
    public int MemberCount { get; set; }          // 統計人數
    public int MedianHotelBudget { get; set; }    // 飯店預算 (中位數)
    public double AvgHotelRating { get; set; }    // 星級 (平均或中位數)
    public int TransferAcceptCount { get; set; }  // 接受轉機人數
    public int TransferRejectCount { get; set; }  // 不接受轉機人數
    }
}