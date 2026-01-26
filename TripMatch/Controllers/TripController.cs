using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Services;
using TripMatch.Filters;

namespace TripMatch.Controllers
{
    
    public class TripController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly ITagUserId _tagUserId;
        private readonly TripServices _tripServices;
        public TripController(ILogger<HomeController> logger, ITagUserId tagUserId, TripServices tripServices)
        {
            _logger = logger;
            _tagUserId = tagUserId;
            _tripServices = tripServices;
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
    }
}
