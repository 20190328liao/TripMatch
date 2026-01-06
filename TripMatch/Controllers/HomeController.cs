using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models;
using TripMatch.Services;
using TripMatch.Extensions;

namespace TripMatch.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        private readonly TagUserId _tagUserId;// 加上欄位宣告


        public HomeController(ILogger<HomeController> logger, TagUserId tagUserId)
        {
            _logger = logger;
            _tagUserId = tagUserId;
        }

        // 等注入：在 View 使用 ViewBag.TaggedUserId 檢查是否有值

        public IActionResult Index()
        {
            // 優先用注入的 TagUserId，若為 null 則 fallback 備援機制 到 HttpContext extension
            var userId = _tagUserId?.UserId ?? HttpContext.GetTaggedUserId();
            ViewBag.TaggedUserId = userId;
            return View();
        }

        public IActionResult Privacy()
        {
            return View();
        }      

       

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
