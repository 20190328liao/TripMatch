using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Diagnostics;
using System.Security.Claims;
using System.Text.Json;
using TripMatch.Models; // 改成專案原本的 Models 命名空間

//using Microsoft.AspNetCore.Authorization;

namespace TripMatch.Controllers
{
    //[Authorize]
    public class BillingController : Controller
    {
        private readonly ILogger<BillingController> _logger;
        private readonly TravelDbContext _context; // 確保 Program.cs 有註冊 TravelDbContext

        // 建構子注入
        public BillingController(ILogger<BillingController> logger, TravelDbContext context)
        {
            _logger = logger;
            _context = context;
        }

        // 1. Billing 首頁
        // 這頁會顯示旅程列表，讓使用者選擇要看哪一個旅程的帳務
        public async Task<IActionResult> Index()
        {
            // 撈出所有旅程，並包含 TripMembers (為了計算人數)
            var trips = await _context.Trips
                                      .Include(t => t.TripMembers)
                                      .ToListAsync();

            return View(trips);
        }

        public async Task<IActionResult> Detail(int? id)
        {
            if (id == null) return NotFound();

            var trip = await _context.Trips
                .Include(t => t.TripMembers).ThenInclude(tm => tm.User)  // 撈出成員對應的使用者資料 (AspNetUsers)
                    .Include(t => t.Expenses).ThenInclude(e => e.Category)
                    //撈出付款人資訊
                    .Include(t => t.Expenses)
                        .ThenInclude(e => e.ExpensePayers)
                        .ThenInclude(ep => ep.Member)
                        .ThenInclude(m => m.User)

                    //撈出分攤人資訊 (為了算個人花費)
                    .Include(t => t.Expenses)
                        .ThenInclude(e => e.ExpenseParticipants)
                        .ThenInclude(ep => ep.User) // 注意：您的 Model 裡屬性叫 User，但型別是 TripMember
                        .ThenInclude(tm => tm.User) // 再連一層到 AspNetUser

                    // 撈取結清紀錄 (Settlements) 
                    .Include(t => t.Settlements)
                        .ThenInclude(s => s.FromUser)
                        .ThenInclude(m => m.User) // 1. 載入「付款人 (FromUser)」的名字

                    .Include(t => t.Settlements)
                        .ThenInclude(s => s.ToUser)
                        .ThenInclude(m => m.User)// 2. 載入「收款人 (ToUser)」的名字
                .FirstOrDefaultAsync(m => m.Id == id);

            if (trip == null) return NotFound();

            // 撈取所有類別傳給 View (用於下拉選單)
            ViewBag.Categories = await _context.Categories.ToListAsync();

            //// 動態抓取目前登入者的資料 
            //int currentAspNetUserId = 0;

            //// 從 Cookie 中讀取登入者的 UserId (字串轉整數)
            //var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            //if (!string.IsNullOrEmpty(userIdClaim) && int.TryParse(userIdClaim, out int parsedId))
            //{
            //    currentAspNetUserId = parsedId;
            //}

            // ★★★ 測試用：暫時寫死成 2 (假設我是王小明) ★★★
            int currentAspNetUserId = 2;

            // 在這趟旅程的成員名單中，尋找對應這個 UserId 的成員
            // 這樣我們才能知道他的 MemberId (記帳是用這個 ID) 和 Budget
            var myMemberInfo = trip.TripMembers.FirstOrDefault(m => m.UserId == currentAspNetUserId);

            // ★★★ 4. 將抓到的資料存入 ViewBag 傳給前端 ★★★
            // 如果找不到 (myMemberInfo是null)，代表他是訪客或沒登入，ID 設為 0
            ViewBag.CurrentMemberId = myMemberInfo?.Id ?? 0;
            ViewBag.CurrentMemberName = myMemberInfo?.User?.FullName ?? "訪客";
            ViewBag.CurrentBudget = myMemberInfo?.Budget ?? 0;
            return View(trip);
        }

        // ----------------- 處理預算 -----------------
        [HttpPost]
        public async Task<IActionResult> UpdateBudget(int tripId, decimal newBudget)
        {
            // 1. 抓取目前登入者 (測試期間寫死 ID=2，之後記得改回 User.FindFirstValue)
            int currentAspNetUserId = 2;

            // 2. 找出對應的成員
            var member = await _context.TripMembers
                .FirstOrDefaultAsync(m => m.TripId == tripId && m.UserId == currentAspNetUserId);

            if (member == null) return Json(new { success = false, message = "找不到成員資料" });

            // 3. 更新預算
            member.Budget = newBudget;
            await _context.SaveChangesAsync();

            return Json(new { success = true });
        }

        // ----------------- 處理刪除支出 -----------------
        [HttpPost]
        public async Task<IActionResult> DeleteExpense(int id)
        {
            // 1. 改用 Include 撈出這筆支出，順便把關聯的付款人、分攤人都抓出來
            var expense = await _context.Expenses
                .Include(e => e.ExpensePayers)
                .Include(e => e.ExpenseParticipants)
                .FirstOrDefaultAsync(e => e.ExpenseId == id);

            if (expense != null)
            {
                // 2. 先刪除子資料 (付款人 & 分攤人)，這樣才不會因為外鍵約束而報錯
                if (expense.ExpensePayers.Any())
                {
                    _context.ExpensePayers.RemoveRange(expense.ExpensePayers);
                }

                if (expense.ExpenseParticipants.Any())
                {
                    _context.ExpenseParticipants.RemoveRange(expense.ExpenseParticipants);
                }

                // 3. 子資料都清空後，可以刪除主資料
                _context.Expenses.Remove(expense);

                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            return Json(new { success = false, message = "找無此資料" });
        }

        // ----------------- 處理 建立 或 編輯 支出 -----------------
        [HttpPost]
        public async Task<IActionResult> SaveExpense(int? id, int tripId, string title, decimal amount, DateTime date, int? categoryId, string payersJson, string partsJson)
        {
            // 改為 int? categoryId，允許類別為空

            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // 1. 基本檢查
                if (string.IsNullOrEmpty(payersJson) || string.IsNullOrEmpty(partsJson))
                    return Json(new { success = false, message = "付款人或分攤人資料遺失" });

                var trip = await _context.Trips.FindAsync(tripId);
                if (trip == null) return Json(new { success = false, message = "旅程不存在" });

                // 2. 計算天數
                int dayNumber = (date.Date - trip.StartDate.ToDateTime(TimeOnly.MinValue)).Days + 1;
                if (dayNumber < 1) dayNumber = 1;

                Expense? expense;

                // 3. 處理 Expense 主表
                if (id.HasValue && id.Value > 0)
                {
                    expense = await _context.Expenses
                        .Include(e => e.ExpensePayers)
                        .Include(e => e.ExpenseParticipants)
                        .FirstOrDefaultAsync(e => e.ExpenseId == id.Value);

                    if (expense == null) return Json(new { success = false, message = "找無此支出" });

                    _context.ExpensePayers.RemoveRange(expense.ExpensePayers);
                    _context.ExpenseParticipants.RemoveRange(expense.ExpenseParticipants);
                }
                else
                {
                    expense = new Expense();
                    expense.TripId = tripId;
                    _context.Expenses.Add(expense);
                }

                expense.Title = title;
                expense.Amount = amount;
                expense.Day = dayNumber;

                // ★★★ 安全修正：檢查類別是否存在，不存在就存 null ★★★
                if (categoryId.HasValue && await _context.Categories.AnyAsync(c => c.CategoryId == categoryId.Value))
                {
                    expense.CategoryId = categoryId.Value;
                }
                else
                {
                    expense.CategoryId = null; // 避免 FK 錯誤
                }

                await _context.SaveChangesAsync();

                // 4. 處理付款人
                var payersDict = JsonSerializer.Deserialize<Dictionary<string, decimal>>(payersJson);
                if (payersDict != null)
                {
                    foreach (var kvp in payersDict)
                    {
                        if (kvp.Value > 0 && int.TryParse(kvp.Key, out int memberId))
                        {
                            _context.ExpensePayers.Add(new ExpensePayer
                            {
                                ExpenseId = expense.ExpenseId,
                                MemberId = memberId,
                                Amount = kvp.Value
                            });
                        }
                    }
                }

                // 5. 處理分攤人
                var partsDict = JsonSerializer.Deserialize<Dictionary<string, decimal>>(partsJson);
                if (partsDict != null)
                {
                    foreach (var kvp in partsDict)
                    {
                        if (kvp.Value > 0 && int.TryParse(kvp.Key, out int memberId))
                        {
                            _context.ExpenseParticipants.Add(new ExpenseParticipant
                            {
                                ExpenseId = expense.ExpenseId,
                                TripId = tripId,
                                UserId = memberId, // 對應 TripMember FK
                                ShareAmount = kvp.Value
                            });
                        }
                    }
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();

                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                // ★★★ 把真實錯誤訊息傳回前端，方便除錯 ★★★
                return Json(new { success = false, message = "存檔失敗：" + ex.Message + (ex.InnerException != null ? " | " + ex.InnerException.Message : "") });
            }
        }

        // ----------------- 新增結清紀錄 -----------------
        [HttpPost]
        public async Task<IActionResult> CreateSettlement(int tripId, int payerId, int payeeId, decimal amount)
        {
            try
            {
                var settlement = new Settlement
                {
                    TripId = tripId,
                    // 對應前端傳來的 payerId (還錢的人) -> 存入 FromUserId (債務人)
                    FromUserId = payerId,
                    // 對應前端傳來的 payeeId (收錢的人) -> 存入 ToUserId (債權人)
                    ToUserId = payeeId,
                    Amount = amount,
                    IsPaid = true,        // 標記為已支付
                    UpdatedAt = DateTimeOffset.Now
                };

                _context.Settlements.Add(settlement);
                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            catch (Exception ex)
            {
                return Json(new { success = false, message = ex.Message });
            }
        }

        // ----------------- 刪除結清紀錄 -----------------
        [HttpPost]
        public async Task<IActionResult> DeleteSettlement(int id)
        {
            var settlement = await _context.Settlements.FirstOrDefaultAsync(s => s.SettlementId == id);

            if (settlement != null)
            {
                _context.Settlements.Remove(settlement);
                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            return Json(new { success = false, message = "找不到此紀錄" });
        }

    }
}