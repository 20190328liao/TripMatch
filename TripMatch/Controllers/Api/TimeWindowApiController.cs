using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models.DTOs.TimeWindow;
using TripMatch.Services;
using Microsoft.EntityFrameworkCore;
using TripMatch.Models;

namespace TripMatch.Controllers.Api
{
    [Route("api/timewindow")]
    [ApiController]
    [Authorize]
    public class TimeWindowApiController : ControllerBase
    {
        private readonly TravelDbContext _context;
        private readonly TimeWindowService _timeWindowService;

        public TimeWindowApiController(TravelDbContext context, TimeWindowService timeWindowService)
        {
            _context = context;
            _timeWindowService = timeWindowService;
        }

        // 1. 開團 (POST /api/timewindow/create)
        [HttpPost("create")]
        public async Task<IActionResult> CreateGroup([FromBody] CreateGroupRequest request)
        {
            int userId = User.GetUserId();

            var group = await _timeWindowService.CreateGroupAsync(userId, request);

            return Ok(new
            {
                message = "開團成功",
                groupId = group.GroupId,
                inviteCode = group.InviteCode
            });
        }

        // 2. 加入 (POST /api/timewindow/join)
        [HttpPost("join")]
        public async Task<IActionResult> JoinGroup([FromBody] JoinGroupRequest request)
        {
            int userId = User.GetUserId();

            try
            {
                var member = await _timeWindowService.JoinGroupAsync(userId, request);
                return Ok(new { message = "加入成功", groupId = member.GroupId });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }

        // 3. 查詢狀態 (GET /api/timewindow/{groupId}/status)
        [HttpGet("{groupId}/status")]
        public async Task<IActionResult> GetGroupStatus(int groupId)
        {
            var group = await _context.TravelGroups.FirstOrDefaultAsync(g => g.GroupId == groupId);
            if (group == null) return NotFound(new { message = "找不到該群組" });

            Console.WriteLine($"[DEBUG] GroupID: {group.GroupId}");
            Console.WriteLine($"[DEBUG] DB DateStart: {group.DateStart}");
            Console.WriteLine($"[DEBUG] DB TravelDays: {group.TravelDays}");
            // 1. 【關鍵修正】分母必須是「目標人數 (TargetNumber)」
            // 如果 TargetNumber 是 0 (舊資料可能沒設)，才退而求其次用現有人數
            int totalTarget = group.TargetNumber > 0 ? group.TargetNumber : await _context.GroupMembers.CountAsync(m => m.GroupId == groupId);

            // 2. 取得「已提交」的人數 (檢查 SubmittedAt 不為 null)
            int submittedCount = await _context.GroupMembers
                .CountAsync(m => m.GroupId == groupId && m.SubmittedAt != null);

            // 3. 判定是否完成：必須「已提交人數」大於等於「目標人數」
            // 只有全員都交了，isComplete 才是 true
            bool isComplete = submittedCount >= totalTarget;

            return Ok(new
            {
                dateStart = group.DateStart,
                dateEnd = group.DateEnd,
                travelDays = group.TravelDays,
                status = isComplete ? "COMPLETED" : "WAITING",
                isComplete = isComplete,

                // 讓前端顯示進度 (例如: 1 / 4)
                submittedCount = submittedCount,
                memberCount = totalTarget
            });
        }

        // 補：取得群組詳細資訊
        [HttpGet("{groupId}/details")]
        public async Task<IActionResult> GetGroupDetails(int groupId)
        {
            dynamic groupData = await _timeWindowService.GetGroupStatusAsync(groupId);

            if (groupData == null)
                return NotFound(new { message = "找不到群組" });

            string code = groupData.inviteCode;

            return Ok(new
            {
                groupId = groupId,
                inviteCode = code,
                inviteLink = $"{Request.Scheme}://{Request.Host}/Match/Join/{code}"
            });
        }

        // 4. 儲存偏好 (PUT /api/timewindow/{groupId}/preferences)
        [HttpPut("{groupId}/preferences")]
        public async Task<IActionResult> UpsertPreferences(int groupId, [FromBody] UpsertPreferenceRequest request)
        {
            int userId = User.GetUserId();
            await _timeWindowService.UpsertPreferenceAsync(groupId, userId, request);
            return Ok(new { message = "儲存成功", groupId = groupId });
        }

        // 5. 提交時間 (POST /api/timewindow/{groupId}/available)
        [HttpPost("{groupId}/available")]
        public async Task<IActionResult> SubmitAvailability(int groupId, [FromBody] List<AvailableSlotInput> slots)
        {
            var userIdStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (!int.TryParse(userIdStr, out int userId)) return Unauthorized();

            // 1. 存檔 (呼叫 Service)
            await _timeWindowService.SaveAvailabilityAsync(groupId, userId, slots);

            // ---------------------------------------------------------
            // ★ 修正邏輯：使用 GroupMembers 計算總人數
            // ---------------------------------------------------------

            // A. 取得群組總人數
            // 從 GroupMembers 表計算此群組有多少人
            int totalMembers = await _context.GroupMembers
                .CountAsync(gm => gm.GroupId == groupId);

            // ★ 注意：
            // 如果你的 "團主" 不在 GroupMembers 表裡面 (因為團主存在 TravelGroups.OwnerId)
            // 但團主也需要投票的話，這裡的人數可能要 +1
            // 這裡先假設 GroupMembers 包含所有要出遊的人 (含團主)
            if (totalMembers == 0) totalMembers = 1;

            // B. 取得已提交人數 (從 MemberTimeSlots 算)
            var submittedMembersCount = await _context.MemberTimeSlots
                .Where(m => m.GroupId == groupId)
                .Select(m => m.UserId)
                .Distinct()
                .CountAsync();

            // C. 判斷是否全員完成
            bool isComplete = (submittedMembersCount >= totalMembers);

            return Ok(new
            {
                message = "提交成功",
                isComplete = isComplete
            });
        }

        // 6. 取得推薦時間區段 (GET /api/timewindow/{groupId}/common-options)
        [HttpGet("{groupId}/common-options")]
        public async Task<IActionResult> GetCommonTimeRanges(int groupId)
        {
            var results = await _timeWindowService.GetCommonTimeRangesAsync(groupId);
            return Ok(results);
        }

        // 7. 查詢個人進度 (GET /api/timewindow/{groupId}/me)
        [HttpGet("{groupId}/me")]
        public async Task<IActionResult> GetMyStatus(int groupId)
        {
            int userId = User.GetUserId();
            var status = await _timeWindowService.GetMyStatusAsync(groupId, userId);
            if (status == null) return Unauthorized(new { message = "非群組成員" });

            return Ok(status);
        }

        // 8. 產生並取得完整方案 (GET /api/timewindow/{groupId}/generate-plans)
        [HttpGet("{groupId}/generate-plans")]
        public async Task<IActionResult> GeneratePlans(int groupId)
        {
            try
            {
                // Todo: 這一步會跑比較久 (因為要 Call 外部 API)，前端記得顯示 Loading
                var recommendations = await _timeWindowService.GenerateRecommendationsAsync(groupId);
                return Ok(recommendations);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "生成方案失敗", error = ex.Message });
            }
        }

        // 9. 取得個人在「此群組期間內」的可用時間 (GET /api/timewindow/{groupId}/my-schedule)
        [HttpGet("{groupId}/my-schedule")]
        public async Task<IActionResult> GetMyPersonalSchedule(int groupId)
        {
            int userId = User.GetUserId();
            var suggestions = await _timeWindowService.GetSuggestedPersonalScheduleAsync(groupId, userId);
            return Ok(suggestions);
        }

        // 10. 取得偏好 (GET)
        [HttpGet("{groupId}/preferences")]
        public async Task<IActionResult> GetMyPreferences(int groupId)
        {
            int userId = User.GetUserId();
            var pref = await _timeWindowService.GetMyPreferenceAsync(groupId, userId);
            if (pref == null)
            {
                return Ok(null);
            }
            return Ok(pref);
        }

        // 11. 取得已提交的時間 (GET)
        [HttpGet("{groupId}/available")]
        public async Task<IActionResult> GetMySubmittedSlots(int groupId)
        {
            int userId = User.GetUserId();
            var slots = await _timeWindowService.GetMyTimeSlotsAsync(groupId, userId);
            return Ok(slots);
        }

        // 12. 投票 (POST)
        [HttpPost("{groupId}/vote")]
        public async Task<IActionResult> Vote(int groupId, [FromBody] List<int> Index)
        {
            try
            {
                int userId = User.GetUserId();
                var newCounts = await _timeWindowService.SubmitVotesAsync(groupId, userId, Index);

                return Ok(new
                {
                    message = "投票成功",
                    updatedCounts = newCounts
                });
            }
            catch (Exception ex)
            {
                return BadRequest(new { message = ex.Message });
            }
        }
    }
}

