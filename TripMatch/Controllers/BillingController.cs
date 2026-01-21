using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models; // 改成專案原本的 Models 命名空間
using System.Text.Json;
using System.Security.Claims;
// 確保這裡引用了正確的 DbContext 命名空間，如果 TravelDbContext 在 Data 資料夾下，請加上 using TripMatch.Data;

namespace TripMatch.Controllers
{
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

        // 1. Billing 首頁 (原本的 Index)
        // 這頁會顯示旅程列表，讓使用者選擇要看哪一個旅程的帳務
        public async Task<IActionResult> Index()
        {
            // 建議：未來這裡應該加上 .Where() 來過濾只顯示「當前登入使用者」參加的旅程
            var trips = await _context.Trips
                                      .Include(t => t.TripMembers)
                                      .ToListAsync();

            return View(trips);
        }

        // 2. 帳務詳情頁 (原本的 Detail)
        // 這是主要的記帳頁面
        public async Task<IActionResult> Detail(int? id)
        {
            if (id == null) return NotFound();

            var trip = await _context.Trips
                .Include(t => t.TripMembers).ThenInclude(tm => tm.User)  // 撈出成員與使用者資料
                .Include(t => t.Expenses).ThenInclude(e => e.Category)
                // 撈出付款人資訊
                .Include(t => t.Expenses)
                    .ThenInclude(e => e.ExpensePayers)
                    .ThenInclude(ep => ep.Member)
                    .ThenInclude(m => m.User)
                // 撈出分攤人資訊
                .Include(t => t.Expenses)
                    .ThenInclude(e => e.ExpenseParticipants)
                    .ThenInclude(ep => ep.User) // 這裡對應 TripMember
                    .ThenInclude(tm => tm.User) // 再連到 AspNetUser
                .FirstOrDefaultAsync(m => m.Id == id);

            if (trip == null) return NotFound();

            // 撈取所有類別傳給 View (用於下拉選單)
            ViewBag.Categories = await _context.Categories.ToListAsync();

            return View(trip);
        }

        // --- 處理刪除支出 ---
        [HttpPost]
        public async Task<IActionResult> DeleteExpense(int id)
        {
            var expense = await _context.Expenses.FindAsync(id);
            if (expense != null)
            {
                _context.Expenses.Remove(expense);
                await _context.SaveChangesAsync();
                return Json(new { success = true });
            }
            return Json(new { success = false, message = "找無此資料" });
        }

        // --- 處理 建立 或 編輯 支出 ---
        [HttpPost]
        public async Task<IActionResult> SaveExpense(int? id, int tripId, string title, decimal amount, DateTime date, int? categoryId, string payersJson, string partsJson)
        {
            using var transaction = await _context.Database.BeginTransactionAsync();
            try
            {
                // 1. 基本檢查
                if (string.IsNullOrEmpty(payersJson) || string.IsNullOrEmpty(partsJson))
                    return Json(new { success = false, message = "付款人或分攤人資料遺失" });

                var trip = await _context.Trips.FindAsync(tripId);
                if (trip == null) return Json(new { success = false, message = "旅程不存在" });

                // 2. 計算天數 (依據旅程開始日期計算是第幾天)
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

                    // 清除舊的關聯資料，準備重新寫入
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

                // 檢查類別是否存在，不存在就存 null
                if (categoryId.HasValue && await _context.Categories.AnyAsync(c => c.CategoryId == categoryId.Value))
                {
                    expense.CategoryId = categoryId.Value;
                }
                else
                {
                    expense.CategoryId = null;
                }

                await _context.SaveChangesAsync();

                // 4. 處理付款人
                var payersDict = JsonSerializer.Deserialize<Dictionary<string, decimal>>(payersJson);
                if (payersDict != null)
                {
                    foreach (var kvp in payersDict)
                    {
                        // 確保 Key 轉成 int 成功 (MemberId)
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
                        // 確保 Key 轉成 int 成功 (UserId / MemberId)
                        if (kvp.Value > 0 && int.TryParse(kvp.Key, out int memberId))
                        {
                            _context.ExpenseParticipants.Add(new ExpenseParticipant
                            {
                                ExpenseId = expense.ExpenseId,
                                TripId = tripId,
                                UserId = memberId, // 注意：這裡 Models 屬性名為 UserId，但實際存放的是 TripMemberId
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
                // 回傳錯誤訊息方便前端除錯
                return Json(new { success = false, message = "存檔失敗：" + ex.Message + (ex.InnerException != null ? " | " + ex.InnerException.Message : "") });
            }
        }
    }
}