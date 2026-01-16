namespace TripMatch.Models.Settings
{
    public class VerificationEmailLog
    {
        public int Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public DateTime SentAt { get; set; } = DateTime.UtcNow;
        public bool IsReminded { get; set; }
        public string? Note { get; set; }
    }
}
