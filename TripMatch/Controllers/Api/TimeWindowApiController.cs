using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models.DTOs.TimeWindow;
using TripMatch.Services;

namespace TripMatch.Controllers.Api
{
    [Route("api/timewindow")]
    [ApiController]
    [Authorize]
    public class TimeWindowApiController : ControllerBase
    {
        private readonly TimeWindowService _timeWindowService;

        public TimeWindowApiController(TimeWindowService timeWindowService)
        {
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
            var status = await _timeWindowService.GetGroupStatusAsync(groupId);

            if (status == null)
                return NotFound(new { message = "找不到群組" });

            return Ok(status);
        }

        // 4. 儲存偏好 (PUT /api/timewindow/{groupId}/preferences)
        [HttpPut("{groupId}/preferences")]
        public async Task<IActionResult> UpsertPreferences(int groupId, [FromBody] UpsertPreferenceRequest request)
        {
            int userId = User.GetUserId();
            var result = await _timeWindowService.UpsertPreferenceAsync(groupId, userId, request);
            return Ok(result);
        }

        // 5. 提交時間 (POST /api/timewindow/{groupId}/available)
        [HttpPost("{groupId}/available")]
        public async Task<IActionResult> SubmitAvailability(int groupId, [FromBody] List<AvailableSlotInput> slots)
        {
            int userId = User.GetUserId();
            await _timeWindowService.SetAvailableSlotsAsync(groupId, userId, slots);
            return Ok(new { message = "時間已成功送出" });
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
                var recommendations = await _timeWindowService.GenerateRecommandationsAsync(groupId);
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
        public async Task<IActionResult> Vote(int groupId, [FromBody] List<int> recommendationIds)
        {
            try
            {
                int userId = User.GetUserId();
                var newCounts = await _timeWindowService.SubmitVotesAsync(groupId, userId, recommendationIds);

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

