using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;
using TripMatch.Filters;
using TripMatch.Models;
using TripMatch.Models.DTOs.TimeWindow;

namespace TripMatch.Controllers
{
    
    public class TripController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly ITagUserId _tagUserId;
        private readonly TripServices _tripServices;
        private readonly TravelDbContext _context;
        private readonly TimeWindowService _timeWindowService;
        public TripController(ILogger<HomeController> logger, ITagUserId tagUserId, TripServices tripServices, TravelDbContext context, TimeWindowService timeWindowService)
        {
            _logger = logger;
            _tagUserId = tagUserId;
            _tripServices = tripServices;
            _context = context;
            _timeWindowService = timeWindowService;
        }
        [Authorize]
        public async Task<IActionResult> Index()
        {

            var user = _tagUserId.UserId;
            ViewBag.TaggedUserId = user;
            var vm = await _tripServices.GetMyTripsAsync(user);
            return View(vm);
        }
      
        public IActionResult Create()
        {
            return View();
        }

        [Authorize]
        [TripMemberAuthorize]
        public IActionResult Edit(int id)
        {
            return View(id);
        }

        [HttpGet("Trip/Join/{inviteCode}")]
        public IActionResult Join(string inviteCode)
        {
            if (string.IsNullOrEmpty(inviteCode))
            {
                return RedirectToAction("Index", "Home");
            }

            // 將邀請碼傳給 View，稍後前端 JS 會用這個碼去呼叫 API 抓資料
            ViewBag.InviteCode = inviteCode;
            return View();
        }

        //[Authorize]
        //[HttpGet("Trip/GoMatch/{groupId:int}")]
        //public async Task<IActionResult> GoMatch(int groupId)
        //{
        //    var userId = _tagUserId.UserId;
        //    if (userId is null) return Unauthorized();

        //    // 1.嘗試推進ststus
        //    string currentStatus;
        //    try
        //    {
        //        currentStatus = await _timeWindowService.TryAdvanceStatusAsync(groupId);
        //    }
        //    catch
        //    {
        //        return NotFound();
        //    }

        //    // 2. 如果已經進到投票 / 結果 -> 直接導頁
        //    if(currentStatus == GroupStatus.VOTING)
        //        return Redirect($"/Match/Recommendations/{groupId}");

        //    if (currentStatus == GroupStatus.RESULT)
        //        return Redirect($"Match/Result/{groupId}");

        //    if (currentStatus == GroupStatus.CANCELLED)
        //        return Redirect($"/Trip/Index");

        //    // 3. PREF 階段 -> 三段式
        //    var my = await _timeWindowService.GetMyStatusAsync(groupId, userId.Value);

        //    var json = System.Text.Json.JsonSerializer.Serialize(my);
        //    var doc = System.Text.Json.JsonDocument.Parse(json);
        //    var root = doc.RootElement;

        //    bool hasPreferences = root.TryGetProperty("hasPreferences", out var hp) && hp.GetBoolean();
        //    bool hasSelectedTimeRange = root.TryGetProperty("hasSelectedTimeRange", out var ht) && ht.GetBoolean();
        //    bool isSubmitted = root.TryGetProperty("isSubmitted", out var sub) && sub.GetBoolean();

        //    // 三段式規則
        //    if (!hasPreferences)
        //        return Redirect($"/Match/Preferences/{groupId}");

        //    if (!hasSelectedTimeRange || !isSubmitted)
        //        return Redirect($"/Match/Availability/{groupId}");

        //    return Redirect($"/Match/CalendarCheck/{groupId}");



        //}

        
    }
}
