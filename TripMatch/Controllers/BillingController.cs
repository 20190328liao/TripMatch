using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models; // 記得引用 TripMatch 的 Models

namespace TripMatch.Controllers
{
    // 1. 類別名稱維持 BillingController
    public class BillingController : Controller
    {
        private readonly TravelDbContext _context;

        // 2. 建構子名稱一定要改成 BillingController，不能留著 AccountingController
        public BillingController(TravelDbContext context)
        {
            _context = context;
        }

        // --- 以下內容從原本的 AccountingController 複製過來 ---

        // 進入記帳主頁面
        public IActionResult Index()
        {
            // 撈取所有行程，並包含成員資料
            var trips = _context.Trips
                .OrderByDescending(t => t.StartDate)
                .ToList();

            return View(trips);
        }

        [HttpGet]
        public async Task<IActionResult> GetTripMembers(int tripId)
        {
            // 撈取該行程的成員
            var members = await _context.TripMembers
                .Where(m => m.TripId == tripId)
                .Select(m => new {
                    UserId = m.UserId,
                    // UserName = m.User.UserName, // 如果之後要解開註解，記得確認關聯
                    Budget = m.Budget
                })
                .ToListAsync();

            return Json(members);
        }
    }
}