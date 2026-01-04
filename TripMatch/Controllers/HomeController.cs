using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;
using TripMatch.Models;

namespace TripMatch.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;

        public HomeController(ILogger<HomeController> logger)
        {
            _logger = logger;
        }

        //等注入
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Privacy()
        {
            return View();
        }

        #region 登入相關頁面

        #endregion

        #region 時間媒合相關頁面

        #endregion

        #region 行程相關頁面
        public IActionResult MyTrip()
        {
            return View("~/Views/Trip/index.cshtml");
        }

        public IActionResult CreateTrip()
        {
            return View("~/Views/Trip/createTrip.cshtml");
        }

        [HttpPost]
        public IActionResult EditTrip()
        {
            return View("~/Views/Trip/editTrip.cshtml");
        }
        #endregion

        #region 景點探索相關頁面

        #endregion

        #region 記帳相關頁面

        #endregion

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
