namespace TripMatch.Services
{
    //做成介面方便DI注入
    public interface TagUserId
    {
        string? UserId { get; set; }
        void Set(string userId);
    }

    //訪問器
    public class TagUserIdAccessor : TagUserId
    {
        public string? UserId { get; set; }
        public void Set(string userId)
        {
            UserId = userId;
        }
    }
}
