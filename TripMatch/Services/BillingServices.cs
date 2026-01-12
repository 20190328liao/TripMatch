using TripMatch.Models;

namespace TripMatch.Services
{
    public class BillingServices
    {
        private readonly TravelDbContext _context;

        // 透過建構子注入資料庫上下文
        public BillingServices(TravelDbContext context)
        {
            _context = context;
        }

        // 在下面開始添加與記帳相關的服務方法
    }
}
