using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Linq;
using System.Security.Claims;
using TripMatch.Models;
using TripMatch.Models.DTOs.TimeWindow;
using TripMatch.Services;

namespace TripMatch.Controllers
{
    [Authorize]
    public class MatchController : Controller
    {
        private readonly TravelDbContext _context;
        private readonly TimeWindowService _timeWindowService;

        public MatchController(TravelDbContext context, TimeWindowService timeWindowService)
        {
            _context = context;
            _timeWindowService = timeWindowService;
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

        public async Task<IActionResult> CalendarCheck(int id)
        {
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdStr, out int userId)) return RedirectToAction("Login", "Auth");

            // 1. 檢查這個人 (userId) 在這個群組 (id) 有沒有提交過時間
            // 只要 MemberTimeSlots 有他的資料，就代表他填過了 (或是你可以檢查 GroupMembers 的 SubmittedAt)
            bool hasSubmitted = await _context.MemberTimeSlots
                .AnyAsync(s => s.GroupId == id && s.UserId == userId);

            // 2. 設定 ViewData
            // 如果「還沒提交 (false)」，ShowPrompt 就是 true
            ViewData["ShowCalendarPrompt"] = !hasSubmitted;

            // 傳 GroupId 給前端 JS 用 (如果你沒用 ViewModel 傳的話)
            ViewData["GroupId"] = id;

            // 傳 Group 資訊給 View 顯示
            var group = await _context.TravelGroups.FindAsync(id);
            return View(group);
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
                    Id = g.Id,
                    City = g.Name,

                    // 原本的寫法 (如果 Parent 為 null 就給空字串)
                    Country = g.Parent != null ? g.Parent.Name : "",

                    // ★★★ 關鍵：補上這一行！ ★★★
                    // 這樣前端接到的 JSON 就會有 countryCode 這個屬性了
                    CountryCode = g.CountryCode
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

            var hotLocations = await _context.GlobalRegions
                .Include(x => x.Parent) // 記得 Include Parent 才能抓到國家名
                .Where(x => x.IsHot)    // 篩選熱門地點
                .Select(x => new LocationItem
                {
                    Id = x.Id,
               
                    // ★ 1. 修正地名：把 Name 對應給 City
                    City = x.Name,
               
                    // ★ 2. 修正國家名：如果 Parent 存在就抓 Name
                    Country = x.Parent != null ? x.Parent.Name : "",
               
                    // ★ 3. 補上代碼：把 CountryCode 對應過去
                    CountryCode = x.CountryCode
                })
                .ToListAsync();

            var viewModel = new PreferencesViewModel
            {
                GroupId = groupId,
                InviteCode = groupInfo.InviteCode,
                TargetNumber = groupInfo.TargetNumber,
                JoinedCount = joinedCount,
                SubmittedCount = submittedCount,
                MySelectedLocations = mySavedLocs,

                HotLocations = hotLocations,
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

        [HttpGet]
        public async Task<IActionResult> Recommendations(int id) // id = GroupId
        {
            // 1. 驗證登入
            var userIdStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdStr, out int userId))
            {
                return RedirectToAction("Login", "Auth");
            }

            // 2. 取得群組資訊 (為了 TargetNumber)
            var group = await _context.TravelGroups.FindAsync(id);
            if (group == null) return NotFound();

            // 3. 呼叫 Service
            // (A) 取得共同時間段 (Time Ranges)
            var timeRanges = await _timeWindowService.GetCommonTimeRangesAsync(id);

            // (B) 取得 DB 方案 (這裡必須用舊拼字 Recommandation 接 Service 回傳的資料)
            List<Recommandation> dbEntities = await _timeWindowService.GenerateRecommendationsAsync(id);

            // 4. 建立 ViewModel (開始使用正確拼字)
            var viewModel = new RecommendationViewModel
            {
                TripId = id,
                TargetCount = group.TargetNumber,
                CurrentUserId = userId.ToString()
            };

            // 5. 轉換 - 時間段篩選器 (TimeSlots)
            int slotIndex = 1;
            foreach (var range in timeRanges)
            {
                // 產生唯一 ID (e.g. "20250601-20250605")
                string slotId = $"{range.StartDate:yyyyMMdd}-{range.EndDate:yyyyMMdd}";

                viewModel.TimeSlots.Add(new TimeSlotFilterDto
                {
                    Id = slotId,
                    Label = $"時段 {slotIndex++}",
                    DateRange = $"{range.StartDate:MM/dd} - {range.EndDate:MM/dd}",
                    AvailableCount = range.AttendanceCount,
                    Duration = range.Days
                });
            }

            // 6. 轉換 - 方案卡片 (OptionCards)
            // 將 dbEntities (Recommandation) -> viewModel.OptionCards (OptionCardViewModel)
            foreach (var entity in dbEntities)
            {
                // 用日期反查 TimeSlot 資訊 (為了拿到「幾人參加」)
                var rangeDto = timeRanges.FirstOrDefault(r =>
                    r.StartDate == DateOnly.FromDateTime(entity.StartDate) &&
                    r.EndDate == DateOnly.FromDateTime(entity.EndDate));

                string slotId = rangeDto != null
                    ? $"{rangeDto.StartDate:yyyyMMdd}-{rangeDto.EndDate:yyyyMMdd}"
                    : "unknown";

                int attendCount = rangeDto?.AttendanceCount ?? 0;

                viewModel.OptionCards.Add(new OptionCardViewModel
                {
                    RecommendationId = entity.Index, // DB Primary Key
                    PlaceName = entity.Location,
                    TimeSlotId = slotId,
                    DateRange = $"{entity.StartDate:MM/dd} - {entity.EndDate:MM/dd}",
                    AvailableMembersCount = attendCount,
                    Price = entity.Price,
                    CurrentVotes = entity.Vote,
                    // 暫時設為 false，之後做投票功能時再補上查詢邏輯
                    IsVotedByCurrentUser = false
                });
            }

            // 回傳正確命名的 View
            return View(viewModel);
        }

        // [API] 處理投票 (給前端 AJAX 呼叫用)
        [HttpPost]
        public IActionResult Vote([FromBody] VoteRequestDto request)
        {
            // 這裡實作寫入資料庫邏輯
            // _matchService.Vote(request.OptionId, request.UserId);

            // MVP 簡單回傳成功
            return Json(new { success = true, newCount = request.CurrentCount + 1 });
        }

        // 簡單的 DTO 放在這或獨立檔案皆可
        public class VoteRequestDto
        {
            public string OptionId { get; set; }
            public string UserId { get; set; }
            public int CurrentCount { get; set; } // 模擬用，實際應該從 DB 查
        }
    }
}
