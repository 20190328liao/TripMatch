namespace TripMatch.Services
{
    //做成介面方便DI注入
    public interface ITagUserId
    {
        int? UserId { get; set; }
        void Set(int userId);
    }

    //訪問器
    public class TagUserIdAccessor : ITagUserId
    {
        public int? UserId { get; set; }
        public void Set(int userId)
        {
            UserId = userId;
        }
    }
}