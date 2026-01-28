namespace TripMatch.Models.DTOs.TimeWindow
{
    public static class GroupStatus
    {
        public const string PREF = "PREF"; // 偏好填寫中
        public const string DATE = "DATE"; // 選日期中
        public const string VOTING = "VOTING"; // 投票中
        public const string RESULT = "RESULT"; // 結果頁
        public const string JOINING = "JOINING"; // 開團成功，進Trip
        public const string CANCELLED = "CANCELLED";
    }
}
