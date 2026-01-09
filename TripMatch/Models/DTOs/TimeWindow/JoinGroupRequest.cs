namespace TripMatch.Models.DTOs.TimeWindow
{
    public class JoinGroupRequest
    {
        public string InviteCode { get; set; } = string.Empty;
        public string? DisplayName { get; set; } // 選擇性保留，視情況使用
    }
}