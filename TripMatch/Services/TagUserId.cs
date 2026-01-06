namespace TripMatch.Services
{
    //做成介面方便DI注入
    public interface TagUserId
    {
        int? UserId { get; set; }
        void Set(int userId);
    }

    //訪問器
    public class TagUserIdAccessor : TagUserId
    {
        public int? UserId { get; set; }
        public void Set(int userId)
        {
            UserId = userId;
        }
    }
}