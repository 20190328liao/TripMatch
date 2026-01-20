using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Security.Claims;
using TripMatch.Models;
using TripMatch.Models.DTOs.TimeWindow;

namespace TripMatch.Controllers
{
    [Authorize]
    public class MatchController : Controller
    {
        private readonly TravelDbContext _context;

        public MatchController(TravelDbContext context)
        {
            _context = context;
        }

        public IActionResult Index()
        {
            return RedirectToAction("Index", "Home");
        }

        [HttpGet]
        public IActionResult Create()
        {
            return View();
        }

        [HttpGet("Match/Invite/{groupId}")]
        public IActionResult Invite(int groupId)
        {
            ViewBag.GroupId = groupId;
            return View();
        }

        [HttpGet("/Match/CalendarCheck/{groupId}")]
        public async Task<IActionResult> CalendarCheck(int groupId)
        {
            ViewBag.GroupId = groupId;

            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (int.TryParse(userIdStr, out int userId))
            {
                bool hasCalendarData = await _context.LeaveDates.AnyAsync(l => l.UserId == userId);

                // 傳遞給前端：true = 有資料(不用跳窗)，false = 沒資料(要跳窗)
                ViewBag.HasCalendarData = hasCalendarData;
            }
            else
            {
                ViewBag.HasCalendarData = false;
            }

            return View();
        }

        [HttpGet("/Match/Join/{inviteCode}")]
        public IActionResult Join(string inviteCode)
        {
            ViewBag.InviteCode = inviteCode;
            return View();
        }

        public async Task<IActionResult> GetLocations()
        {
            var locations = await _context.GlobalRegions
               .Include(g => g.Parent)
               .Where(g => g.Level == 2 && g.IsHot)
               .OrderBy(g => g.Id)
               .Select(g => new
               {
                   id = g.Id,
                   city = g.Name,
                   country = g.Parent != null ? g.Parent.Name : ""
               })
               .ToListAsync();

            return Ok(locations);
        }

        [HttpGet("/Match/Preferences/{groupId}")]
        public async Task<IActionResult> Preferences(int groupId)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            int.TryParse(userIdStr, out int userId);

            var groupInfo = await _context.TravelGroups
                .Where(g => g.GroupId == groupId)
                .Select(g => new { g.InviteCode, g.TargetNumber })
                .FirstOrDefaultAsync();

            if (groupInfo == null)
            {
                return NotFound("找不到該群組");
            }

             var members = await _context.GroupMembers
                .Where(m => m.GroupId == groupId)
                .Select(m => new { m.SubmittedAt })
                .ToListAsync();

            int joinedCount = members.Count;
            int submittedCount = members.Count(m => m.SubmittedAt != null);

            var myPref = await _context.Preferences
        .FirstOrDefaultAsync(p => p.GroupId == groupId && p.UserId == userId);

            List<string> mySavedLocs = new List<string>();
            if (myPref != null && !string.IsNullOrEmpty(myPref.PlacesToGo))
            {
                mySavedLocs = myPref.PlacesToGo.Split(',', StringSplitOptions.RemoveEmptyEntries).ToList();
            }

            var hotRegions = await _context.GlobalRegions
                .Include(g => g.Parent)
                .Where(g => g.Level == 2 && g.IsHot)
                .Take(12)
                .ToListAsync();

            var viewModel = new PreferencesViewModel
            {
                GroupId = groupId,
                InviteCode = groupInfo.InviteCode,
                TargetNumber = groupInfo.TargetNumber,
                JoinedCount = joinedCount,
                SubmittedCount = submittedCount,
                MySelectedLocations = mySavedLocs,

                HotLocations = hotRegions.Select(g => new LocationItem
                {
                    Id = g.Id,
                    City = g.Name,
                    Country = g.Parent != null ? g.Parent.Name : "未知"
                }).ToList()
            };

            return View(viewModel);
        }

        [HttpPost("api/match/preferences")]
        public async Task<IActionResult> SavePreferences([FromBody] PreferenceInput input)
        {
            // 1. 取得當前 User ID
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdStr, out int userId))
            {
                return Unauthorized();
            }

            // 2. 查詢資料庫中的偏好設定
            var prefer = await _context.Preferences
                .FirstOrDefaultAsync(m => m.GroupId == input.GroupId && m.UserId == userId);

            // 錯誤修正：這裡原本寫 if (m == null)，但在這個範圍 m 已經不存在了，要檢查 prefer
            if (prefer == null)
            {
                // 如果還沒有偏好紀錄，照理說應該要新增一筆，或者回傳錯誤
                // 這裡假設這是一個 Update 操作，若找不到則回傳錯誤
                return NotFound(new { message = "找不到您的偏好設定紀錄，或您不是此群組成員" });
            }

            // 3. 資料對應與轉型 (Data Mapping)

            // 處理 HotelBudget (String -> Int?)
            if (int.TryParse(input.HotelBudget, out int budgetVal))
            {
                prefer.HotelBudget = budgetVal;
            }
            else
            {
                prefer.HotelBudget = null; // 解析失敗或空字串視為不設限
            }

            // 處理 Transfer (String -> Bool)
            // 假設前端傳來 "true", "True", "yes" 等
            bool.TryParse(input.Transfer, out bool transferBool);
            prefer.Tranfer = transferBool; // 注意：你的 Model 拼字是 Tranfer (少 s)

            // 處理 HotelRating (String -> Int?)
            // 錯誤修正：InputModel 裡是 HotelRating，不是 Stars
            if (input.HotelRating == "flex" || string.IsNullOrWhiteSpace(input.HotelRating))
            {
                prefer.HotelRating = null;
            }
            else if (int.TryParse(input.HotelRating, out int starValue))
            {
                prefer.HotelRating = starValue;
            }

            // 處理地點 (List<int> -> String)
            // 錯誤修正：變數是 prefer，且 Model 欄位是 PlacesToGo
            if (input.SelectedLocations != null && input.SelectedLocations.Any())
            {
                prefer.PlacesToGo = string.Join(",", input.SelectedLocations);
            }
            else
            {
                prefer.PlacesToGo = null;
            }

            prefer.CreatedAt = DateTime.Now; // 更新時間

            await _context.SaveChangesAsync();

            return Ok(new { message = "偏好已儲存" });
        }

        [HttpGet("api/timewindow/{groupId}/status")]
        public async Task<IActionResult> GetGroupStatus(int groupId)
        {
            // 錯誤修正：DbSet 名稱推測為 GroupMembers (請確認 ApplicationDbContext)
            // 錯誤修正：欄位是 GroupId
            var members = await _context.GroupMembers
                .Where(m => m.GroupId == groupId)
                .ToListAsync();

            if (!members.Any()) return NotFound(new { message = "找不到群組成員" });

            int totalCount = members.Count;

            // 錯誤修正：使用 SubmittedAt.HasValue 來判斷是否已提交
            int submittedCount = members.Count(m => m.SubmittedAt.HasValue);

            string status = "WAITING";
            // 邏輯：所有人都有提交時間 (SubmittedAt != null) 才算完成
            if (totalCount > 0 && submittedCount == totalCount)
            {
                status = "COMPLETED";
            }

            return Ok(new
            {
                status = status,
                memberCount = totalCount,
                submittedCount = submittedCount,
            });
        }
    }
}
