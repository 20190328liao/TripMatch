using TripMatch.Models;

namespace TripMatch.Services
{
    public class MatchServices
    {
        private readonly TravelDbContext _context;

        // 透過建構子注入資料庫上下文
        public MatchServices(TravelDbContext context)
        {
            _context = context;
        }

        // 在下面開始添加與媒合相關的服務方法
    }
}
