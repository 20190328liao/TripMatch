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

        //µ¥ª`¤J
        public IActionResult Index()
        {
            return View();
        }

        public IActionResult Privacy()
        {
            return View();
        }

        public IActionResult MyTrip()
        {
            return View("~/Views/Trip/index.cshtml");
        }

        public IActionResult CreateTrip()
        {
            return View("~/Views/Trip/createTrip.cshtml");
        }

        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public IActionResult Error()
        {
            return View(new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });
        }
    }
}
